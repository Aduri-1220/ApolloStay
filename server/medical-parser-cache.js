const fs = require("node:fs");
const { createHash } = require("node:crypto");
const { sanitizeMedicalRecord } = require("./medical-utils");
const { isPostgresEnabled, query } = require("./postgres");

const MEDICAL_PARSER_CACHE_VERSION = 3;

function ensureCacheFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "[]\n", "utf8");
  }
}

function loadCache(filePath) {
  ensureCacheFile(filePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveCache(filePath, entries) {
  fs.writeFileSync(filePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

function computeDocumentHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizeCachedParse(entry) {
  if (!entry || entry.version !== MEDICAL_PARSER_CACHE_VERSION) {
    return null;
  }

  return sanitizeMedicalRecord(entry.parsed || {}, {
    provider: entry.parsed?.provider || "local",
    confidence: typeof entry.parsed?.confidence === "number" ? entry.parsed.confidence : 0.1,
    fallbackSummary: "Imported medical record"
  });
}

async function getCachedMedicalParse(filePath, hash) {
  if (!isPostgresEnabled()) {
    const entry = loadCache(filePath).find((item) => item.hash === hash);
    return normalizeCachedParse(entry);
  }

  const result = await query(
    `
      SELECT raw
      FROM medical_parser_cache
      WHERE hash = $1
      LIMIT 1
    `,
    [hash]
  );

  return normalizeCachedParse(result.rows[0]?.raw || null);
}

async function setCachedMedicalParse(filePath, { hash, filename, mimeType, parsed }) {
  const nextEntry = {
    hash,
    filename,
    mimeType,
    version: MEDICAL_PARSER_CACHE_VERSION,
    updatedAt: new Date().toISOString(),
    parsed
  };

  if (isPostgresEnabled()) {
    await query(
      `
        INSERT INTO medical_parser_cache (hash, version, updated_at, raw)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (hash)
        DO UPDATE SET
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          raw = EXCLUDED.raw
      `,
      [hash, nextEntry.version, nextEntry.updatedAt, JSON.stringify(nextEntry)]
    );
    return;
  }

  const entries = loadCache(filePath);
  const index = entries.findIndex((entry) => entry.hash === hash);
  if (index >= 0) {
    entries[index] = nextEntry;
  } else {
    entries.push(nextEntry);
  }
  saveCache(filePath, entries.slice(-200));
}

module.exports = {
  ensureCacheFile,
  loadCache,
  computeDocumentHash,
  getCachedMedicalParse,
  setCachedMedicalParse
};
