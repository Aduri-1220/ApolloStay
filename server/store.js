const fs = require("node:fs");

function ensureStore(storePath) {
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, "[]\n", "utf8");
  }
}

function loadMealLogs(storePath) {
  ensureStore(storePath);
  const raw = fs.readFileSync(storePath, "utf8");
  return JSON.parse(raw);
}

function saveMealLogs(storePath, logs) {
  fs.writeFileSync(storePath, `${JSON.stringify(logs, null, 2)}\n`, "utf8");
}

module.exports = {
  ensureStore,
  loadMealLogs,
  saveMealLogs
};
