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
  console.error("Banco de dados não configurado. Defina DATABASE_URL ou DB_USER, DB_HOST, DB_NAME e DB_PASS.");
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

async function tableExists(client, tableName) {
  const result = await client.query("SELECT to_regclass($1) AS name", [`public.${tableName}`]);
  return Boolean(result.rows[0]?.name);
}

async function countRows(client, tableName) {
  if (!(await tableExists(client, tableName))) return null;
  const result = await client.query(`SELECT COUNT(*)::int AS total FROM ${tableName}`);
  return result.rows[0].total;
}

async function scalar(client, sql) {
  const result = await client.query(sql);
  return Number(result.rows[0]?.total || 0);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");

    const tables = [
      "usuarios",
      "schema_migrations",
      "usuario_sessoes",
      "usuario_progresso",
      "roles",
      "usuario_roles",
      "bancas",
      "orgaos",
      "concursos",
      "provas",
      "disciplinas",
      "assuntos",
      "questoes",
      "alternativas",
      "gabarito_mapas",
      "questao_fontes",
      "questao_assuntos",
      "listas",
      "lista_questoes",
      "sessoes_estudo",
      "sessao_questoes",
      "favoritos",
      "questao_anotacoes",
      "marcacoes_usuario",
      "resolucoes_questao"
    ];

    const counts = {};
    for (const table of tables) counts[table] = await countRows(client, table);

    const hasQuestions = await tableExists(client, "questoes");
    const hasAlternatives = await tableExists(client, "alternativas");
    const hasSessions = await tableExists(client, "usuario_sessoes");
    const hasQuestionSources = await tableExists(client, "questao_fontes");
    const hasAnswerKeyMaps = await tableExists(client, "gabarito_mapas");

    const diagnostics = {};
    if (hasQuestions) {
      diagnostics.activeQuestions = await scalar(client, "SELECT COUNT(*)::int AS total FROM questoes WHERE status = 'ATIVA'");
      diagnostics.questionsWithoutGabaritoColumn = await scalar(
        client,
        "SELECT COUNT(*)::int AS total FROM questoes WHERE status = 'ATIVA' AND COALESCE(gabarito, '') = ''"
      );
      diagnostics.questionsWithoutFingerprint = await scalar(
        client,
        "SELECT COUNT(*)::int AS total FROM questoes WHERE status = 'ATIVA' AND COALESCE(fingerprint, '') = ''"
      );
      diagnostics.questionsCuratedInLab = await scalar(
        client,
        "SELECT COUNT(*)::int AS total FROM questoes WHERE status = 'ATIVA' AND raw_data->'curadoria'->>'origem' = 'laboratorio'"
      );
    }

    if (hasQuestions && hasAlternatives) {
      diagnostics.activeQuestionsWithCorrectAlternative = await scalar(
        client,
        `SELECT COUNT(DISTINCT q.id)::int AS total
         FROM questoes q
         JOIN alternativas a ON a.questao_id = q.id
         WHERE q.status = 'ATIVA' AND a.is_correta = true`
      );
      diagnostics.activeQuestionsWithoutRecoverableAnswer = await scalar(
        client,
        `SELECT COUNT(*)::int AS total
         FROM questoes q
         WHERE q.status = 'ATIVA'
           AND COALESCE(q.gabarito, '') = ''
           AND NOT EXISTS (
             SELECT 1 FROM alternativas a WHERE a.questao_id = q.id AND a.is_correta = true
           )`
      );
      diagnostics.activeQuestionsWithoutAlternatives = await scalar(
        client,
        `SELECT COUNT(*)::int AS total
         FROM questoes q
         WHERE q.status = 'ATIVA'
           AND NOT EXISTS (SELECT 1 FROM alternativas a WHERE a.questao_id = q.id)`
      );
      diagnostics.orphanAlternatives = await scalar(
        client,
        `SELECT COUNT(*)::int AS total
         FROM alternativas a
         LEFT JOIN questoes q ON q.id = a.questao_id
         WHERE q.id IS NULL`
      );
    }

    if (hasAnswerKeyMaps) {
      diagnostics.answerKeyMapItems = await scalar(client, "SELECT COUNT(*)::int AS total FROM gabarito_mapas");
      diagnostics.answerKeyMapItemsApplied = await scalar(
        client,
        "SELECT COUNT(*)::int AS total FROM gabarito_mapas WHERE aplicado_questao_id IS NOT NULL"
      );
    }

    if (hasQuestions && hasQuestionSources) {
      diagnostics.activeQuestionsWithoutSource = await scalar(
        client,
        `SELECT COUNT(*)::int AS total
         FROM questoes q
         WHERE q.status = 'ATIVA'
           AND NOT EXISTS (SELECT 1 FROM questao_fontes f WHERE f.questao_id = q.id)`
      );
    }

    if (hasSessions) {
      diagnostics.expiredSessions = await scalar(
        client,
        "SELECT COUNT(*)::int AS total FROM usuario_sessoes WHERE expires_at <= NOW()"
      );
    }

    const indexesResult = await client.query(
      `SELECT tablename, indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN ('usuarios', 'usuario_sessoes', 'questoes', 'alternativas', 'questao_assuntos', 'questao_fontes', 'gabarito_mapas', 'schema_migrations')
       ORDER BY tablename, indexname`
    );

    await client.query("COMMIT");

    console.log(
      JSON.stringify(
        {
          ok: true,
          generatedAt: new Date().toISOString(),
          database: process.env.DATABASE_URL ? "DATABASE_URL" : process.env.DB_NAME,
          counts,
          diagnostics,
          indexes: indexesResult.rows
        },
        null,
        2
      )
    );
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
