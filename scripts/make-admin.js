const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function resolveSqlitePath() {
  if (process.env.SQLITE_PATH) {
    return path.resolve(process.env.SQLITE_PATH);
  }

  const envLocalPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envLocalPath)) {
    return path.resolve("./data/demo.db");
  }

  const line = fs
    .readFileSync(envLocalPath, "utf8")
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.startsWith("SQLITE_PATH=") && !item.startsWith("#"));

  if (!line) {
    return path.resolve("./data/demo.db");
  }

  const value = line.slice("SQLITE_PATH=".length).trim();
  return path.resolve(value.replace(/^["']|["']$/g, ""));
}

const email = process.argv[2];
if (!email) {
  console.error("usage: node scripts/make-admin.js <email>");
  process.exit(1);
}

const dbPath = resolveSqlitePath();
if (!fs.existsSync(dbPath)) {
  console.error(`database not found: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);
db.prepare("UPDATE account SET role='admin' WHERE email=?").run(
  email.toLowerCase()
);
const row = db
  .prepare("SELECT email, role FROM account WHERE email=?")
  .get(email.toLowerCase());

if (!row) {
  console.error(`user not found in ${dbPath}`);
  process.exit(1);
}

console.log({ ...row, database: dbPath });
