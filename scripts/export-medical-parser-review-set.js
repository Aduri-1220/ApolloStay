const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const recordsPath = path.join(projectRoot, "data", "medical-records.json");
const outputPath = path.join(projectRoot, "data", "medical-parser-review-set.jsonl");

function loadRecords() {
  if (!fs.existsSync(recordsPath)) {
    return [];
  }

  return JSON.parse(fs.readFileSync(recordsPath, "utf8"));
}

function toJsonlLine(record) {
  return JSON.stringify({
    id: record.id,
    userId: record.userId,
    filename: record.filename,
    uploadedAt: record.uploadedAt,
    status: record.status || "unknown",
    provider: record.extracted?.provider || "unknown",
    confidence: record.extracted?.confidence ?? null,
    summary: record.extracted?.summary || "",
    recordDate: record.extracted?.recordDate || null,
    diagnoses: record.extracted?.diagnoses || [],
    medications: record.extracted?.medications || [],
    allergies: record.extracted?.allergies || [],
    dietaryFlags: record.extracted?.dietaryFlags || [],
    labResults: record.extracted?.labResults || [],
    vitals: record.extracted?.vitals || [],
    storedPath: record.storedPath
  });
}

const records = loadRecords();
const content = records.map(toJsonlLine).join("\n");
fs.writeFileSync(outputPath, content ? `${content}\n` : "", "utf8");

console.log(`Exported ${records.length} records to ${outputPath}`);
