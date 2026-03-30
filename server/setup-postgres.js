const path = require("node:path");
const { runSqlFile, closePool, isPostgresEnabled } = require("./postgres");

async function main() {
  if (!isPostgresEnabled()) {
    throw new Error("DATABASE_URL is required to set up PostgreSQL.");
  }

  await runSqlFile(path.join(__dirname, "postgres-schema.sql"));
  console.log("PostgreSQL schema is ready.");
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
