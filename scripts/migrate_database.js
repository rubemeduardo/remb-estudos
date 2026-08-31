const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^"|"$/g, "");
      }
    });
}

if (!process.env.DATABASE_URL && (!process.env.DB_USER || !process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_PASS)) {
  console.error("Banco de dados nao configurado. Defina DATABASE_URL ou DB_USER, DB_HOST, DB_NAME e DB_PASS.");
  process.exit(1);
}

const poolConfig = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined
};
if (process.env.DATABASE_URL) poolConfig.connectionString = process.env.DATABASE_URL;

const pool = new Pool(poolConfig);
const migrationsDir = path.join(__dirname, "..", "migrations");

async function main() {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error("Pasta migrations nao encontrada.");
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(120) PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const appliedResult = await client.query("SELECT id FROM schema_migrations");
    const applied = new Set(appliedResult.rows.map((row) => row.id));
    const executed = [];

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8").trim();
      if (!sql) continue;
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
      executed.push(file);
    }

    await client.query("COMMIT");
    console.log(JSON.stringify({ ok: true, executed, skipped: files.length - executed.length }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
