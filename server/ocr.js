const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function writeTempSwiftScript() {
  const scriptPath = path.join(os.tmpdir(), `pulsepilot-vision-ocr-${Date.now()}.swift`);
  const source = `
import Foundation
import Vision
import AppKit
import PDFKit

let args = CommandLine.arguments
guard args.count > 1 else {
  fputs("Missing input path\\n", stderr)
  exit(1)
}

let inputPath = args[1]
let mimeType = args.count > 2 ? args[2] : "image"
let inputUrl = URL(fileURLWithPath: inputPath)

func recognize(cgImage: CGImage) throws -> String {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true

  let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
  try handler.perform([request])
  let observations = request.results ?? []
  let lines = observations.compactMap { $0.topCandidates(1).first?.string }
  return lines.joined(separator: "\\n")
}

func loadImageText(from imageUrl: URL) throws -> String {
  guard let image = NSImage(contentsOf: imageUrl) else {
    throw NSError(domain: "PulsePilotOCR", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to load image"])
  }

  var rect = NSRect(origin: .zero, size: image.size)
  guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
    throw NSError(domain: "PulsePilotOCR", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to create CGImage"])
  }

  return try recognize(cgImage: cgImage)
}

do {
  if mimeType == "application/pdf" {
    guard let document = PDFDocument(url: inputUrl) else {
      fputs("Failed to load PDF\\n", stderr)
      exit(2)
    }

    var pageTexts: [String] = []

    for pageIndex in 0..<document.pageCount {
      guard let page = document.page(at: pageIndex) else { continue }
      let thumbnail = page.thumbnail(of: NSSize(width: 2000, height: 2600), for: .mediaBox)
      var rect = NSRect(origin: .zero, size: thumbnail.size)
      guard let cgImage = thumbnail.cgImage(forProposedRect: &rect, context: nil, hints: nil) else { continue }
      let pageText = try recognize(cgImage: cgImage)
      if !pageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        pageTexts.append("[Page \\(pageIndex + 1)]\\n" + pageText)
      }
    }

    print(pageTexts.joined(separator: "\\n\\n"))
  } else {
    print(try loadImageText(from: inputUrl))
  }
} catch {
  fputs("Vision OCR failed: \\(error.localizedDescription)\\n", stderr)
  exit(4)
}
`;
  fs.writeFileSync(scriptPath, source, "utf8");
  return scriptPath;
}

function runVisionOcr(inputPath, mimeType = "image") {
  const scriptPath = writeTempSwiftScript();
  const moduleCachePath = path.join(os.tmpdir(), "pulsepilot-swift-module-cache");
  fs.mkdirSync(moduleCachePath, { recursive: true });

  try {
    return execFileSync("swift", [scriptPath, inputPath, mimeType], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
      env: {
        ...process.env,
        CLANG_MODULE_CACHE_PATH: moduleCachePath,
        SWIFT_MODULE_CACHE_PATH: moduleCachePath
      }
    }).trim();
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}

function extractPdfTextWithMacOcr(pdfPath) {
  if (!pdfPath) {
    return null;
  }

  try {
    return runVisionOcr(pdfPath, "application/pdf") || null;
  } catch {
    return null;
  }
}

function extractPdfFirstPageTextWithMacOcr(pdfPath) {
  const imagePath = rasterizePdfToImage(pdfPath);

  try {
    return runVisionOcr(imagePath, "image/png") || null;
  } catch {
    return null;
  } finally {
    fs.rmSync(imagePath, { force: true });
  }
}

function rasterizePdfToImage(pdfPath) {
  const outputPath = path.join(os.tmpdir(), `pulsepilot-pdf-preview-${Date.now()}.png`);
  execFileSync("sips", ["-s", "format", "png", pdfPath, "--out", outputPath], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"]
  });
  return outputPath;
}

function extractTextWithMacOcr({ mimeType, filePath }) {
  if (!filePath) {
    return null;
  }

  try {
    if (mimeType === "application/pdf") {
      return extractPdfTextWithMacOcr(filePath) || extractPdfFirstPageTextWithMacOcr(filePath);
    }

    const text = runVisionOcr(filePath, mimeType);
    return text || null;
  } catch {
    return null;
  }
}

function createOcrInputBuffer({ mimeType, filePath, buffer }) {
  if (mimeType?.startsWith("image/") && buffer) {
    return buffer;
  }

  if (mimeType === "application/pdf" && filePath) {
    const imagePath = rasterizePdfToImage(filePath);

    try {
      return fs.readFileSync(imagePath);
    } finally {
      fs.rmSync(imagePath, { force: true });
    }
  }

  return null;
}

module.exports = {
  extractTextWithMacOcr,
  extractPdfTextWithMacOcr,
  extractPdfFirstPageTextWithMacOcr,
  rasterizePdfToImage,
  createOcrInputBuffer
};
