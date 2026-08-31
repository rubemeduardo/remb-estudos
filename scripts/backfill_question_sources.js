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

async function upsertNamed(client, table, value) {
  const name = String(value || "").trim();
  if (!name) return null;
  const result = await client.query(
    `INSERT INTO ${table} (nome) VALUES ($1)
     ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome
     RETURNING id`,
    [name]
  );
  return result.rows[0].id;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT id, banca, orgao, ano, prova, numero, origem_importacao, raw_data
       FROM questoes
       WHERE status = 'ATIVA'`
    );

    let sourcesInserted = 0;
    const provaIds = new Map();

    for (const row of result.rows) {
      const raw = row.raw_data || {};
      const origemImportacao = row.origem_importacao || raw.origem_importacao || {};
      const banca = row.banca || raw.origem_questao?.banca || raw.banca || "";
      const orgao = row.orgao || raw.origem_questao?.orgao || raw.orgao || "";
      const sourceName = row.prova || raw.origem_questao?.prova || origemImportacao.arquivo || origemImportacao.arquivo_json || "";

      const bancaId = await upsertNamed(client, "bancas", banca);
      const orgaoId = await upsertNamed(client, "orgaos", orgao);

      let provaId = null;
      if (sourceName) {
        const concursoName = row.prova || orgao || banca || "Origem importada";
        const concurso = await client.query(
          `INSERT INTO concursos (nome, banca_id, orgao_id, ano)
           VALUES ($1::varchar, $2::int, $3::int, $4::int)
           ON CONFLICT (nome, ano) DO UPDATE
           SET banca_id = COALESCE(concursos.banca_id, EXCLUDED.banca_id),
               orgao_id = COALESCE(concursos.orgao_id, EXCLUDED.orgao_id)
           RETURNING id`,
          [concursoName, bancaId, orgaoId, Number.isFinite(Number(row.ano)) ? Number(row.ano) : null]
        );
        const key = `${sourceName}\u0000${concurso.rows[0].id}`;
        if (provaIds.has(key)) {
          provaId = provaIds.get(key);
        } else {
          const prova = await client.query(
            `INSERT INTO provas (nome, concurso_id)
             SELECT $1::varchar, $2::int
             WHERE NOT EXISTS (SELECT 1 FROM provas WHERE nome = $1::varchar AND concurso_id = $2::int)
             RETURNING id`,
            [sourceName, concurso.rows[0].id]
          );
          if (prova.rowCount > 0) {
            provaId = prova.rows[0].id;
          } else {
            const existing = await client.query("SELECT id FROM provas WHERE nome = $1 AND concurso_id = $2 LIMIT 1", [
              sourceName,
              concurso.rows[0].id
            ]);
            provaId = existing.rows[0]?.id || null;
          }
          provaIds.set(key, provaId);
        }
      }

      const originalNumber = Number.isFinite(Number(origemImportacao.numero_original))
        ? Number(origemImportacao.numero_original)
        : row.numero;
      const inserted = await client.query(
        `INSERT INTO questao_fontes (questao_id, tipo_fonte, prova_id, numero_original)
         SELECT $1::varchar, $2::varchar, $3::int, $4::int
         WHERE NOT EXISTS (
           SELECT 1
           FROM questao_fontes
           WHERE questao_id = $1::varchar
             AND tipo_fonte = $2::varchar
             AND prova_id IS NOT DISTINCT FROM $3::int
             AND numero_original IS NOT DISTINCT FROM $4::int
         )
         RETURNING id`,
        [row.id, row.prova ? "PROVA" : "LISTA", provaId, originalNumber]
      );
      sourcesInserted += inserted.rowCount;
    }

    await client.query("COMMIT");
    console.log(JSON.stringify({ ok: true, questionsScanned: result.rowCount, sourcesInserted }, null, 2));
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
