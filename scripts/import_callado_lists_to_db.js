const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { Pool } = require("pg");
const pdfParse = require("pdf-parse");

const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^"|"$/g, "");
  });
}

const SOURCE_ROOT = process.env.CALLADO_SOURCE || "C:/Users/Usuário/OneDrive/Documentos/ChatGPT/ORGANIZADOR DE ARQUIVOS/Materiais_Callado";
const REPORT_PATH = path.join(__dirname, "..", "dados", "listas_callado_importacao_db.json");
const TARGET_EMAIL = (process.env.CALLADO_TARGET_EMAIL || process.argv.find(arg => arg.startsWith("--email="))?.slice(8) || "").trim().toLowerCase();
const DRY_RUN = process.argv.includes("--dry-run");
const REPLACE_FROM_REPORT = process.argv.includes("--replace-from-report");

const poolConfig = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS == null ? undefined : String(process.env.DB_PASS),
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined
};
if (process.env.DATABASE_URL) poolConfig.connectionString = process.env.DATABASE_URL;
const pool = new Pool(poolConfig);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function sha(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function hashFile(file) { return sha(fs.readFileSync(file)); }
function cleanText(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function fingerprint(enunciado, tipo) { return sha(`${cleanText(enunciado)}_${tipo}`).slice(0, 64); }
function slugify(value) { return cleanText(value).replace(/(.{1,70}).*/, "$1") || "lista"; }
function titleSegment(value) { return String(value || "").replace(/_/g, " ").replace(/\s+/g, " ").trim(); }
function cleanName(file) { return path.basename(file, path.extname(file)).replace(/^\d{4}-\d{2}-\d{2}__/, "").replace(/_[A-F0-9]{8}(?=$|__\d+$)/i, "").replace(/__\d+$/, "").replace(/_/g, " ").replace(/\s+/g, " ").trim(); }
function normalizeAnswer(value) { const n = String(value || "").trim().toUpperCase(); if (n === "CERTO") return "C"; if (n === "ERRADO") return "E"; if (["ANULADO", "ANULADA", "*", "+"].includes(n)) return "X"; return /^[A-EX]$/.test(n) ? n : ""; }
function normalizeType(q) { return q.alternativas?.length >= 2 && q.alternativas.some(a => !["C", "E"].includes(a.letra)) ? "MULTIPLA_ESCOLHA" : "CERTO_ERRADO"; }

function splitAlternativeText(body) {
  const matches = [...body.matchAll(/(?:^|\s)([a-eA-E])\)\s*/g)];
  if (matches.length < 2) return { enunciado: body.trim(), alternativas: [] };
  const first = matches[0];
  const enunciado = body.slice(0, first.index).trim();
  const alternativas = matches.map((match, idx) => {
    const start = match.index + match[0].length;
    const end = idx + 1 < matches.length ? matches[idx + 1].index : body.length;
    return { letra: match[1].toUpperCase(), texto: body.slice(start, end).trim(), ordem: idx + 1 };
  }).filter(alt => alt.texto);
  return { enunciado: enunciado || body.trim(), alternativas };
}

function parseQuestions(text, meta) {
  const normalized = String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "")
    .replace(/(\d+)\.(?=\s*\()/g, "\n$1.")
    .replace(/(\d+)\.FGV/g, "\n$1. FGV")
    .replace(/(\d+)\.\s*\(/g, "\n$1. (")
    .replace(/\n{2,}/g, "\n")
    .trim();
  const markers = [...normalized.matchAll(/(?:^|\n)\s*(\d{1,3})\s*[\.)]\s+/g)].map(m => ({ numero: Number(m[1]), index: m.index + m[0].length }));
  const filtered = [];
  for (const marker of markers) {
    if (marker.numero <= 0 || marker.numero > 250) continue;
    if (filtered.length && marker.numero <= filtered[filtered.length - 1].numero && marker.numero !== 1) continue;
    filtered.push(marker);
  }
  const questions = [];
  for (let i = 0; i < filtered.length; i++) {
    const marker = filtered[i];
    const end = i + 1 < filtered.length ? filtered[i + 1].index - String(filtered[i + 1].numero).length - 3 : normalized.length;
    let body = normalized.slice(marker.index, end).trim();
    if (body.length < 20) continue;
    const answerMatch = body.match(/(?:Gabarito|Resposta)\s*[:\-]\s*(certo|errado|anulada|anulado|[A-E]|C|E|X)\b/i);
    const gabarito = answerMatch ? normalizeAnswer(answerMatch[1]) : "";
    if (answerMatch) body = body.replace(answerMatch[0], "").trim();
    const parsed = splitAlternativeText(body);
    const tipo = parsed.alternativas.length >= 2 ? "MULTIPLA_ESCOLHA" : "CERTO_ERRADO";
    const alternativas = parsed.alternativas.length >= 2 ? parsed.alternativas : [
      { letra: "C", texto: "Certo", ordem: 1 },
      { letra: "E", texto: "Errado", ordem: 2 }
    ];
    questions.push({
      id: `callado_${sha(`${meta.relPath}:${marker.numero}:${parsed.enunciado}`).slice(0, 16)}`,
      numero: marker.numero,
      tipoQuestao: tipo,
      disciplina: meta.materia,
      assunto: meta.assunto,
      enunciado: parsed.enunciado,
      alternativas: alternativas.map((a, idx) => ({ ...a, ordem: idx + 1, is_correta: Boolean(gabarito && a.letra === gabarito) })),
      gabarito,
      tags: meta.tags,
      origemQuestao: { banca: meta.banca, ano: meta.ano, prova: meta.nome, tipo: "lista_importada" },
      origemImportacao: { arquivo: meta.fileName, caminho_relativo: meta.relPath, fonte: "Materiais Callado" }
    });
  }
  return questions;
}

async function extractPdf(file) { return (await pdfParse(fs.readFileSync(file))).text || ""; }
function extractTxt(file) { return fs.readFileSync(file, "utf8"); }
function extractDocx(file) {
  const tmpBase = path.join(__dirname, "..", "tmp", `docx_${crypto.randomUUID()}`);
  const zipPath = `${tmpBase}.zip`;
  const outDir = `${tmpBase}_out`;
  fs.mkdirSync(path.dirname(tmpBase), { recursive: true });
  fs.copyFileSync(file, zipPath);
  fs.mkdirSync(outDir, { recursive: true });
  try {
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(outDir)} -Force`], { stdio: "ignore" });
    const documentXml = path.join(outDir, "word", "document.xml");
    if (!fs.existsSync(documentXml)) return "";
    return fs.readFileSync(documentXml, "utf8").replace(/<w:tab\/>/g, " ").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  } finally {
    fs.rmSync(zipPath, { force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

function inferMeta(file) {
  const relPath = path.relative(SOURCE_ROOT, file).replace(/\\/g, "/");
  const parts = relPath.split("/");
  const materia = titleSegment(parts[0] || "Callado");
  const idx = parts.findIndex(p => p === "Listas_de_Exercicios");
  const assunto = titleSegment(parts[idx + 1] || "Geral");
  const fileName = path.basename(file);
  const nome = cleanName(file);
  const yearMatch = fileName.match(/^(\d{4})-/);
  const bancaMatch = fileName.match(/\b(CESPE|CEBRASPE|FGV|VUNESP|FCC|IBFC|CESGRANRIO|FEPESE)\b/i);
  const tags = [...new Set(["callado", "lista-importada", materia, assunto, bancaMatch?.[1] || ""].map(v => titleSegment(v).toLowerCase()).filter(Boolean))];
  return { relPath, materia, assunto, fileName, nome, ano: yearMatch ? Number(yearMatch[1]) : new Date().getFullYear(), banca: bancaMatch ? bancaMatch[1].toUpperCase() : "Callado", tags };
}

async function getTargetUser(client) {
  if (TARGET_EMAIL) {
    const byEmail = await client.query("SELECT id, nome, email FROM usuarios WHERE lower(email) = $1 LIMIT 1", [TARGET_EMAIL]);
    if (byEmail.rowCount) return byEmail.rows[0];
  }
  const rubem = await client.query("SELECT id, nome, email FROM usuarios WHERE lower(nome) LIKE '%rubem%' OR lower(email) LIKE '%rubem%' ORDER BY created_at LIMIT 1");
  if (rubem.rowCount) return rubem.rows[0];
  const first = await client.query("SELECT id, nome, email FROM usuarios ORDER BY created_at LIMIT 1");
  if (first.rowCount) return first.rows[0];
  throw new Error("Nenhum usuário encontrado para vincular as listas.");
}

async function ensureClassification(client, disciplina, assunto) {
  const disc = await client.query("INSERT INTO disciplinas (nome) VALUES ($1) ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id", [disciplina || "Importação Privada"]);
  const ass = await client.query("INSERT INTO assuntos (nome, disciplina_id) VALUES ($1, $2) ON CONFLICT (nome, disciplina_id) DO UPDATE SET nome = EXCLUDED.nome RETURNING id", [assunto || "Geral", disc.rows[0].id]);
  return { disciplinaId: disc.rows[0].id, assuntoId: ass.rows[0].id };
}

async function upsertQuestionPreservingOfficial(client, q) {
  const tipo = q.tipoQuestao || normalizeType(q);
  const fp = fingerprint(q.enunciado, tipo);
  const existing = await client.query("SELECT id, gabarito, origem_questao, raw_data FROM questoes WHERE fingerprint = $1 OR id = $2 LIMIT 1", [fp, q.id]);
  const { disciplinaId, assuntoId } = await ensureClassification(client, q.disciplina, q.assunto);
  let questionId = q.id;
  let gabaritoDivergente = false;
  let gabaritoInformado = q.gabarito || "";

  if (existing.rowCount) {
    const row = existing.rows[0];
    questionId = row.id;
    const atual = normalizeAnswer(row.gabarito);
    const novo = normalizeAnswer(q.gabarito);
    const raw = row.raw_data || {};
    const origemTipo = String(raw.gabarito_origem?.tipo || row.origem_questao?.tipo || "").toLowerCase();
    const origemOficial = ["banca_oficial", "arquivo_admin", "prova", "laboratorio"].includes(origemTipo);
    gabaritoDivergente = Boolean(origemOficial && atual && novo && atual !== novo);
    if (!atual && novo) {
      await client.query("UPDATE questoes SET gabarito = $2, raw_data = jsonb_set(COALESCE(raw_data, '{}'::jsonb), '{gabarito_origem}', $3::jsonb, true), updated_at = NOW() WHERE id = $1", [questionId, novo, JSON.stringify({ tipo: "lista_importada", fonte: q.origemImportacao?.arquivo || "Materiais Callado" })]);
      await client.query("UPDATE alternativas SET is_correta = (letra = $2) WHERE questao_id = $1", [questionId, novo]);
    }
    return { questionId, reused: true, gabaritoDivergente, gabaritoInformado };
  }

  await client.query(
    `INSERT INTO questoes (
       id, tipo_questao, numero, disciplina_id, assunto_id, banca, ano, prova, enunciado, dificuldade,
       gabarito, tags, origem_questao, origem_importacao, raw_data, status, fingerprint, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Média',$10,$11,$12,$13,$14,'ATIVA',$15,NOW())`,
    [q.id, tipo, q.numero, disciplinaId, assuntoId, q.origemQuestao.banca, q.origemQuestao.ano, q.origemQuestao.prova, q.enunciado, q.gabarito || "", JSON.stringify(q.tags || []), JSON.stringify(q.origemQuestao || {}), JSON.stringify(q.origemImportacao || {}), JSON.stringify(q), fp]
  );
  for (const alt of q.alternativas || []) {
    await client.query(
      `INSERT INTO alternativas (questao_id, letra, texto, is_correta, ordem)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (questao_id, letra) DO UPDATE SET texto = EXCLUDED.texto, is_correta = EXCLUDED.is_correta, ordem = EXCLUDED.ordem`,
      [q.id, alt.letra, alt.texto || "", Boolean(alt.is_correta), alt.ordem || 1]
    );
  }
  await client.query("INSERT INTO questao_assuntos (questao_id, assunto_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [q.id, assuntoId]);
  return { questionId, reused: false, gabaritoDivergente, gabaritoInformado };
}

async function main() {
  if (!fs.existsSync(SOURCE_ROOT)) throw new Error(`Pasta não encontrada: ${SOURCE_ROOT}`);
  const candidates = walk(SOURCE_ROOT).filter(file => {
    const rel = path.relative(SOURCE_ROOT, file);
    const ext = path.extname(file).toLowerCase();
    return rel.includes("Listas_de_Exercicios") && [".pdf", ".docx", ".txt"].includes(ext);
  });
  const client = await pool.connect();
  const skipped = [];
  const importedLists = [];
  let totalQuestions = 0;
  let reusedQuestions = 0;
  let newQuestions = 0;
  let divergentAnswers = 0;
  const seenHashes = new Set();
  let replacedPrevious = null;

  try {
    const user = await getTargetUser(client);
    await client.query("BEGIN");
    if (REPLACE_FROM_REPORT && fs.existsSync(REPORT_PATH)) {
      const previousReport = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
      const previousIds = [...new Set((previousReport.importedLists || []).map(item => item.id).filter(Boolean))];
      if (previousIds.length > 0) {
        const previousLists = await client.query("SELECT * FROM listas WHERE usuario_id = $1 AND id = ANY($2::varchar[]) ORDER BY id", [user.id, previousIds]);
        const previousLinks = await client.query("SELECT * FROM lista_questoes WHERE lista_id = ANY($1::varchar[]) ORDER BY lista_id, ordem", [previousIds]);
        const backupPath = path.join(__dirname, "..", "dados", `backup_listas_callado_${Date.now()}.json`);
        fs.writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), user, ids: previousIds, lists: previousLists.rows, links: previousLinks.rows }, null, 2), "utf8");
        const removed = await client.query("DELETE FROM listas WHERE usuario_id = $1 AND id = ANY($2::varchar[])", [user.id, previousIds]);
        replacedPrevious = { idsFromReport: previousIds.length, removed: removed.rowCount, backupPath: path.relative(process.cwd(), backupPath) };
      }
    }
    for (const file of candidates) {
      const fileHash = hashFile(file);
      if (seenHashes.has(fileHash)) { skipped.push({ file, reason: "duplicado_por_hash" }); continue; }
      seenHashes.add(fileHash);
      const ext = path.extname(file).toLowerCase();
      const meta = inferMeta(file);
      let text = "";
      try {
        if (ext === ".pdf") text = await extractPdf(file);
        else if (ext === ".docx") text = extractDocx(file);
        else text = extractTxt(file);
      } catch (error) {
        skipped.push({ file, reason: `falha_extracao: ${error.message}` });
        continue;
      }
      const questions = parseQuestions(text, meta);
      if (!questions.length) { skipped.push({ file, reason: "sem_questoes_identificadas", textLength: text.length }); continue; }

      const listId = `callado_${fileHash.slice(0, 16)}`;
      const pendentes = questions.filter(q => !q.gabarito).length;
      if (DRY_RUN) {
        importedLists.push({ id: listId, nome: meta.nome, questoes: questions.length, pendentes, origem: meta.relPath });
        totalQuestions += questions.length;
        continue;
      }
      await client.query(
        `INSERT INTO listas (id, nome, usuario_id, is_publica, tags, usar_na_resolucao, origem_tipo, arquivo_origem, compartilhamento_status, gabaritos_pendentes, updated_at)
         VALUES ($1,$2,$3,FALSE,$4,FALSE,'arquivo_usuario',$5,'privada',$6,NOW())
         ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, usuario_id = EXCLUDED.usuario_id, tags = EXCLUDED.tags, arquivo_origem = EXCLUDED.arquivo_origem, gabaritos_pendentes = EXCLUDED.gabaritos_pendentes, updated_at = NOW()`,
        [listId, meta.nome, user.id, JSON.stringify(meta.tags), meta.relPath, pendentes]
      );
      await client.query("DELETE FROM lista_tags WHERE lista_id = $1", [listId]);
      for (const tag of meta.tags) {
        await client.query("INSERT INTO lista_tags (lista_id, tag, usuario_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [listId, tag, user.id]);
      }

      let ordem = 1;
      let linked = 0;
      for (const q of questions) {
        const result = await upsertQuestionPreservingOfficial(client, q);
        if (result.reused) reusedQuestions += 1; else newQuestions += 1;
        if (result.gabaritoDivergente) divergentAnswers += 1;
        await client.query(
          `INSERT INTO lista_questoes (lista_id, questao_id, ordem, gabarito_informado, gabarito_divergente, origem_vinculo)
           VALUES ($1,$2,$3,$4,$5,'lista_usuario')
           ON CONFLICT (lista_id, questao_id) DO UPDATE SET ordem = LEAST(lista_questoes.ordem, EXCLUDED.ordem), gabarito_informado = EXCLUDED.gabarito_informado, gabarito_divergente = EXCLUDED.gabarito_divergente`,
          [listId, result.questionId, ordem++, result.gabaritoInformado || null, result.gabaritoDivergente]
        );
        linked += 1;
      }
      importedLists.push({ id: listId, nome: meta.nome, questoes: linked, pendentes, origem: meta.relPath });
      totalQuestions += linked;
    }
    if (DRY_RUN) await client.query("ROLLBACK");
    else await client.query("COMMIT");
    const report = { dryRun: DRY_RUN, replaceFromReport: REPLACE_FROM_REPORT, replacedPrevious, generatedAt: new Date().toISOString(), usuario: user, sourceRoot: SOURCE_ROOT, candidates: candidates.length, importedLists: importedLists.length, totalQuestions, newQuestions, reusedQuestions, divergentAnswers, skippedCount: skipped.length, importedLists, skipped };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify({ dryRun: DRY_RUN, replaceFromReport: REPLACE_FROM_REPORT, replacedPrevious, usuario: user, candidates: candidates.length, importedLists: importedLists.length, totalQuestions, newQuestions, reusedQuestions, divergentAnswers, skipped: skipped.length, report: path.relative(process.cwd(), REPORT_PATH) }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => { console.error(error.message); process.exit(1); });





