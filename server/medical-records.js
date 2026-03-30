const fs = require("node:fs");
const path = require("node:path");
const {
  sanitizeMedicalRecord,
  buildLowConfidenceRecord,
  hasCoreMedicalData,
  isLikelyGarbageText,
  getMedicalRecordStatus
} = require("./medical-utils");
const { parseMedicalText, LOCAL_PARSER_VERSION } = require("./local-parser");
const { isPostgresEnabled, query } = require("./postgres");

function ensureJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "[]\n", "utf8");
  }
}

function readMedicalRecordsRaw(filePath) {
  ensureJsonFile(filePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadMedicalRecords(filePath) {
  const parsed = readMedicalRecordsRaw(filePath);
  let changed = false;

  const sanitized = parsed.flatMap((record) => {
    const storedPath = typeof record.storedPath === "string" ? record.storedPath : "";
    if (storedPath) {
      try {
        const resolved = path.resolve(storedPath);
        if (!fs.existsSync(resolved)) {
          changed = true;
          return [];
        }
      } catch {
        changed = true;
        return [];
      }
    }

    let extracted = sanitizeMedicalRecord(record.extracted || {}, {
      provider: record.extracted?.provider || "local",
      confidence: typeof record.extracted?.confidence === "number" ? record.extracted.confidence : 0.1,
      fallbackSummary: "Imported medical record"
    });

    if (
      record.sourceText &&
      typeof record.sourceText === "string" &&
      record.sourceText.trim() &&
      (record.parserVersion || 0) < LOCAL_PARSER_VERSION
    ) {
      try {
        extracted = parseMedicalText(record.sourceText);
        changed = true;
      } catch {
        // Keep older extracted payload if reparsing fails.
      }
    }

    const shouldDowngrade =
      !hasCoreMedicalData(extracted) &&
      (isLikelyGarbageText(extracted.summary) || extracted.confidence < 0.3);

    const next = {
      ...record,
      parserVersion: LOCAL_PARSER_VERSION,
      status: getMedicalRecordStatus(
        shouldDowngrade
          ? buildLowConfidenceRecord({
              provider: extracted.provider || "local",
              summary: "Low-confidence extraction. This older record was sanitized because it contained unreadable PDF noise."
            })
          : extracted
      ),
      extracted: shouldDowngrade
        ? buildLowConfidenceRecord({
            provider: extracted.provider || "local",
            summary: "Low-confidence extraction. This older record was sanitized because it contained unreadable PDF noise."
          })
        : extracted
    };

    if (JSON.stringify(next) !== JSON.stringify(record)) {
      changed = true;
    }

    return [next];
  });

  if (changed) {
    saveMedicalRecords(filePath, sanitized);
  }

  return sanitized;
}

function saveMedicalRecords(filePath, records) {
  fs.writeFileSync(filePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}

function listMedicalRecordsForUser(filePath, userId) {
  if (isPostgresEnabled()) {
    return listMedicalRecordsForUserPostgres(userId);
  }
  return loadMedicalRecords(filePath)
    .filter((record) => record.userId === userId)
    .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
}

function listMedicalRecordsForUserFast(filePath, userId) {
  if (isPostgresEnabled()) {
    return listMedicalRecordsForUserFastPostgres(userId);
  }
  const records = readMedicalRecordsRaw(filePath);
  let changed = false;

  const existingRecords = records.flatMap((record) => {
    const storedPath = typeof record.storedPath === "string" ? record.storedPath : "";
    if (storedPath) {
      try {
        const resolved = path.resolve(storedPath);
        if (!fs.existsSync(resolved)) {
          changed = true;
          return [];
        }
      } catch {
        changed = true;
        return [];
      }
    }
    return [record];
  });

  if (changed) {
    saveMedicalRecords(filePath, existingRecords);
  }

  return existingRecords
    .filter((record) => record.userId === userId)
    .map((record) => ({
      ...record,
      extracted: sanitizeMedicalRecord(record.extracted || {}, {
        provider: record.extracted?.provider || "local",
        confidence: typeof record.extracted?.confidence === "number" ? record.extracted.confidence : 0.1,
        fallbackSummary: "Imported medical record"
      }),
      status: record.status || getMedicalRecordStatus(record.extracted || {})
    }))
    .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
}

async function listMedicalRecordsForUserPostgres(userId) {
  const result = await query(
    `
      SELECT raw
      FROM medical_records
      WHERE user_id = $1
      ORDER BY uploaded_at DESC NULLS LAST
    `,
    [userId]
  );

  return result.rows.map((row) => row.raw);
}

async function listMedicalRecordsForUserFastPostgres(userId) {
  const records = await listMedicalRecordsForUserPostgres(userId);
  return records.map((record) => ({
    ...record,
    extracted: sanitizeMedicalRecord(record.extracted || {}, {
      provider: record.extracted?.provider || "local",
      confidence: typeof record.extracted?.confidence === "number" ? record.extracted.confidence : 0.1,
      fallbackSummary: "Imported medical record"
    }),
    status: record.status || getMedicalRecordStatus(record.extracted || {})
  }));
}

function createMedicalRecord(filePath, record) {
  if (isPostgresEnabled()) {
    return createMedicalRecordPostgres(record);
  }
  const records = loadMedicalRecords(filePath);
  const nextRecord = {
    ...record,
    parserVersion: record.parserVersion || LOCAL_PARSER_VERSION,
    extracted: sanitizeMedicalRecord(record.extracted || {}, {
      provider: record.extracted?.provider || "local",
      confidence: typeof record.extracted?.confidence === "number" ? record.extracted.confidence : 0.1,
      fallbackSummary: "Imported medical record"
    }),
    status: getMedicalRecordStatus(
      sanitizeMedicalRecord(record.extracted || {}, {
        provider: record.extracted?.provider || "local",
        confidence: typeof record.extracted?.confidence === "number" ? record.extracted.confidence : 0.1,
        fallbackSummary: "Imported medical record"
      })
    )
  };
  records.push(nextRecord);
  saveMedicalRecords(filePath, records);
  return nextRecord;
}

async function createMedicalRecordPostgres(record) {
  const nextRecord = {
    ...record,
    parserVersion: record.parserVersion || LOCAL_PARSER_VERSION,
    extracted: sanitizeMedicalRecord(record.extracted || {}, {
      provider: record.extracted?.provider || "local",
      confidence: typeof record.extracted?.confidence === "number" ? record.extracted.confidence : 0.1,
      fallbackSummary: "Imported medical record"
    })
  };
  nextRecord.status = getMedicalRecordStatus(nextRecord.extracted);

  await query(
    `
      INSERT INTO medical_records (
        id, user_id, filename, mime_type, uploaded_at, status, parser_version,
        stored_path, object_key, object_url, raw
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
    `,
    [
      nextRecord.id,
      nextRecord.userId,
      nextRecord.filename,
      nextRecord.mimeType || null,
      nextRecord.uploadedAt || null,
      nextRecord.status || null,
      nextRecord.parserVersion,
      nextRecord.storedPath || null,
      nextRecord.objectKey || null,
      nextRecord.objectUrl || null,
      JSON.stringify(nextRecord)
    ]
  );

  return nextRecord;
}

function getMedicalRecordById(filePath, recordId, userId) {
  if (isPostgresEnabled()) {
    return getMedicalRecordByIdPostgres(recordId, userId);
  }
  return loadMedicalRecords(filePath).find((record) => record.id === recordId && record.userId === userId) || null;
}

async function getMedicalRecordByIdPostgres(recordId, userId) {
  const result = await query(
    `
      SELECT raw
      FROM medical_records
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    [recordId, userId]
  );
  return result.rows[0]?.raw || null;
}

function updateMedicalRecord(filePath, recordId, userId, updater) {
  if (isPostgresEnabled()) {
    return updateMedicalRecordPostgres(recordId, userId, updater);
  }
  const records = loadMedicalRecords(filePath);
  const index = records.findIndex((record) => record.id === recordId && record.userId === userId);

  if (index < 0) {
    return null;
  }

  const nextRecord = updater(records[index]);
  records[index] = nextRecord;
  saveMedicalRecords(filePath, records);
  return nextRecord;
}

async function updateMedicalRecordPostgres(recordId, userId, updater) {
  const current = await getMedicalRecordByIdPostgres(recordId, userId);
  if (!current) {
    return null;
  }

  const nextRecord = updater(current);
  await query(
    `
      UPDATE medical_records
      SET
        filename = $3,
        mime_type = $4,
        uploaded_at = $5,
        status = $6,
        parser_version = $7,
        stored_path = $8,
        object_key = $9,
        object_url = $10,
        raw = $11::jsonb
      WHERE id = $1 AND user_id = $2
    `,
    [
      recordId,
      userId,
      nextRecord.filename,
      nextRecord.mimeType || null,
      nextRecord.uploadedAt || null,
      nextRecord.status || null,
      nextRecord.parserVersion || LOCAL_PARSER_VERSION,
      nextRecord.storedPath || null,
      nextRecord.objectKey || null,
      nextRecord.objectUrl || null,
      JSON.stringify(nextRecord)
    ]
  );

  return nextRecord;
}

function deleteMedicalRecord(filePath, recordId, userId) {
  if (isPostgresEnabled()) {
    return deleteMedicalRecordPostgres(recordId, userId);
  }
  const records = loadMedicalRecords(filePath);
  const index = records.findIndex((record) => record.id === recordId && record.userId === userId);

  if (index < 0) {
    return null;
  }

  const [removed] = records.splice(index, 1);
  saveMedicalRecords(filePath, records);

  const storedPath = typeof removed?.storedPath === "string" ? removed.storedPath : "";
  if (storedPath) {
    try {
      const resolved = path.resolve(storedPath);
      if (fs.existsSync(resolved)) {
        fs.rmSync(resolved, { force: true });
      }
    } catch {
      // Keep record deletion successful even if uploaded-file cleanup fails.
    }
  }

  return removed;
}

async function deleteMedicalRecordPostgres(recordId, userId) {
  const existing = await getMedicalRecordByIdPostgres(recordId, userId);
  if (!existing) {
    return null;
  }

  await query("DELETE FROM medical_records WHERE id = $1 AND user_id = $2", [recordId, userId]);

  const storedPath = typeof existing?.storedPath === "string" ? existing.storedPath : "";
  if (storedPath) {
    try {
      const resolved = path.resolve(storedPath);
      if (fs.existsSync(resolved)) {
        fs.rmSync(resolved, { force: true });
      }
    } catch {
      // Keep record deletion successful even if uploaded-file cleanup fails.
    }
  }

  return existing;
}

module.exports = {
  ensureJsonFile,
  readMedicalRecordsRaw,
  loadMedicalRecords,
  saveMedicalRecords,
  listMedicalRecordsForUser,
  listMedicalRecordsForUserFast,
  createMedicalRecord,
  getMedicalRecordById,
  updateMedicalRecord,
  deleteMedicalRecord
};
