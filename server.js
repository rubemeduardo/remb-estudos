const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { Pool } = require("pg");

const envPath = path.join(__dirname, ".env");
try {
  fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^"|"$/g, "");
      }
    });
} catch (e) {
  // Ambientes gerenciados normalmente usam variáveis injetadas pela hospedagem.
}

const app = express();
const port = Number(process.env.PORT || 8081);
const isProduction = process.env.NODE_ENV === "production";

if (!process.env.DATABASE_URL && (!process.env.DB_USER || !process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_PASS)) {
  console.error(
    "Banco de dados não configurado. Crie um arquivo .env a partir de .env.example ou defina DATABASE_URL na hospedagem."
  );
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

const SESSION_COOKIE = "remb_session";
const SESSION_DAYS = 7;
const PASSWORD_ALGORITHM = "scrypt";
const PASSWORD_KEYLEN = 64;

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

function parseCookies(req) {
  return String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const eq = part.indexOf("=");
      if (eq > -1) acc[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1));
      return acc;
    }, {});
}

function setSessionCookie(res, token, expiresAt) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`
  ];
  if (isProduction) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT${isProduction ? "; Secure" : ""}`
  );
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, PASSWORD_KEYLEN).toString("hex");
  return `${PASSWORD_ALGORITHM}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith(`${PASSWORD_ALGORITHM}$`)) return false;
  const [, salt, hash] = storedHash.split("$");
  const expected = Buffer.from(hash, "hex");
  const actual = crypto.scryptSync(password, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function publicUser(row) {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    nivel: row.nivel,
    status: row.status,
    telefone: row.telefone || "",
    validade: row.validade || "",
    notas: row.notas || "",
    createdAt: row.created_at
  };
}

function normalizeQuestionType(question) {
  const tipo = String(question.tipo_questao || question.tipo || "").toUpperCase();
  if (tipo.includes("CERTO") || tipo.includes("ERRADO")) return "CERTO_ERRADO";
  return "MULTIPLA_ESCOLHA";
}

function getQuestionAnswer(question, alternatives = []) {
  if (question.gabarito) return String(question.gabarito).trim();
  const correct = alternatives.find((alt) => alt.is_correta || alt.correta);
  return correct ? String(correct.letra || "").trim() : "";
}

function normalizeAnswerValue(answer) {
  const normalized = String(answer || "").trim().toUpperCase();
  if (normalized === "CERTO") return "C";
  if (normalized === "ERRADO") return "E";
  if (normalized === "ANULADO" || normalized === "ANULADA" || normalized === "*" || normalized === "+") return "X";
  return /^[A-EX]$/.test(normalized) ? normalized : "";
}

function normalizeAnswerKeySourceType(value) {
  const normalized = String(value || "arquivo_admin").trim().toLowerCase();
  const allowed = new Set(["banca_oficial", "arquivo_admin", "lista_importada", "ajuste_manual", "laboratorio"]);
  return allowed.has(normalized) ? normalized : "arquivo_admin";
}

function normalizeQuestionForStorage(question, sourceFile) {
  const origemQuestao = question.origem_questao || {};
  const origemImportacao = question.origem_importacao || {};
  const alternatives = Array.isArray(question.alternativas) ? question.alternativas : [];

  return {
    id: String(question.id || `q_${crypto.randomUUID()}`),
    numero: Number.isFinite(Number(question.numero)) ? Number(question.numero) : null,
    tipoQuestao: normalizeQuestionType(question),
    disciplina: String(question.disciplina || "Outros").trim() || "Outros",
    assunto: String(question.assunto || "Geral").trim() || "Geral",
    subassunto: String(question.subassunto || "").trim(),
    banca: String(origemQuestao.banca || question.banca || "").trim(),
    orgao: String(origemQuestao.orgao || question.orgao || "").trim(),
    cargo: String(origemQuestao.cargo || question.cargo || "").trim(),
    ano: Number.isFinite(Number(origemQuestao.ano || question.ano)) ? Number(origemQuestao.ano || question.ano) : null,
    prova: String(origemQuestao.prova || question.prova || "").trim(),
    enunciado: String(question.enunciado || "").trim(),
    contexto: String(question.contexto || "").trim(),
    justificativa: String(
      question.justificativa || question.comentarios_professor || question.comentario_professor || ""
    ).trim(),
    dificuldade: String(question.dificuldade || "").trim(),
    gabarito: getQuestionAnswer(question, alternatives),
    tags: Array.isArray(question.tags) ? question.tags : [],
    origemQuestao,
    origemImportacao: {
      ...origemImportacao,
      arquivo_json: sourceFile
    },
    rawData: {
      ...question,
      origem_importacao: {
        ...origemImportacao,
        arquivo_json: sourceFile
      }
    },
    alternatives
  };
}

function isRemoteUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function resolveLocalQuestionFile(candidate) {
  if (!candidate || isRemoteUrl(candidate)) return null;
  const normalized = String(candidate).replace(/\\/g, "/").replace(/^\/+/, "");
  const possible = [];
  if (normalized.startsWith("dados/")) {
    possible.push(path.resolve(__dirname, normalized));
  } else {
    possible.push(path.resolve(__dirname, "dados", "provas", normalized));
    possible.push(path.resolve(__dirname, "dados", normalized));
  }
  const allowedRoots = [
    path.resolve(__dirname, "dados"),
    path.resolve(__dirname, "dados", "provas")
  ];
  return possible.find((filePath) => {
    const insideAllowedRoot = allowedRoots.some((root) => filePath === root || filePath.startsWith(`${root}${path.sep}`));
    return insideAllowedRoot && filePath.toLowerCase().endsWith(".json") && fs.existsSync(filePath);
  }) || null;
}

function toRelativeAppPath(filePath) {
  return path.relative(__dirname, filePath).replace(/\\/g, "/");
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyExamLink(link) {
  const text = `${link.text} ${link.url}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(gabarito|resposta|padrao\s+definitivo|padrao\s+preliminar)\b/.test(text)) return "gabarito";
  if (/\b(prova|caderno|questoes|objetiva|discursiva)\b/.test(text)) return "prova";
  if (/\b(edital|comunicado|retificacao)\b/.test(text)) return "edital";
  if (/\b(recurso|recursos)\b/.test(text)) return "recurso";
  return "";
}

async function fetchTextDocument(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "REMB-Estudos-Pipeline/1.0" } });
    if (!response.ok) throw new Error(`Origem respondeu com status ${response.status}.`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractLinksFromHtml(html, baseUrl) {
  const links = [];
  const anchorRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRegex.exec(html))) {
    try {
      const url = new URL(match[1], baseUrl).href;
      const text = stripHtml(match[2]);
      links.push({ url, text, tipo: classifyExamLink({ url, text }) });
    } catch (error) {
      // Ignora links malformados da pagina de origem.
    }
  }
  return links;
}

async function discoverExamDocumentsFromOrigin(originUrl) {
  if (!isRemoteUrl(originUrl)) return { found: {}, links: [], error: "" };
  try {
    const html = await fetchTextDocument(originUrl);
    const cleanText = stripHtml(html).toLowerCase();
    if (cleanText.includes("necessário habilitar o javascript") || cleanText.includes("necessario habilitar o javascript")) {
      return {
        found: {},
        links: [],
        error: "A página oficial depende de JavaScript e não expôs links diretos para leitura automática."
      };
    }
    const links = extractLinksFromHtml(html, originUrl);
    const found = {};
    for (const tipo of ["prova", "gabarito", "edital", "recurso"]) {
      const directPdf = links.find((link) => link.tipo === tipo && /\.pdf(?:$|[?#])/i.test(link.url));
      const anyLink = links.find((link) => link.tipo === tipo);
      if (directPdf || anyLink) found[tipo] = (directPdf || anyLink).url;
    }
    return { found, links, error: "" };
  } catch (error) {
    return { found: {}, links: [], error: error.message || "Não foi possível consultar a página oficial." };
  }
}

async function downloadExamDocument(provaId, tipo, url) {
  if (!provaId || !tipo || !isRemoteUrl(url) || !/\.pdf(?:$|[?#])/i.test(url)) return "";
  const targetDir = path.join(__dirname, "dados", "provas");
  fs.mkdirSync(targetDir, { recursive: true });
  const filePath = path.join(targetDir, `${provaId}-${tipo}.pdf`);
  if (fs.existsSync(filePath)) return toRelativeAppPath(filePath);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "REMB-Estudos-Pipeline/1.0" } });
    if (!response.ok) return "";
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.includes("pdf") && !url.toLowerCase().includes(".pdf")) return "";
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) return "";
    fs.writeFileSync(filePath, buffer);
    return toRelativeAppPath(filePath);
  } catch (error) {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function findProcessableQuestionFile({ provaId, sourceFile, docs = {} }) {
  const candidates = uniqueStrings([
    docs.questoes,
    docs.questoesUrl,
    docs.arquivoQuestoes,
    provaId ? `${provaId}-questoes.json` : "",
    provaId ? `${provaId}.json` : "",
    sourceFile && sourceFile.toLowerCase().endsWith(".json") ? sourceFile : ""
  ]);
  const filePath = candidates.map(resolveLocalQuestionFile).find(Boolean);
  return filePath ? toRelativeAppPath(filePath) : "";
}

function resolveLocalExamDocument(candidate) {
  if (!candidate || isRemoteUrl(candidate)) return null;
  const normalized = String(candidate).replace(/\\/g, "/").replace(/^\/+/, "");
  const possible = [];
  if (normalized.startsWith("dados/")) {
    possible.push(path.resolve(__dirname, normalized));
  } else {
    possible.push(path.resolve(__dirname, "dados", "provas", normalized));
  }
  const allowedRoot = path.resolve(__dirname, "dados", "provas");
  return possible.find((filePath) => {
    const insideAllowedRoot = filePath === allowedRoot || filePath.startsWith(`${allowedRoot}${path.sep}`);
    return insideAllowedRoot && fs.existsSync(filePath);
  }) || null;
}

async function extractTextFromPdfIfPossible(filePath) {
  if (!filePath || !filePath.toLowerCase().endsWith(".pdf") || !fs.existsSync(filePath)) return "";
  try {
    const output = execFileSync("pdftotext", ["-layout", filePath, "-"], {
      encoding: "utf8",
      timeout: 30000,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024
    });
    return String(output || "").trim();
  } catch (error) {
    // Continua com o extrator em Node quando o binário pdftotext não está instalado.
  }

  try {
    const pdfParse = require("pdf-parse");
    const buffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(buffer, {
      max: 0,
      pagerender: (pageData) => pageData.getTextContent({ normalizeWhitespace: false }).then((content) => {
        let lastY;
        let text = "";
        for (const item of content.items) {
          const y = item.transform?.[5];
          if (lastY !== undefined && y !== lastY) text += "\n";
          text += item.str;
          if (item.hasEOL) text += "\n";
          lastY = y;
        }
        return text;
      })
    });
    return String(parsed.text || "").trim();
  } catch (error) {
    return "";
  }
}

function looksLikeCodeLine(line) {
  const tr = String(line || "").trim();
  if (!tr) return false;
  return (
    /^\d{2}\s+/.test(tr) ||
    /^(COPY|FROM|RUN|CMD|ENTRYPOINT|ENV|WORKDIR|on:|jobs:|steps:|stage\(|pipeline\s*\{|waitForQualityGate|eland_import_hub_model|Sleeping for \d+ seconds|Done sleeping|Total time:)/i.test(tr) ||
    (tr.length < 160 && /[{}`]/.test(tr))
  );
}

function normalizeOcrTextBlock(text, { preserveCode = true } = {}) {
  const rawLines = String(text || "")
    .replace(/\r/g, "\n")
    .replace(/([A-Za-zÀ-ÿ])-\s*\n\s*([a-zà-ÿ])/g, "$1$2")
    .split("\n");
  const paragraphs = [];
  let buffer = [];

  const flush = () => {
    if (!buffer.length) return;
    const codeLike = preserveCode && buffer.filter(looksLikeCodeLine).length >= Math.max(1, Math.ceil(buffer.length * 0.4));
    const value = codeLike
      ? buffer.map((line) => line.trimEnd()).join("\n")
      : buffer
          .map((line) => line.trim())
          .filter(Boolean)
          .join(" ")
          .replace(/[ \t]+/g, " ")
          .replace(/\s+([,.;:!?])/g, "$1")
          .trim();
    if (value) paragraphs.push(value);
    buffer = [];
  };

  for (const line of rawLines) {
    if (!line.trim()) {
      flush();
    } else {
      buffer.push(line);
    }
  }
  flush();

  return paragraphs.join("\n\n").trim();
}

function removeExamNoise(text) {
  return String(text || "")
    .replace(/\bEspaço\s+livre\b/gi, " ")
    .replace(/--\s*CONHECIMENTOS\s+(?:BÁSICOS|ESPECÍFICOS)\s*--/gi, " ")
    .replace(/--\s*PROVAS\s+OBJETIVAS\s*--/gi, " ")
    .replace(/\bCEBRASPE\s+[–-]\s+TCU\/AUFC\s+[–-]\s*Edital:\s*2025\b/gi, " ")
    .replace(/\bCEBRASPE\s+[–-]\s+TCU\/AUFC\s+[–-]\s*Edital:\s*2026\b/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function findInstructionStart(text) {
  const value = String(text || "");
  const judgementMatches = Array.from(value.matchAll(/\bjulgue\b/gi)).map((match) => match.index);
  const judgementIndex = judgementMatches.pop();
  if (judgementIndex === undefined) return -1;

  const beforeJudgement = value.slice(0, judgementIndex);
  const lastSentenceBoundary = Math.max(
    beforeJudgement.lastIndexOf(". "),
    beforeJudgement.lastIndexOf(".\n"),
    beforeJudgement.lastIndexOf("? "),
    beforeJudgement.lastIndexOf("! ")
  );
  const searchStart = Math.max(0, lastSentenceBoundary + 1);
  const commandLead = value.slice(searchStart, judgementIndex + 80);
  const leadMatch = commandLead.match(/\b(?:Acerca|A respeito|Em relação|No que se refere|Com base|Considerando|Segundo|Tendo o texto como referência inicial|Julgue)\b/i);
  return leadMatch ? searchStart + leadMatch.index : judgementIndex;
}

function splitInstructionFromTail(text) {
  const cleaned = removeExamNoise(text);
  const instructionStart = findInstructionStart(cleaned);
  const hasJudgementCommand = /julgue/i.test(cleaned);
  if (!hasJudgementCommand) {
    return { body: normalizeOcrTextBlock(cleaned), instruction: "" };
  }
  if (instructionStart <= 20) {
    return { body: "", instruction: normalizeOcrTextBlock(cleaned, { preserveCode: false }) };
  }
  if (instructionStart > -1) {
    const before = cleaned.slice(0, instructionStart).trim();
    const instruction = cleaned.slice(instructionStart).trim();
    if (instruction.length >= 25 && /julgue|itens|item|subsequentes|seguir|seguem/i.test(instruction)) {
      return {
        body: normalizeOcrTextBlock(before),
        instruction: normalizeOcrTextBlock(instruction, { preserveCode: false })
      };
    }
  }
  return { body: normalizeOcrTextBlock(cleaned), instruction: "" };
}

function extractFormattedQuestionText(body) {
  const lines = String(body || "").split("\n");
  const codeLines = [];
  const textLines = [];

  for (const line of lines) {
    if (looksLikeCodeLine(line)) {
      codeLines.push(line.trimEnd());
    } else {
      textLines.push(line);
    }
  }

  let cleanBody = textLines.join("\n").trim();
  const inlineBlocks = [];
  cleanBody = cleanBody.replace(/\b(Sleeping for \d+ seconds[\s\S]*?Total time:\s*~?\d+\s*seconds)/i, (match) => {
    inlineBlocks.push(match.trim().replace(/\s+(?=(?:Done sleeping|Sleeping for|Total time:))/g, "\n"));
    return "";
  });
  cleanBody = cleanBody.replace(/\b(01\s+02\s+03\s+(?:pipeline\s*\{|on:)[\s\S]*)$/i, (match) => {
    inlineBlocks.push(match.trim().replace(/\s+(?=\d{2}\s)/g, "\n"));
    return "";
  });
  cleanBody = cleanBody.replace(/\b(COPY\s+--from=\S+\s+\S+\s+\S+)/gi, (match) => {
    inlineBlocks.push(match.trim());
    return "";
  });

  const formatted = [...codeLines, ...inlineBlocks].join("\n").trim();
  return {
    enunciado: normalizeOcrTextBlock(cleanBody),
    codigo: formatted
  };
}

function parseCebraspeAnswerKeyText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const answersByNumber = {};
  let pendingNumbers = [];

  for (const line of lines) {
    const compact = line.replace(/\s+/g, "").toUpperCase();
    if (/^\d{6,}$/.test(compact) && compact.length % 3 === 0) {
      const numbers = compact.match(/\d{3}/g).map(Number).filter((number) => number > 0);
      if (numbers.length) pendingNumbers = numbers;
      continue;
    }

    if (/^[CEX*+]{2,}$/i.test(compact) && pendingNumbers.length) {
      const answers = compact.split("");
      const limit = Math.min(pendingNumbers.length, answers.length);
      for (let index = 0; index < limit; index += 1) {
        const answer = normalizeAnswerValue(answers[index]);
        if (answer) answersByNumber[pendingNumbers[index]] = answer;
      }
      pendingNumbers = [];
      continue;
    }

    const explicit = line.match(/^\s*(\d{1,3})\s*(?:[-–—.:;) ]+)\s*(C|E|X|\*|\+|CERTO|ERRADO|ANULAD[AO])\b/i);
    if (explicit) {
      const answer = normalizeAnswerValue(explicit[2]);
      if (answer) answersByNumber[Number(explicit[1])] = answer;
    }
  }

  return answersByNumber;
}

async function extractAnswerKeyFromPdfIfPossible(filePath) {
  const text = await extractTextFromPdfIfPossible(filePath);
  return {
    text,
    answers: parseCebraspeAnswerKeyText(text)
  };
}

async function loadAnswerKeyMapForExam(docs = {}) {
  const localGabaritoPath = resolveLocalExamDocument(String(docs.gabarito || "").trim());
  if (!localGabaritoPath) return { answers: {}, total: 0, source: "", textLength: 0 };
  const extracted = await extractAnswerKeyFromPdfIfPossible(localGabaritoPath);
  return {
    answers: extracted.answers,
    total: Object.keys(extracted.answers).length,
    source: toRelativeAppPath(localGabaritoPath),
    textLength: extracted.text.length
  };
}
function parseStructuredQuestionsFromText(text, meta = {}) {
  const normalized = removeExamNoise(
    String(text || "")
      .replace(/\r/g, "\n")
      .replace(/([A-Za-zÀ-ÿ])-\s*\n\s*([a-zà-ÿ])/g, "$1$2")
      .replace(/\u00a0/g, " ")
  );
  if (normalized.length < 80) return [];

  const markerRegex = /(^|[\s\n])(?:quest[aã]o\s*)?(\d{1,3})(?:\s*[.)\-–:]\s*|\s+)(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9])/gi;
  const seenAt = new Map();
  let markers = [];
  for (const match of normalized.matchAll(markerRegex)) {
    const numero = Number(match[2]);
    if (!Number.isInteger(numero) || numero <= 0 || numero > 400 || seenAt.has(numero)) continue;
    const markerStart = match.index + match[1].length;
    const bodyStart = match.index + match[0].length;
    seenAt.set(numero, markerStart);
    markers.push({ numero, markerStart, bodyStart });
  }

  const highNumberMarkers = markers.filter((marker) => marker.numero >= 50);
  if (highNumberMarkers.length >= 20 && Math.max(...highNumberMarkers.map((marker) => marker.numero)) >= 100) {
    markers = highNumberMarkers;
  }

  if (markers.length < 2) return [];

  const contextEvents = [];
  const beforeFirst = splitInstructionFromTail(normalized.slice(0, markers[0].markerStart));
  if (beforeFirst.instruction) {
    contextEvents.push({ numero: markers[0].numero, comando: beforeFirst.instruction, contexto: beforeFirst.body });
  }

  const rawQuestions = [];
  for (let index = 0; index < markers.length; index += 1) {
    const current = markers[index];
    const next = markers[index + 1];
    const rawSegment = normalized.slice(current.bodyStart, next ? next.markerStart : normalized.length).trim();
    const split = splitInstructionFromTail(rawSegment);
    if (split.instruction && next) {
      contextEvents.push({ numero: next.numero, comando: split.instruction, contexto: "" });
    }
    const body = split.body || normalizeOcrTextBlock(removeExamNoise(rawSegment));
    if (body.length < 12) continue;
    rawQuestions.push({ numero: current.numero, body });
  }

  contextEvents.sort((a, b) => a.numero - b.numero);
  rawQuestions.sort((a, b) => a.numero - b.numero);

  const questions = rawQuestions.map((item) => {
    const event = [...contextEvents].reverse().find((candidate) => candidate.numero <= item.numero) || {};
    return buildStructuredQuestionCandidate(item.numero, item.body, meta, {
      contexto: event.contexto || "",
      comando: event.comando || ""
    });
  });

  return questions.slice(0, 300);
}

function buildStructuredQuestionCandidate(numero, body, meta = {}, context = {}) {
  const banca = String(meta.banca || "").trim();
  const isCertoErrado = /cebraspe|cespe/i.test(banca) || !/[A-E]\s*[\)\.]/i.test(body);
  const formatted = extractFormattedQuestionText(body);
  const alternativas = isCertoErrado
    ? [
        { letra: "C", texto: "Certo" },
        { letra: "E", texto: "Errado" }
      ]
    : Array.from(body.matchAll(/(?:^|\n|\s)([A-E])\s*[\)\.]\s*([\s\S]*?)(?=(?:\n|\s)[A-E]\s*[\)\.]|$)/gi))
        .map((match) => ({ letra: match[1].toUpperCase(), texto: String(match[2] || "").trim() }))
        .filter((alt) => alt.texto);
  const enunciado = isCertoErrado
    ? formatted.enunciado || body
    : (formatted.enunciado || body).replace(/(?:^|\n|\s)[A-E]\s*[\)\.]\s*[\s\S]*$/i, "").trim() || body;

  return {
    id: `${meta.provaId || "prova"}-${String(numero).padStart(3, "0")}`,
    numero,
    tipo_questao: isCertoErrado ? "CERTO_ERRADO" : "MULTIPLA_ESCOLHA",
    enunciado,
    contexto: context.contexto || context.comando || "",
    comando: context.comando || "",
    codigo_ou_texto_formatado: formatted.codigo,
    alternativas,
    gabarito: "",
    disciplina: "Geral",
    assunto: "Geral",
    origem_questao: {
      banca: meta.banca || "",
      orgao: meta.orgao || "",
      cargo: meta.cargo || "",
      ano: meta.ano || "",
      prova: meta.prova || meta.orgao || ""
    },
    origem_importacao: {
      prova_id: meta.provaId || "",
      documento_prova: meta.documentoProva || "",
      origem: meta.origem || "",
      status: "estruturado_para_revisao"
    },
    tags: ["pipeline", "revisao-laboratorio"]
  };
}

function readExamManifest() {
  const manifestPath = path.join(__dirname, "dados", "provas_manifest.json");
  if (!fs.existsSync(manifestPath)) return { provas: {}, cards: {} };
  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return parsed && typeof parsed === "object"
    ? { ...parsed, provas: parsed.provas || {}, cards: parsed.cards || {} }
    : { provas: {}, cards: {} };
}

function writeExamManifest(manifest) {
  const manifestPath = path.join(__dirname, "dados", "provas_manifest.json");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function saveAnswerKeyMapItem(client, { tipoOrigem, origemId, numero, gabarito, origemTipo, fonte, userId }) {
  const cleanTipo = String(tipoOrigem || "").trim().toLowerCase();
  const cleanOrigemId = String(origemId || "").trim();
  const cleanNumero = Number(numero);
  const cleanGabarito = normalizeAnswerValue(gabarito);
  if (!["prova", "lista"].includes(cleanTipo)) {
    const err = new Error("Tipo de origem inválido para o mapa de gabarito.");
    err.statusCode = 400;
    throw err;
  }
  if (!cleanOrigemId || !Number.isInteger(cleanNumero) || cleanNumero <= 0 || !cleanGabarito) {
    const err = new Error("Mapa de gabarito incompleto: informe origem, número e gabarito explícito.");
    err.statusCode = 400;
    throw err;
  }
  const result = await client.query(
    `INSERT INTO gabarito_mapas (
       id, tipo_origem, origem_id, numero, gabarito, origem_tipo, fonte, criado_por, atualizado_por, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, NOW())
     ON CONFLICT (tipo_origem, origem_id, numero)
     DO UPDATE SET
       gabarito = EXCLUDED.gabarito,
       origem_tipo = EXCLUDED.origem_tipo,
       fonte = EXCLUDED.fonte,
       atualizado_por = EXCLUDED.atualizado_por,
       updated_at = NOW()
     RETURNING *`,
    [
      `gmap_${crypto.randomUUID()}`,
      cleanTipo,
      cleanOrigemId,
      cleanNumero,
      cleanGabarito,
      normalizeAnswerKeySourceType(origemTipo),
      String(fonte || "").trim(),
      userId
    ]
  );
  return result.rows[0];
}

async function applyAnswerKeyMapToQuestions(client, { tipoOrigem, origemId, sourceFile, userId }) {
  const cleanTipo = String(tipoOrigem || "").trim().toLowerCase();
  const cleanOrigemId = String(origemId || "").trim();
  const cleanSourceFile = String(sourceFile || "").trim();
  if (!cleanTipo || !cleanOrigemId || !cleanSourceFile) return { applied: 0, matched: 0 };

  const maps = await client.query(
    `SELECT *
     FROM gabarito_mapas
     WHERE tipo_origem = $1 AND origem_id = $2
     ORDER BY numero`,
    [cleanTipo, cleanOrigemId]
  );
  let applied = 0;
  let matched = 0;

  for (const item of maps.rows) {
    const questions = await client.query(
      `SELECT *
       FROM questoes
       WHERE status = 'ATIVA'
         AND numero = $1
         AND (
           origem_importacao->>'arquivo_json' = $2
           OR origem_importacao->>'arquivo' = $2
           OR raw_data->'origem_importacao'->>'arquivo_json' = $2
           OR raw_data->'origem_importacao'->>'arquivo' = $2
         )`,
      [item.numero, cleanSourceFile]
    );
    if (questions.rowCount !== 1) continue;
    matched += 1;
    const question = questions.rows[0];
    const rawData = {
      ...(question.raw_data || {}),
      gabarito: item.gabarito,
      gabarito_origem: {
        tipo: item.origem_tipo,
        fonte: item.fonte || "",
        mapa_id: item.id,
        atualizado_em: new Date().toISOString(),
        atualizado_por: userId
      }
    };
    await client.query(
      `UPDATE questoes
       SET gabarito = $2,
           raw_data = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [question.id, item.gabarito, JSON.stringify(rawData)]
    );
    await client.query("UPDATE alternativas SET is_correta = (letra = $2) WHERE questao_id = $1", [question.id, item.gabarito]);
    await client.query(
      `UPDATE gabarito_mapas
       SET aplicado_questao_id = $3,
           atualizado_por = $4,
           updated_at = NOW()
       WHERE tipo_origem = $1 AND origem_id = $2 AND numero = $5`,
      [cleanTipo, cleanOrigemId, question.id, userId, item.numero]
    );
    applied += 1;
  }
  return { applied, matched };
}

function publicQuestion(row, includeAnswer = false, includeAnswerSource = false) {
  const raw = row.raw_data || {};
  const origemQuestao = raw.origem_questao || {};
  const origemImportacao = raw.origem_importacao || {};
  const question = {
    ...raw,
    id: row.id,
    numero: row.numero ?? raw.numero ?? null,
    tipo: row.tipo_questao === "CERTO_ERRADO" ? "certo_errado" : raw.tipo || "multipla_escolha",
    tipo_questao: row.tipo_questao,
    disciplina: row.disciplina_nome || raw.disciplina || "Outros",
    assunto: row.assunto_nome || raw.assunto || "Geral",
    subassunto: row.subassunto || raw.subassunto || "",
    contexto: row.contexto || raw.contexto || "",
    enunciado: row.enunciado,
    justificativa: row.justificativa || raw.justificativa || "",
    dificuldade: row.dificuldade || raw.dificuldade || "",
    tags: row.tags || raw.tags || [],
    origem_questao: {
      ...origemQuestao,
      banca: row.banca || origemQuestao.banca || "",
      orgao: row.orgao || origemQuestao.orgao || "",
      cargo: row.cargo || origemQuestao.cargo || "",
      ano: row.ano || origemQuestao.ano || "",
      prova: row.prova || origemQuestao.prova || ""
    },
    origem_importacao: origemImportacao,
    alternativas: row.alternativas || raw.alternativas || []
  };

  if (includeAnswer) {
    question.gabarito = row.gabarito || raw.gabarito || "";
    if (!includeAnswerSource) {
      delete question.gabarito_origem;
      delete question.gabarito_meta;
    }
  } else {
    delete question.gabarito;
    delete question.gabarito_origem;
    delete question.gabarito_meta;
    question.alternativas = question.alternativas.map((alt) => {
      const { correta, is_correta, ...publicAlt } = alt;
      return publicAlt;
    });
  }

  return question;
}

function buildQuestionsWhere(query, accessScope = null) {
  const where = ["q.status = 'ATIVA'"];
  const values = [];
  const add = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (accessScope?.restricted) {
    const accessClauses = [];
    if (accessScope.provaIds?.length) {
      accessClauses.push(`COALESCE(q.origem_importacao->>'prova_id', '') = ANY(${add(accessScope.provaIds)}::text[])`);
    }
    if (accessScope.provaNomes?.length) {
      accessClauses.push(`EXISTS (SELECT 1 FROM questao_fontes qf_acl JOIN provas p_acl ON p_acl.id = qf_acl.prova_id WHERE qf_acl.questao_id = q.id AND p_acl.nome IN (SELECT unnest(${add(accessScope.provaNomes)}::text[])))`);
    }
    if (accessScope.listaIds?.length) {
      accessClauses.push(`EXISTS (SELECT 1 FROM lista_questoes lq_acl WHERE lq_acl.questao_id = q.id AND lq_acl.lista_id = ANY(${add(accessScope.listaIds)}::text[]))`);
    }
    where.push(accessClauses.length ? `(${accessClauses.join(" OR ")})` : "FALSE");
  }

  if (query.disciplina) where.push(`d.nome = ${add(query.disciplina)}`);
  if (query.assunto) where.push(`a.nome = ${add(query.assunto)}`);
  if (query.banca) where.push(`q.banca = ${add(query.banca)}`);
  if (query.ano) where.push(`q.ano = ${add(Number(query.ano))}`);
  if (query.tipo) where.push(`q.tipo_questao = ${add(String(query.tipo).toUpperCase())}`);
  if (query.search) {
    const term = String(query.search).trim();
    if (term) {
      const tsQuery = add(term);
      const likeQuery = add(`%${term}%`);
      where.push(
        `(to_tsvector('portuguese', COALESCE(q.enunciado, '') || ' ' || COALESCE(q.contexto, '')) @@ plainto_tsquery('portuguese', ${tsQuery})
          OR q.prova ILIKE ${likeQuery}
          OR q.cargo ILIKE ${likeQuery}
          OR q.banca ILIKE ${likeQuery})`
      );
    }
  }

  return { whereSql: where.join(" AND "), values };
}

async function insertQuestionSource(client, questionId, question) {
  const bancaId = question.banca
    ? (await client.query(
        "INSERT INTO bancas (nome) VALUES ($1) ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id",
        [question.banca]
      )).rows[0].id
    : null;
  const orgaoId = question.orgao
    ? (await client.query(
        "INSERT INTO orgaos (nome) VALUES ($1) ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id",
        [question.orgao]
      )).rows[0].id
    : null;

  const sourceName = question.prova || question.origemImportacao.arquivo || question.origemImportacao.arquivo_json || "";
  let provaId = null;
  if (sourceName) {
    const concursoName = question.prova || question.orgao || question.banca || "Origem importada";
    const concurso = await client.query(
      `INSERT INTO concursos (nome, banca_id, orgao_id, ano)
       VALUES ($1::varchar, $2::int, $3::int, $4::int)
       ON CONFLICT (nome, ano) DO UPDATE
       SET banca_id = COALESCE(concursos.banca_id, EXCLUDED.banca_id),
           orgao_id = COALESCE(concursos.orgao_id, EXCLUDED.orgao_id)
       RETURNING id`,
      [concursoName, bancaId, orgaoId, question.ano]
    );
    const prova = await client.query(
      `INSERT INTO provas (nome, concurso_id)
       SELECT $1::varchar, $2::int
       WHERE NOT EXISTS (
         SELECT 1 FROM provas WHERE nome = $1::varchar AND concurso_id = $2::int
       )
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
  }

  const sourceType = question.prova ? "PROVA" : "LISTA";
  const originalNumber = Number.isFinite(Number(question.origemImportacao.numero_original))
    ? Number(question.origemImportacao.numero_original)
    : question.numero;

  await client.query(
    `INSERT INTO questao_fontes (questao_id, tipo_fonte, prova_id, numero_original)
     SELECT $1::varchar, $2::varchar, $3::int, $4::int
     WHERE NOT EXISTS (
       SELECT 1
       FROM questao_fontes
       WHERE questao_id = $1::varchar
         AND tipo_fonte = $2::varchar
         AND prova_id IS NOT DISTINCT FROM $3::int
         AND numero_original IS NOT DISTINCT FROM $4::int
     )`,
    [questionId, sourceType, provaId, originalNumber]
  );
}

async function upsertQuestionClassification(client, disciplinaNome, assuntoNome) {
  const disciplina = String(disciplinaNome || "Outros").trim() || "Outros";
  const assunto = String(assuntoNome || "Geral").trim() || "Geral";
  const disciplinaResult = await client.query(
    "INSERT INTO disciplinas (nome) VALUES ($1) ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id",
    [disciplina]
  );
  const assuntoResult = await client.query(
    "INSERT INTO assuntos (nome, disciplina_id) VALUES ($1, $2) ON CONFLICT (nome, disciplina_id) DO UPDATE SET nome = EXCLUDED.nome RETURNING id",
    [assunto, disciplinaResult.rows[0].id]
  );
  return { disciplinaId: disciplinaResult.rows[0].id, assuntoId: assuntoResult.rows[0].id };
}

async function importQuestionBatch(client, questions, sourceFile) {
  let imported = 0;
  let skipped = 0;

  for (const originalQuestion of questions) {
    const question = normalizeQuestionForStorage(originalQuestion, sourceFile);
    if (!question.enunciado) {
      skipped += 1;
      continue;
    }

    const officialExamId = question.origemImportacao?.prova_id || question.origemImportacao?.provaId || "";
    const fingerprintBase = officialExamId && question.numero
      ? `${officialExamId}_${question.numero}_${question.tipoQuestao}`
      : `${question.enunciado.toLowerCase().replace(/[^a-z0-9]/g, "")}_${question.tipoQuestao}`;
    const fingerprint = crypto
      .createHash("sha256")
      .update(fingerprintBase)
      .digest("hex");

    const disciplina = await client.query(
      "INSERT INTO disciplinas (nome) VALUES ($1) ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id",
      [question.disciplina]
    );
    const assunto = await client.query(
      "INSERT INTO assuntos (nome, disciplina_id) VALUES ($1, $2) ON CONFLICT (nome, disciplina_id) DO UPDATE SET nome = EXCLUDED.nome RETURNING id",
      [question.assunto, disciplina.rows[0].id]
    );

    const values = [
      question.id,
      question.tipoQuestao,
      question.numero,
      disciplina.rows[0].id,
      assunto.rows[0].id,
      question.subassunto,
      question.banca,
      question.orgao,
      question.cargo,
      question.ano,
      question.prova,
      question.contexto,
      question.enunciado,
      question.justificativa,
      question.dificuldade,
      question.gabarito,
      JSON.stringify(question.tags),
      JSON.stringify(question.origemQuestao),
      JSON.stringify(question.origemImportacao),
      JSON.stringify(question.rawData),
      fingerprint
    ];

    const existing = await client.query("SELECT id FROM questoes WHERE id = $1 OR fingerprint = $2 LIMIT 1", [
      question.id,
      fingerprint
    ]);

    const inserted = existing.rowCount
      ? await client.query(
          `UPDATE questoes
           SET tipo_questao = $1,
               numero = $2,
               disciplina_id = $3,
               assunto_id = $4,
               subassunto = $5,
               banca = $6,
               orgao = $7,
               cargo = $8,
               ano = $9,
               prova = $10,
               contexto = $11,
               enunciado = $12,
               justificativa = $13,
               dificuldade = $14,
               gabarito = $15,
               tags = $16,
               origem_questao = $17,
               origem_importacao = $18,
               raw_data = $19,
               status = 'ATIVA',
               fingerprint = $20,
               updated_at = NOW()
           WHERE id = $21
           RETURNING id`,
          [...values.slice(1), existing.rows[0].id]
        )
      : await client.query(
          `INSERT INTO questoes (
             id, tipo_questao, numero, disciplina_id, assunto_id, subassunto, banca, orgao, cargo, ano, prova,
             contexto, enunciado, justificativa, dificuldade, gabarito, tags, origem_questao, origem_importacao,
             raw_data, status, fingerprint, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 'ATIVA', $21, NOW())
           RETURNING id`,
          values
        );

    const questionId = inserted.rows[0].id;
    await client.query("DELETE FROM alternativas WHERE questao_id = $1", [questionId]);
    for (const [idx, alt] of question.alternatives.entries()) {
      await client.query(
        `INSERT INTO alternativas (questao_id, letra, texto, is_correta, ordem)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (questao_id, letra)
         DO UPDATE SET texto = EXCLUDED.texto, is_correta = EXCLUDED.is_correta, ordem = EXCLUDED.ordem`,
        [
          questionId,
          String(alt.letra || String.fromCharCode(65 + idx)).slice(0, 1),
          String(alt.texto || ""),
          Boolean(alt.is_correta || alt.correta || question.gabarito === alt.letra),
          idx + 1
        ]
      );
    }

    await client.query(
      "INSERT INTO questao_assuntos (questao_id, assunto_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [questionId, assunto.rows[0].id]
    );
    await insertQuestionSource(client, questionId, question);

    imported += 1;
  }

  return { imported, skipped };
}

function publicProjectCost(row) {
  return {
    id: row.id,
    nome: row.nome,
    categoria: row.categoria,
    descricao: row.descricao || "",
    produto: row.produto || "REMB Estudos",
    centroCusto: row.centro_custo || "",
    responsavel: row.responsavel || "",
    fornecedor: row.fornecedor || "",
    localContratacao: row.local_contratacao || "",
    linkDocumento: row.link_documento || "",
    observacoes: row.observacoes || "",
    valorPago: Number(row.valor_pago || 0),
    valorPrevisto: Number(row.valor_previsto || 0),
    valorRecorrente: Number(row.valor_recorrente || 0),
    moeda: row.moeda || "BRL",
    formaPagamento: row.forma_pagamento || "",
    status: row.status,
    dataPagamento: row.data_pagamento || "",
    dataCompetencia: row.data_competencia || "",
    dataVencimento: row.data_vencimento || "",
    proximoVencimento: row.proximo_vencimento || "",
    periodicidade: row.periodicidade || "unica",
    origemSistema: row.origem_sistema || "REMB Estudos",
    origemModulo: row.origem_modulo || "Financeiro",
    tipoRegistro: row.tipo_registro || "custo_previsto",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicProjectRevenue(row) {
  return {
    id: row.id,
    nome: row.nome,
    categoria: row.categoria,
    descricao: row.descricao || "",
    fonte: row.fonte || "",
    usuarioId: row.usuario_id || "",
    usuarioNome: row.usuario_nome || "",
    plano: row.plano || "",
    produto: row.produto || "REMB Estudos",
    valorRecebido: Number(row.valor_recebido || 0),
    valorPrevisto: Number(row.valor_previsto || 0),
    valorRecorrente: Number(row.valor_recorrente || 0),
    moeda: row.moeda || "BRL",
    formaRecebimento: row.forma_recebimento || "",
    status: row.status,
    dataRecebimento: row.data_recebimento || "",
    dataCompetencia: row.data_competencia || "",
    dataVencimento: row.data_vencimento || "",
    proximoRecebimento: row.proximo_recebimento || "",
    periodicidade: row.periodicidade || "unica",
    linkDocumento: row.link_documento || "",
    observacoes: row.observacoes || "",
    origemSistema: row.origem_sistema || "REMB Estudos",
    origemModulo: row.origem_modulo || "Financeiro",
    tipoRegistro: row.tipo_registro || "receita_prevista",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicSubscription(row) {
  return {
    id: row.id,
    usuarioId: row.usuario_id || "",
    usuarioNome: row.usuario_nome || "",
    plano: row.plano,
    periodicidade: row.periodicidade,
    valorTotal: Number(row.valor_total || 0),
    valorMensalReconhecido: Number(row.valor_mensal_reconhecido || 0),
    dataInicio: row.data_inicio || "",
    dataFim: row.data_fim || "",
    status: row.status,
    formaPagamento: row.forma_pagamento || "",
    observacoes: row.observacoes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicBilling(row) {
  return {
    id: row.id,
    assinaturaId: row.assinatura_id || "",
    usuarioNome: row.usuario_nome || "",
    plano: row.plano || "",
    descricao: row.descricao,
    valor: Number(row.valor || 0),
    moeda: row.moeda || "BRL",
    status: row.status,
    dataCompetencia: row.data_competencia || "",
    dataVencimento: row.data_vencimento || "",
    dataPagamento: row.data_pagamento || "",
    gateway: row.gateway || "",
    referenciaExterna: row.referencia_externa || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicRevenueCompetence(row) {
  return {
    id: row.id,
    assinaturaId: row.assinatura_id || "",
    usuarioNome: row.usuario_nome || "",
    plano: row.plano || "",
    competencia: row.competencia || "",
    valorPrevisto: Number(row.valor_previsto || 0),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicCashMovement(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    origemTipo: row.origem_tipo || "",
    origemId: row.origem_id || "",
    descricao: row.descricao,
    categoria: row.categoria || "",
    valor: Number(row.valor || 0),
    moeda: row.moeda || "BRL",
    dataMovimento: row.data_movimento || "",
    status: row.status,
    createdAt: row.created_at
  };
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function monthsBetweenInclusive(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 1;
  return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1);
}

function buildFinanceSummary(costs, revenues, subscriptions = [], billings = [], cashMovements = [], competences = []) {
  const summary = {
    receitaContratada: 0,
    receitasRecebidas: 0,
    receitasPrevistas: 0,
    receitasAReceber: 0,
    receitaRecorrenteMensal: 0,
    custosPagos: 0,
    custosPrevistos: 0,
    custoFixoMensal: 0,
    saldoRealizado: 0,
    saldoPrevisto: 0,
    margemMensalPrevista: 0,
    pendenciasReceita: 0,
    pendenciasCusto: 0,
    assinaturasAtivas: 0,
    cobrancasAbertas: 0,
    cobrancasAtrasadas: 0
  };

  subscriptions.forEach((item) => {
    summary.receitaContratada += item.valorTotal || 0;
    if (item.status === "ativa") summary.receitaRecorrenteMensal += item.valorMensalReconhecido || 0;
    if (item.status === "ativa") summary.assinaturasAtivas += 1;
  });

  competences.forEach((item) => {
    summary.receitasPrevistas += item.valorPrevisto || 0;
  });

  billings.forEach((item) => {
    if (["gerada", "a_receber", "atrasada"].includes(item.status)) {
      summary.receitasAReceber += item.valor || 0;
      summary.cobrancasAbertas += 1;
    }
    if (item.status === "atrasada") summary.cobrancasAtrasadas += 1;
  });

  cashMovements.forEach((item) => {
    if (item.tipo === "entrada" && item.status === "confirmado") summary.receitasRecebidas += item.valor || 0;
  });

  revenues.forEach((item) => {
    summary.receitasPrevistas += item.valorPrevisto || 0;
    if (item.periodicidade === "mensal") summary.receitaRecorrenteMensal += item.valorRecorrente || item.valorPrevisto;
    if (["prevista", "a_receber", "atrasada"].includes(item.status)) summary.pendenciasReceita += 1;
  });

  costs.forEach((item) => {
    summary.custosPagos += item.valorPago || 0;
    summary.custosPrevistos += item.valorPrevisto || 0;
    if (item.periodicidade === "mensal") summary.custoFixoMensal += item.valorRecorrente || item.valorPrevisto;
    if (["previsto", "aprovado", "contratado", "vencido"].includes(item.status)) summary.pendenciasCusto += 1;
  });

  summary.saldoRealizado = summary.receitasRecebidas - summary.custosPagos;
  summary.saldoPrevisto = summary.receitasPrevistas - summary.custosPrevistos;
  summary.margemMensalPrevista = summary.receitaRecorrenteMensal - summary.custoFixoMensal;
  return summary;
}

function toNullableDate(value) {
  return String(value || "").trim() || null;
}

function toMoney(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => !String(body[field] || "").trim());
  if (missing.length) {
    const err = new Error(`Campos obrigatórios ausentes: ${missing.join(", ")}`);
    err.statusCode = 400;
    throw err;
  }
}

function isAdminUser(user) {
  return Boolean(user && ["CEO / PROPRIETÁRIO", "ADMIN / GESTOR"].includes(user.nivel));
}

function requireAdmin(req, res, next) {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: "Acesso administrativo negado." });
  }
  next();
}

async function getUserAccessScope(user) {
  if (!user || isAdminUser(user)) return { restricted: false, provaIds: [], listaIds: [] };
  const [provas, listas] = await Promise.all([
    pool.query("SELECT prova_id FROM usuario_prova_acessos WHERE usuario_id = $1", [user.id]),
    pool.query("SELECT lista_id FROM usuario_lista_acessos WHERE usuario_id = $1", [user.id])
  ]);
  const provaIds = provas.rows.map((row) => row.prova_id).filter(Boolean);
  const listaIds = listas.rows.map((row) => row.lista_id).filter(Boolean);
  const manifest = readExamManifest();
  const provaNomes = provaIds
    .map((id) => manifest.provas?.[id]?.provaNomeBanco || manifest.cards?.[id]?.provaNomeBanco || "")
    .filter(Boolean);
  return {
    restricted: provaIds.length > 0 || listaIds.length > 0,
    provaIds,
    provaNomes,
    listaIds
  };
}

async function userCanAccessQuestion(user, questionRow) {
  if (!user || isAdminUser(user)) return true;
  const scope = await getUserAccessScope(user);
  if (!scope.restricted) return true;
  const origemImportacao = questionRow.origem_importacao || {};
  const provaId = origemImportacao.prova_id || origemImportacao.provaId || "";
  if (provaId && scope.provaIds.includes(provaId)) return true;
  if (scope.provaNomes?.length) {
    const sourceResult = await pool.query(
      `SELECT 1
       FROM questao_fontes qf
       JOIN provas p ON p.id = qf.prova_id
       WHERE qf.questao_id = $1 AND p.nome IN (SELECT unnest($2::text[]))
       LIMIT 1`,
      [questionRow.id, scope.provaNomes]
    );
    if (sourceResult.rowCount > 0) return true;
  }
  if (!scope.listaIds.length) return false;
  const result = await pool.query(
    "SELECT 1 FROM lista_questoes WHERE questao_id = $1 AND lista_id = ANY($2::text[]) LIMIT 1",
    [questionRow.id, scope.listaIds]
  );
  return result.rowCount > 0;
}

async function ensureAuthSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id VARCHAR(50) PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      senha_hash VARCHAR(255) NOT NULL,
      nivel VARCHAR(50) NOT NULL DEFAULT 'ALUNO',
      status VARCHAR(20) NOT NULL DEFAULT 'ATIVO',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone VARCHAR(30);
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS validade DATE;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS notas TEXT;

    CREATE TABLE IF NOT EXISTS usuario_sessoes (
      id SERIAL PRIMARY KEY,
      usuario_id VARCHAR(50) NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) UNIQUE NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS usuario_progresso (
      usuario_id VARCHAR(50) PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
      dados JSONB NOT NULL DEFAULT '{}'::jsonb,
      tempo_segundos INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_usuario_sessoes_token_hash ON usuario_sessoes(token_hash);
    CREATE INDEX IF NOT EXISTS idx_usuario_sessoes_expires_at ON usuario_sessoes(expires_at);

    CREATE TABLE IF NOT EXISTS roles (
      id VARCHAR(50) PRIMARY KEY,
      nome VARCHAR(50) UNIQUE NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS usuario_roles (
      usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
      role_id VARCHAR(50) REFERENCES roles(id) ON DELETE CASCADE,
      PRIMARY KEY (usuario_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS usuario_prova_acessos (
      usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
      prova_id VARCHAR(120) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (usuario_id, prova_id)
    );

    CREATE TABLE IF NOT EXISTS bancas (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orgaos (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(150) UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS concursos (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      banca_id INT REFERENCES bancas(id),
      orgao_id INT REFERENCES orgaos(id),
      ano INT,
      UNIQUE (nome, ano)
    );

    CREATE TABLE IF NOT EXISTS provas (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      concurso_id INT REFERENCES concursos(id) ON DELETE CASCADE,
      prova_url TEXT,
      gabarito_url TEXT,
      edital_url TEXT,
      recurso_url TEXT
    );

    ALTER TABLE provas ADD COLUMN IF NOT EXISTS prova_url TEXT;
    ALTER TABLE provas ADD COLUMN IF NOT EXISTS gabarito_url TEXT;
    ALTER TABLE provas ADD COLUMN IF NOT EXISTS edital_url TEXT;
    ALTER TABLE provas ADD COLUMN IF NOT EXISTS recurso_url TEXT;

    CREATE TABLE IF NOT EXISTS disciplinas (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assuntos (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(150) NOT NULL,
      disciplina_id INT REFERENCES disciplinas(id) ON DELETE CASCADE,
      UNIQUE (nome, disciplina_id)
    );

    CREATE TABLE IF NOT EXISTS questoes (
      id VARCHAR(160) PRIMARY KEY,
      tipo_questao VARCHAR(30) NOT NULL DEFAULT 'MULTIPLA_ESCOLHA',
      enunciado TEXT NOT NULL,
      justificativa TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'ATIVA',
      fingerprint VARCHAR(64) UNIQUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE questoes ADD COLUMN IF NOT EXISTS numero INT;
    ALTER TABLE questoes ADD COLUMN IF NOT EXISTS disciplina_id INT REFERENCES disciplinas(id) ON DELETE SET NULL;
    ALTER TABLE questoes ADD COLUMN IF NOT EXISTS assunto_id INT REFERENCES assuntos(id) ON DELETE SET NULL;
    ALTER TABLE questoes ADD COLUMN IF NOT EXISTS subassunto VARCHAR(180);
    ALTER TABLE questoes ADD COLUMN IF NOT EXISTS banca VARCHAR(120);
    ALTER TABLE questoes ADD COLUMN IF NOT EXISTS orgao VARCHAR(180);
    ALTER TABLE questoes ADD COLUMN IF NOT EXISTS cargo VARCHAR(180);
    ALTER TABLE questoes ADD COLUMN IF NOT EXISTS ano INT;
    ALTER TABLE questoes ADD COLUMN IF NOT EXISTS prova VARCHAR(255);
    ALTER TABLE questoes ADD COLUMN IF NOT EXISTS contexto TEXT;
    ALTER TABLE questoes ADD COLUMN IF NOT EXISTS dificuldade VARCHAR(50);
    ALTER TABLE questoes ADD COLUMN IF NOT EXISTS gabarito VARCHAR(10);
    ALTER TABLE questoes ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE questoes ADD COLUMN IF NOT EXISTS origem_questao JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE questoes ADD COLUMN IF NOT EXISTS origem_importacao JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE questoes ADD COLUMN IF NOT EXISTS raw_data JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE questoes ALTER COLUMN id TYPE VARCHAR(160);

    CREATE TABLE IF NOT EXISTS alternativas (
      id SERIAL PRIMARY KEY,
      questao_id VARCHAR(160) REFERENCES questoes(id) ON DELETE CASCADE,
      letra CHAR(1) NOT NULL,
      texto TEXT NOT NULL,
      is_correta BOOLEAN NOT NULL DEFAULT FALSE,
      ordem INT NOT NULL,
      UNIQUE (questao_id, letra)
    );

    CREATE TABLE IF NOT EXISTS questao_assuntos (
      questao_id VARCHAR(160) REFERENCES questoes(id) ON DELETE CASCADE,
      assunto_id INT REFERENCES assuntos(id) ON DELETE CASCADE,
      PRIMARY KEY (questao_id, assunto_id)
    );

    CREATE TABLE IF NOT EXISTS questao_fontes (
      id SERIAL PRIMARY KEY,
      questao_id VARCHAR(160) REFERENCES questoes(id) ON DELETE CASCADE,
      tipo_fonte VARCHAR(50) NOT NULL,
      prova_id INT REFERENCES provas(id) ON DELETE SET NULL,
      numero_original INT
    );

    CREATE TABLE IF NOT EXISTS gabarito_mapas (
      id VARCHAR(80) PRIMARY KEY,
      tipo_origem VARCHAR(30) NOT NULL,
      origem_id VARCHAR(160) NOT NULL,
      numero INT NOT NULL,
      gabarito VARCHAR(10) NOT NULL,
      origem_tipo VARCHAR(40) NOT NULL DEFAULT 'arquivo_admin',
      fonte TEXT,
      aplicado_questao_id VARCHAR(160) REFERENCES questoes(id) ON DELETE SET NULL,
      criado_por VARCHAR(50) REFERENCES usuarios(id) ON DELETE SET NULL,
      atualizado_por VARCHAR(50) REFERENCES usuarios(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tipo_origem, origem_id, numero)
    );

    CREATE TABLE IF NOT EXISTS listas (
      id VARCHAR(50) PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
      is_publica BOOLEAN NOT NULL DEFAULT FALSE,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      usar_na_resolucao BOOLEAN NOT NULL DEFAULT FALSE,
      origem_tipo VARCHAR(40) NOT NULL DEFAULT 'manual',
      arquivo_origem TEXT,
      compartilhamento_status VARCHAR(30) NOT NULL DEFAULT 'privada',
      gabaritos_pendentes INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE listas ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE listas ADD COLUMN IF NOT EXISTS usar_na_resolucao BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE listas ADD COLUMN IF NOT EXISTS origem_tipo VARCHAR(40) NOT NULL DEFAULT 'manual';
    ALTER TABLE listas ADD COLUMN IF NOT EXISTS arquivo_origem TEXT;
    ALTER TABLE listas ADD COLUMN IF NOT EXISTS compartilhamento_status VARCHAR(30) NOT NULL DEFAULT 'privada';
    ALTER TABLE listas ADD COLUMN IF NOT EXISTS gabaritos_pendentes INT NOT NULL DEFAULT 0;
    ALTER TABLE listas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

    CREATE TABLE IF NOT EXISTS usuario_lista_acessos (
      usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
      lista_id VARCHAR(50) REFERENCES listas(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (usuario_id, lista_id)
    );

    CREATE TABLE IF NOT EXISTS lista_questoes (
      lista_id VARCHAR(50) REFERENCES listas(id) ON DELETE CASCADE,
      questao_id VARCHAR(160) REFERENCES questoes(id) ON DELETE CASCADE,
      ordem INT NOT NULL,
      gabarito_informado VARCHAR(10),
      gabarito_divergente BOOLEAN NOT NULL DEFAULT FALSE,
      origem_vinculo VARCHAR(40) NOT NULL DEFAULT 'lista_usuario',
      PRIMARY KEY (lista_id, questao_id)
    );

    ALTER TABLE lista_questoes ADD COLUMN IF NOT EXISTS gabarito_informado VARCHAR(10);
    ALTER TABLE lista_questoes ADD COLUMN IF NOT EXISTS gabarito_divergente BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE lista_questoes ADD COLUMN IF NOT EXISTS origem_vinculo VARCHAR(40) NOT NULL DEFAULT 'lista_usuario';

    CREATE TABLE IF NOT EXISTS lista_tags (
      lista_id VARCHAR(50) REFERENCES listas(id) ON DELETE CASCADE,
      tag VARCHAR(80) NOT NULL,
      usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (lista_id, tag)
    );

    CREATE TABLE IF NOT EXISTS sessoes_estudo (
      id SERIAL PRIMARY KEY,
      usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
      status VARCHAR(30) NOT NULL DEFAULT 'ATIVA',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessao_questoes (
      sessao_id INT REFERENCES sessoes_estudo(id) ON DELETE CASCADE,
      questao_id VARCHAR(160) REFERENCES questoes(id) ON DELETE CASCADE,
      ordem INT NOT NULL,
      PRIMARY KEY (sessao_id, questao_id)
    );

    CREATE TABLE IF NOT EXISTS resolucoes_questao (
      id SERIAL PRIMARY KEY,
      sessao_id INT REFERENCES sessoes_estudo(id) ON DELETE SET NULL,
      usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
      questao_id VARCHAR(160) REFERENCES questoes(id) ON DELETE CASCADE,
      resposta VARCHAR(10) NOT NULL,
      is_correta BOOLEAN NOT NULL,
      tempo_segundos INT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS favoritos (
      usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
      questao_id VARCHAR(160) REFERENCES questoes(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (usuario_id, questao_id)
    );

    CREATE TABLE IF NOT EXISTS questao_anotacoes (
      usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
      questao_id VARCHAR(160) REFERENCES questoes(id) ON DELETE CASCADE,
      texto TEXT NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (usuario_id, questao_id)
    );

    CREATE TABLE IF NOT EXISTS marcacoes_usuario (
      usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
      questao_id VARCHAR(160) REFERENCES questoes(id) ON DELETE CASCADE,
      tipo_marcacao VARCHAR(50) NOT NULL,
      valor VARCHAR(255) NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (usuario_id, questao_id, tipo_marcacao)
    );

    ALTER TABLE alternativas ALTER COLUMN questao_id TYPE VARCHAR(160);
    ALTER TABLE questao_assuntos ALTER COLUMN questao_id TYPE VARCHAR(160);

    CREATE INDEX IF NOT EXISTS idx_questoes_fingerprint ON questoes(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_questoes_disciplina ON questoes(disciplina_id);
    CREATE INDEX IF NOT EXISTS idx_questoes_assunto ON questoes(assunto_id);
    CREATE INDEX IF NOT EXISTS idx_questoes_banca ON questoes(banca);
    CREATE INDEX IF NOT EXISTS idx_questoes_ano ON questoes(ano);
    CREATE INDEX IF NOT EXISTS idx_questoes_status ON questoes(status);
    CREATE INDEX IF NOT EXISTS idx_questoes_enunciado_tsv ON questoes USING GIN (to_tsvector('portuguese', enunciado));
    CREATE INDEX IF NOT EXISTS idx_questao_assuntos_assunto ON questao_assuntos(assunto_id);
    CREATE INDEX IF NOT EXISTS idx_questao_fontes_questao ON questao_fontes(questao_id);
    CREATE INDEX IF NOT EXISTS idx_questao_fontes_prova ON questao_fontes(prova_id);
    CREATE INDEX IF NOT EXISTS idx_gabarito_mapas_origem ON gabarito_mapas(tipo_origem, origem_id);
    CREATE INDEX IF NOT EXISTS idx_gabarito_mapas_questao ON gabarito_mapas(aplicado_questao_id);
    CREATE INDEX IF NOT EXISTS idx_listas_usuario ON listas(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_listas_tags_gin ON listas USING GIN(tags);
    CREATE INDEX IF NOT EXISTS idx_lista_tags_tag ON lista_tags(tag);
    CREATE INDEX IF NOT EXISTS idx_resolucoes_usuario_questao ON resolucoes_questao(usuario_id, questao_id);
    CREATE INDEX IF NOT EXISTS idx_usuario_prova_acessos_usuario ON usuario_prova_acessos(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_usuario_lista_acessos_usuario ON usuario_lista_acessos(usuario_id);

    CREATE TABLE IF NOT EXISTS projeto_custo_categorias (
      id VARCHAR(50) PRIMARY KEY,
      nome VARCHAR(120) UNIQUE NOT NULL,
      descricao TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projeto_custo_fornecedores (
      id VARCHAR(50) PRIMARY KEY,
      nome VARCHAR(150) UNIQUE NOT NULL,
      site VARCHAR(255),
      contato VARCHAR(150),
      observacoes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projeto_custos (
      id VARCHAR(50) PRIMARY KEY,
      nome VARCHAR(180) NOT NULL,
      categoria VARCHAR(120) NOT NULL,
      descricao TEXT,
      produto VARCHAR(120) NOT NULL DEFAULT 'REMB Estudos',
      centro_custo VARCHAR(120),
      responsavel VARCHAR(120),
      fornecedor VARCHAR(150),
      local_contratacao VARCHAR(180),
      link_documento TEXT,
      observacoes TEXT,
      valor_pago NUMERIC(12,2) NOT NULL DEFAULT 0,
      valor_previsto NUMERIC(12,2) NOT NULL DEFAULT 0,
      valor_recorrente NUMERIC(12,2) NOT NULL DEFAULT 0,
      moeda VARCHAR(10) NOT NULL DEFAULT 'BRL',
      forma_pagamento VARCHAR(80),
      status VARCHAR(30) NOT NULL DEFAULT 'previsto',
      data_pagamento DATE,
      data_competencia DATE,
      data_vencimento DATE,
      proximo_vencimento DATE,
      periodicidade VARCHAR(30) NOT NULL DEFAULT 'unica',
      origem_sistema VARCHAR(80) NOT NULL DEFAULT 'REMB Estudos',
      origem_modulo VARCHAR(80) NOT NULL DEFAULT 'Financeiro',
      tipo_registro VARCHAR(50) NOT NULL DEFAULT 'custo_previsto',
      criado_por VARCHAR(50) REFERENCES usuarios(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_projeto_custos_status ON projeto_custos(status);
    CREATE INDEX IF NOT EXISTS idx_projeto_custos_categoria ON projeto_custos(categoria);
    CREATE INDEX IF NOT EXISTS idx_projeto_custos_fornecedor ON projeto_custos(fornecedor);
    CREATE INDEX IF NOT EXISTS idx_projeto_custos_vencimento ON projeto_custos(data_vencimento, proximo_vencimento);

    CREATE TABLE IF NOT EXISTS projeto_planos_assinatura (
      id VARCHAR(50) PRIMARY KEY,
      nome VARCHAR(120) UNIQUE NOT NULL,
      descricao TEXT,
      valor_mensal NUMERIC(12,2) NOT NULL DEFAULT 0,
      valor_anual NUMERIC(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'ativo',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projeto_receitas (
      id VARCHAR(50) PRIMARY KEY,
      nome VARCHAR(180) NOT NULL,
      categoria VARCHAR(120) NOT NULL,
      descricao TEXT,
      fonte VARCHAR(120),
      usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE SET NULL,
      usuario_nome VARCHAR(150),
      plano VARCHAR(120),
      produto VARCHAR(120) NOT NULL DEFAULT 'REMB Estudos',
      valor_recebido NUMERIC(12,2) NOT NULL DEFAULT 0,
      valor_previsto NUMERIC(12,2) NOT NULL DEFAULT 0,
      valor_recorrente NUMERIC(12,2) NOT NULL DEFAULT 0,
      moeda VARCHAR(10) NOT NULL DEFAULT 'BRL',
      forma_recebimento VARCHAR(80),
      status VARCHAR(30) NOT NULL DEFAULT 'prevista',
      data_recebimento DATE,
      data_competencia DATE,
      data_vencimento DATE,
      proximo_recebimento DATE,
      periodicidade VARCHAR(30) NOT NULL DEFAULT 'mensal',
      link_documento TEXT,
      observacoes TEXT,
      origem_sistema VARCHAR(80) NOT NULL DEFAULT 'REMB Estudos',
      origem_modulo VARCHAR(80) NOT NULL DEFAULT 'Financeiro',
      tipo_registro VARCHAR(50) NOT NULL DEFAULT 'receita_prevista',
      criado_por VARCHAR(50) REFERENCES usuarios(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_projeto_receitas_status ON projeto_receitas(status);
    CREATE INDEX IF NOT EXISTS idx_projeto_receitas_categoria ON projeto_receitas(categoria);
    CREATE INDEX IF NOT EXISTS idx_projeto_receitas_usuario ON projeto_receitas(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_projeto_receitas_datas ON projeto_receitas(data_recebimento, data_vencimento, proximo_recebimento);

    CREATE TABLE IF NOT EXISTS projeto_assinaturas (
      id VARCHAR(50) PRIMARY KEY,
      usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE SET NULL,
      usuario_nome VARCHAR(150),
      plano VARCHAR(120) NOT NULL,
      periodicidade VARCHAR(30) NOT NULL DEFAULT 'mensal',
      valor_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      valor_mensal_reconhecido NUMERIC(12,2) NOT NULL DEFAULT 0,
      data_inicio DATE NOT NULL,
      data_fim DATE NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'ativa',
      forma_pagamento VARCHAR(80),
      observacoes TEXT,
      criado_por VARCHAR(50) REFERENCES usuarios(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projeto_receita_competencias (
      id VARCHAR(50) PRIMARY KEY,
      assinatura_id VARCHAR(50) REFERENCES projeto_assinaturas(id) ON DELETE CASCADE,
      usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE SET NULL,
      usuario_nome VARCHAR(150),
      plano VARCHAR(120),
      competencia DATE NOT NULL,
      valor_previsto NUMERIC(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'prevista',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projeto_cobrancas (
      id VARCHAR(50) PRIMARY KEY,
      assinatura_id VARCHAR(50) REFERENCES projeto_assinaturas(id) ON DELETE SET NULL,
      usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE SET NULL,
      usuario_nome VARCHAR(150),
      plano VARCHAR(120),
      descricao VARCHAR(180) NOT NULL,
      valor NUMERIC(12,2) NOT NULL DEFAULT 0,
      moeda VARCHAR(10) NOT NULL DEFAULT 'BRL',
      status VARCHAR(30) NOT NULL DEFAULT 'a_receber',
      data_competencia DATE,
      data_vencimento DATE NOT NULL,
      data_pagamento DATE,
      gateway VARCHAR(80),
      referencia_externa VARCHAR(180),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projeto_recebimentos (
      id VARCHAR(50) PRIMARY KEY,
      cobranca_id VARCHAR(50) REFERENCES projeto_cobrancas(id) ON DELETE SET NULL,
      assinatura_id VARCHAR(50) REFERENCES projeto_assinaturas(id) ON DELETE SET NULL,
      valor NUMERIC(12,2) NOT NULL DEFAULT 0,
      moeda VARCHAR(10) NOT NULL DEFAULT 'BRL',
      data_recebimento DATE NOT NULL,
      forma_recebimento VARCHAR(80),
      gateway VARCHAR(80),
      referencia_externa VARCHAR(180),
      status VARCHAR(30) NOT NULL DEFAULT 'confirmado',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projeto_caixa_movimentos (
      id VARCHAR(50) PRIMARY KEY,
      tipo VARCHAR(20) NOT NULL,
      origem_tipo VARCHAR(50),
      origem_id VARCHAR(50),
      descricao VARCHAR(180) NOT NULL,
      categoria VARCHAR(120),
      valor NUMERIC(12,2) NOT NULL DEFAULT 0,
      moeda VARCHAR(10) NOT NULL DEFAULT 'BRL',
      data_movimento DATE NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'confirmado',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_projeto_assinaturas_status ON projeto_assinaturas(status);
    CREATE INDEX IF NOT EXISTS idx_projeto_assinaturas_usuario ON projeto_assinaturas(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_projeto_receita_competencias_assinatura ON projeto_receita_competencias(assinatura_id);
    CREATE INDEX IF NOT EXISTS idx_projeto_receita_competencias_data ON projeto_receita_competencias(competencia);
    CREATE INDEX IF NOT EXISTS idx_projeto_cobrancas_status ON projeto_cobrancas(status);
    CREATE INDEX IF NOT EXISTS idx_projeto_cobrancas_vencimento ON projeto_cobrancas(data_vencimento);
    CREATE INDEX IF NOT EXISTS idx_projeto_caixa_movimentos_data ON projeto_caixa_movimentos(data_movimento);
  `);

  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL);
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const existing = await pool.query("SELECT id, senha_hash FROM usuarios WHERE email = $1", [adminEmail]);
    if (existing.rowCount === 0) {
      await pool.query(
        `INSERT INTO usuarios (id, nome, email, senha_hash, nivel, status)
         VALUES ($1, $2, $3, $4, $5, 'ATIVO')`,
        [
          `u_${crypto.randomUUID()}`,
          process.env.ADMIN_NAME || "Administrador",
          adminEmail,
          hashPassword(adminPassword),
          "CEO / PROPRIETÁRIO"
        ]
      );
    } else {
      const shouldResetAdminPassword = process.env.ADMIN_RESET_PASSWORD === "true";
      const hasLegacyPassword = !String(existing.rows[0].senha_hash || "").startsWith("scrypt$");
      await pool.query(
        `UPDATE usuarios
         SET nome = COALESCE(NULLIF($2, ''), nome),
             senha_hash = $3,
             nivel = 'CEO / PROPRIETÁRIO',
             status = 'ATIVO',
             updated_at = NOW()
         WHERE email = $1 AND ($4 = true OR senha_hash NOT LIKE 'scrypt$%')`,
        [adminEmail, process.env.ADMIN_NAME || "", hashPassword(adminPassword), shouldResetAdminPassword || hasLegacyPassword]
      );
    }
  }
}

async function authMiddleware(req, res, next) {
  try {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (!token) return next();

    const tokenHash = hashToken(token);
    const result = await pool.query(
      `SELECT u.*
       FROM usuario_sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.status = 'ATIVO'`,
      [tokenHash]
    );

    if (result.rowCount === 0) {
      clearSessionCookie(res);
      return next();
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    next(error);
  }
}

app.use("/api", authMiddleware);

app.get("/api/auth/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Não autenticado." });
  res.json({ user: publicUser(req.user) });
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    requireFields(req.body, ["email", "senha"]);
    const email = normalizeEmail(req.body.email);
    const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user || !verifyPassword(req.body.senha, user.senha_hash)) {
      return res.status(401).json({ error: "E-mail ou senha incorretos." });
    }
    if (user.status !== "ATIVO") {
      return res.status(403).json({ error: "Esta conta está inativa ou expirada." });
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await pool.query(
      "INSERT INTO usuario_sessoes (usuario_id, token_hash, expires_at) VALUES ($1, $2, $3)",
      [user.id, hashToken(token), expiresAt]
    );
    setSessionCookie(res, token, expiresAt);
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    requireFields(req.body, ["nome", "email", "senha"]);
    if (String(req.body.senha).length < 8) {
      return res.status(400).json({ error: "A senha precisa ter no mínimo 8 caracteres." });
    }

    const email = normalizeEmail(req.body.email);
    const user = {
      id: `u_${crypto.randomUUID()}`,
      nome: String(req.body.nome).trim(),
      email,
      senha_hash: hashPassword(req.body.senha),
      nivel: "ALUNO FREE",
      status: "ATIVO"
    };

    const inserted = await pool.query(
      `INSERT INTO usuarios (id, nome, email, senha_hash, nivel, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [user.id, user.nome, user.email, user.senha_hash, user.nivel, user.status]
    );

    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await pool.query(
      "INSERT INTO usuario_sessoes (usuario_id, token_hash, expires_at) VALUES ($1, $2, $3)",
      [inserted.rows[0].id, hashToken(token), expiresAt]
    );
    setSessionCookie(res, token, expiresAt);
    res.status(201).json({ user: publicUser(inserted.rows[0]) });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Este e-mail já está cadastrado." });
    next(error);
  }
});

app.post("/api/auth/logout", async (req, res, next) => {
  try {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) await pool.query("DELETE FROM usuario_sessoes WHERE token_hash = $1", [hashToken(token)]);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/progress", async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Não autenticado." });
    const result = await pool.query("SELECT dados, tempo_segundos FROM usuario_progresso WHERE usuario_id = $1", [
      req.user.id
    ]);
    res.json({
      dados: result.rows[0]?.dados || {},
      tempoSegundos: result.rows[0]?.tempo_segundos || 0
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/progress", async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Não autenticado." });
    await pool.query(
      `INSERT INTO usuario_progresso (usuario_id, dados, tempo_segundos, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (usuario_id)
       DO UPDATE SET dados = EXCLUDED.dados, tempo_segundos = EXCLUDED.tempo_segundos, updated_at = NOW()`,
      [req.user.id, req.body.dados || {}, Number(req.body.tempoSegundos || 0)]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/access/scope", async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Não autenticado." });
    const scope = await getUserAccessScope(req.user);
    res.json({ restricted: scope.restricted, provas: scope.provaIds, listas: scope.listaIds });
  } catch (error) {
    next(error);
  }
});

app.get("/api/questions", async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Não autenticado." });

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;
    const includeAnswer = req.query.includeAnswer === "true";
    const accessScope = await getUserAccessScope(req.user);
    const { whereSql, values } = buildQuestionsWhere(req.query, accessScope);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM questoes q
       LEFT JOIN disciplinas d ON d.id = q.disciplina_id
       LEFT JOIN assuntos a ON a.id = q.assunto_id
       WHERE ${whereSql}`,
      values
    );

    const listValues = [...values, limit, offset];
    const result = await pool.query(
      `SELECT
         q.*,
         d.nome AS disciplina_nome,
         a.nome AS assunto_nome,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'letra', alt.letra,
               'texto', alt.texto,
               'is_correta', alt.is_correta,
               'correta', alt.is_correta
             )
             ORDER BY alt.ordem
           ) FILTER (WHERE alt.id IS NOT NULL),
           '[]'::jsonb
         ) AS alternativas
       FROM questoes q
       LEFT JOIN disciplinas d ON d.id = q.disciplina_id
       LEFT JOIN assuntos a ON a.id = q.assunto_id
       LEFT JOIN alternativas alt ON alt.questao_id = q.id
       WHERE ${whereSql}
       GROUP BY q.id, d.nome, a.nome
       ORDER BY q.created_at DESC, q.numero NULLS LAST
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      listValues
    );

    const total = countResult.rows[0]?.total || 0;
    res.json({
      data: result.rows.map((row) => publicQuestion(row, includeAnswer, isAdminUser(req.user))),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/questions/:id", async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Não autenticado." });
    const includeAnswer = req.query.includeAnswer === "true";
    const result = await pool.query(
      `SELECT
         q.*,
         d.nome AS disciplina_nome,
         a.nome AS assunto_nome,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'letra', alt.letra,
               'texto', alt.texto,
               'is_correta', alt.is_correta,
               'correta', alt.is_correta
             )
             ORDER BY alt.ordem
           ) FILTER (WHERE alt.id IS NOT NULL),
           '[]'::jsonb
         ) AS alternativas
       FROM questoes q
       LEFT JOIN disciplinas d ON d.id = q.disciplina_id
       LEFT JOIN assuntos a ON a.id = q.assunto_id
       LEFT JOIN alternativas alt ON alt.questao_id = q.id
       WHERE q.id = $1 AND q.status = 'ATIVA'
       GROUP BY q.id, d.nome, a.nome`,
      [req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Questão não encontrada." });
    if (!(await userCanAccessQuestion(req.user, result.rows[0]))) {
      return res.status(404).json({ error: "Questão não encontrada." });
    }
    res.json({ question: publicQuestion(result.rows[0], includeAnswer, isAdminUser(req.user)) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/questions/:id/curation", requireAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const questionId = req.params.id;
    await client.query("BEGIN");
    const existing = await client.query("SELECT * FROM questoes WHERE id = $1 FOR UPDATE", [questionId]);
    if (existing.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Questão não encontrada." });
    }

    const current = existing.rows[0];
    const raw = current.raw_data || {};
    const origemQuestao = {
      ...(raw.origem_questao || {}),
      banca: String(req.body.banca ?? current.banca ?? raw.origem_questao?.banca ?? "").trim()
    };
    const enunciado = String(req.body.enunciado ?? current.enunciado ?? "").trim();
    if (!enunciado) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "O enunciado não pode ficar vazio." });
    }

    const gabarito = normalizeAnswerValue(req.body.gabarito);
    const gabaritoOrigem = String(req.body.gabaritoOrigem || req.body.gabarito_origem || "laboratorio").trim() || "laboratorio";
    const gabaritoFonte = String(req.body.gabaritoFonte || req.body.gabarito_fonte || "").trim();
    const { disciplinaId, assuntoId } = await upsertQuestionClassification(
      client,
      req.body.disciplina ?? raw.disciplina ?? "Outros",
      req.body.assunto ?? raw.assunto ?? "Geral"
    );

    const currentAlternatives = await client.query(
      "SELECT letra, texto, is_correta, ordem FROM alternativas WHERE questao_id = $1 ORDER BY ordem, letra",
      [questionId]
    );
    const payloadAlternatives = Array.isArray(req.body.alternativas) ? req.body.alternativas : [];
    const alternatives = (payloadAlternatives.length ? payloadAlternatives : currentAlternatives.rows).map((alt, idx) => ({
      letra: String(alt.letra || String.fromCharCode(65 + idx)).trim().toUpperCase().slice(0, 1),
      texto: String(alt.texto || "").trim(),
      explicacao: String(alt.explicacao || alt.justificativa || "").trim(),
      ordem: Number.isFinite(Number(alt.ordem)) ? Number(alt.ordem) : idx + 1
    })).filter((alt) => alt.letra && alt.texto);

    const rawData = {
      ...raw,
      enunciado,
      gabarito,
      disciplina: String(req.body.disciplina ?? raw.disciplina ?? "Outros").trim() || "Outros",
      assunto: String(req.body.assunto ?? raw.assunto ?? "Geral").trim() || "Geral",
      origem_questao: origemQuestao,
      alternativas: alternatives,
      passos_correcao: Array.isArray(req.body.passos_correcao) ? req.body.passos_correcao : raw.passos_correcao,
      gabarito_origem: gabarito
        ? {
            tipo: gabaritoOrigem,
            fonte: gabaritoFonte,
            atualizado_em: new Date().toISOString(),
            atualizado_por: req.user.id
          }
        : raw.gabarito_origem,
      curadoria: {
        ...(raw.curadoria || {}),
        atualizada_em: new Date().toISOString(),
        atualizada_por: req.user.id,
        origem: gabaritoOrigem
      }
    };

    const updated = await client.query(
      `UPDATE questoes
       SET enunciado = $2,
           gabarito = $3,
           banca = $4,
           disciplina_id = $5,
           assunto_id = $6,
           raw_data = $7,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [questionId, enunciado, gabarito, origemQuestao.banca || "", disciplinaId, assuntoId, JSON.stringify(rawData)]
    );

    if (alternatives.length) {
      await client.query("DELETE FROM alternativas WHERE questao_id = $1", [questionId]);
      for (const alt of alternatives) {
        await client.query(
          `INSERT INTO alternativas (questao_id, letra, texto, is_correta, ordem)
           VALUES ($1, $2, $3, $4, $5)`,
          [questionId, alt.letra, alt.texto, Boolean(gabarito && alt.letra === gabarito), alt.ordem]
        );
      }
    } else if (gabarito) {
      await client.query("UPDATE alternativas SET is_correta = (letra = $2) WHERE questao_id = $1", [questionId, gabarito]);
    }

    await client.query(
      "INSERT INTO questao_assuntos (questao_id, assunto_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [questionId, assuntoId]
    );
    await client.query("COMMIT");

    const full = await pool.query(
      `SELECT
         q.*,
         d.nome AS disciplina_nome,
         a.nome AS assunto_nome,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'letra', alt.letra,
               'texto', alt.texto,
               'is_correta', alt.is_correta,
               'correta', alt.is_correta
             )
             ORDER BY alt.ordem
           ) FILTER (WHERE alt.id IS NOT NULL),
           '[]'::jsonb
         ) AS alternativas
       FROM questoes q
       LEFT JOIN disciplinas d ON d.id = q.disciplina_id
       LEFT JOIN assuntos a ON a.id = q.assunto_id
       LEFT JOIN alternativas alt ON alt.questao_id = q.id
       WHERE q.id = $1
       GROUP BY q.id, d.nome, a.nome`,
      [updated.rows[0].id]
    );
    res.json({ ok: true, question: publicQuestion(full.rows[0], true, true) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

app.get("/api/lists", async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Não autenticado." });
    const includeQuestions = req.query.includeQuestions === "true";
    const search = String(req.query.search || "").trim().toLowerCase();
    const accessScope = await getUserAccessScope(req.user);
    const values = [req.user.id];
    let where = accessScope.restricted ? "(l.usuario_id = $1" : "(l.usuario_id = $1 OR l.is_publica = TRUE";
    if (accessScope.restricted && accessScope.listaIds.length) {
      values.push(accessScope.listaIds);
      where += ` OR l.id = ANY($${values.length}::text[])`;
    }
    where += ")";
    if (search) {
      values.push(`%${search}%`);
      where += ` AND (lower(l.nome) LIKE $${values.length} OR EXISTS (SELECT 1 FROM lista_tags lt WHERE lt.lista_id = l.id AND lower(lt.tag) LIKE $${values.length}))`;
    }

    const listsResult = await pool.query(
      `SELECT l.*, COALESCE(COUNT(lq.questao_id), 0)::int AS total_questoes
       FROM listas l
       LEFT JOIN lista_questoes lq ON lq.lista_id = l.id
       WHERE ${where}
       GROUP BY l.id
       ORDER BY l.updated_at DESC, l.created_at DESC`,
      values
    );

    const lists = [];
    for (const row of listsResult.rows) {
      const item = {
        id: row.id,
        nome: row.nome,
        tags: row.tags || [],
        criadaEm: row.created_at,
        atualizadaEm: row.updated_at,
        tipo: row.origem_tipo || "lista_usuario",
        isPublica: row.is_publica,
        usarNaResolucao: row.usar_na_resolucao,
        compartilhamentoStatus: row.compartilhamento_status || "privada",
        gabaritosPendentes: row.gabaritos_pendentes || 0,
        totalQuestoes: row.total_questoes || 0,
        origemLista: {
          tipo: row.origem_tipo || "lista_usuario",
          arquivo: row.arquivo_origem || "",
          visibilidade: row.is_publica ? "compartilhada" : "privada",
          persistencia: "banco"
        }
      };

      if (includeQuestions) {
        const questionResult = await pool.query(
          `SELECT
             q.*,
             d.nome AS disciplina_nome,
             a.nome AS assunto_nome,
             COALESCE(
               jsonb_agg(
                 jsonb_build_object(
                   'letra', alt.letra,
                   'texto', alt.texto,
                   'is_correta', alt.is_correta,
                   'correta', alt.is_correta
                 )
                 ORDER BY alt.ordem
               ) FILTER (WHERE alt.id IS NOT NULL),
               '[]'::jsonb
             ) AS alternativas
           FROM lista_questoes lq
           JOIN questoes q ON q.id = lq.questao_id
           LEFT JOIN disciplinas d ON d.id = q.disciplina_id
           LEFT JOIN assuntos a ON a.id = q.assunto_id
           LEFT JOIN alternativas alt ON alt.questao_id = q.id
           WHERE lq.lista_id = $1
           GROUP BY q.id, d.nome, a.nome, lq.ordem
           ORDER BY lq.ordem`,
          [row.id]
        );
        item.questoes = questionResult.rows.map((qRow) => publicQuestion(qRow, true, isAdminUser(req.user)));
      }

      lists.push(item);
    }

    res.json({ lists });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/lists/:id", async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Não autenticado." });
    const listId = req.params.id;
    const current = await pool.query("SELECT id FROM listas WHERE id = $1 AND usuario_id = $2", [listId, req.user.id]);
    if (current.rowCount === 0) return res.status(404).json({ error: "Lista não encontrada para este usuário." });

    const tags = Array.isArray(req.body.tags) ? req.body.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 30) : null;
    const usarNaResolucao = typeof req.body.usarNaResolucao === "boolean" ? req.body.usarNaResolucao : null;

    if (tags) {
      await pool.query("UPDATE listas SET tags = $2, updated_at = NOW() WHERE id = $1 AND usuario_id = $3", [listId, JSON.stringify([...new Set(tags)]), req.user.id]);
      await pool.query("DELETE FROM lista_tags WHERE lista_id = $1", [listId]);
      for (const tag of [...new Set(tags)]) {
        await pool.query("INSERT INTO lista_tags (lista_id, tag, usuario_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [listId, tag, req.user.id]);
      }
    }

    if (usarNaResolucao !== null) {
      await pool.query("UPDATE listas SET usar_na_resolucao = $2, updated_at = NOW() WHERE id = $1 AND usuario_id = $3", [listId, usarNaResolucao, req.user.id]);
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
app.get("/api/questions-meta", async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Não autenticado." });
    const assuntoParams = [];
    let assuntoWhere = "";
    if (req.query.disciplina && req.query.disciplina !== "todas") {
      assuntoParams.push(req.query.disciplina);
      assuntoWhere = "WHERE d.nome = $1";
    }
    const [disciplinas, assuntos, bancas, anos, total] = await Promise.all([
      pool.query("SELECT nome FROM disciplinas ORDER BY nome"),
      pool.query(
        `SELECT DISTINCT a.nome
         FROM assuntos a
         JOIN disciplinas d ON d.id = a.disciplina_id
         ${assuntoWhere}
         ORDER BY a.nome`,
        assuntoParams
      ),
      pool.query("SELECT DISTINCT banca AS nome FROM questoes WHERE COALESCE(banca, '') <> '' ORDER BY banca"),
      pool.query("SELECT DISTINCT ano FROM questoes WHERE ano IS NOT NULL ORDER BY ano DESC"),
      pool.query("SELECT COUNT(*)::int AS total FROM questoes WHERE status = 'ATIVA'")
    ]);
    res.json({
      total: total.rows[0]?.total || 0,
      disciplinas: disciplinas.rows.map((row) => row.nome),
      assuntos: assuntos.rows.map((row) => row.nome),
      bancas: bancas.rows.map((row) => row.nome),
      anos: anos.rows.map((row) => row.ano)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/answer-keys", requireAdmin, async (req, res, next) => {
  try {
    const tipoOrigem = String(req.query.tipoOrigem || req.query.tipo || "").trim().toLowerCase();
    const origemId = String(req.query.origemId || "").trim();
    if (!["prova", "lista"].includes(tipoOrigem) || !origemId) {
      return res.status(400).json({ error: "Informe tipoOrigem e origemId para consultar gabaritos." });
    }
    const result = await pool.query(
      `SELECT id, tipo_origem, origem_id, numero, gabarito, origem_tipo, fonte, aplicado_questao_id, created_at, updated_at
       FROM gabarito_mapas
       WHERE tipo_origem = $1 AND origem_id = $2
       ORDER BY numero`,
      [tipoOrigem, origemId]
    );
    res.json({
      ok: true,
      items: result.rows.map((row) => ({
        id: row.id,
        tipoOrigem: row.tipo_origem,
        origemId: row.origem_id,
        numero: row.numero,
        gabarito: row.gabarito,
        origemTipo: row.origem_tipo,
        fonte: row.fonte || "",
        aplicadoQuestaoId: row.aplicado_questao_id || "",
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/answer-keys", requireAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const item = await saveAnswerKeyMapItem(client, {
      tipoOrigem: req.body.tipoOrigem,
      origemId: req.body.origemId,
      numero: req.body.numero,
      gabarito: req.body.gabarito,
      origemTipo: req.body.origemTipo || "ajuste_manual",
      fonte: req.body.fonte || "Painel de Gabaritos",
      userId: req.user.id
    });
    let applyResult = { applied: 0, matched: 0 };
    if (req.body.sourceFile) {
      applyResult = await applyAnswerKeyMapToQuestions(client, {
        tipoOrigem: req.body.tipoOrigem,
        origemId: req.body.origemId,
        sourceFile: req.body.sourceFile,
        userId: req.user.id
      });
    }
    await client.query("COMMIT");
    res.json({ ok: true, item, applyResult });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/admin/answer-keys/import", requireAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (items.length === 0) return res.status(400).json({ error: "Nenhum gabarito explícito foi informado." });
    await client.query("BEGIN");
    let saved = 0;
    for (const item of items) {
      await saveAnswerKeyMapItem(client, {
        tipoOrigem: req.body.tipoOrigem,
        origemId: req.body.origemId,
        numero: item.numero,
        gabarito: item.gabarito,
        origemTipo: req.body.origemTipo || "arquivo_admin",
        fonte: req.body.fonte || "",
        userId: req.user.id
      });
      saved += 1;
    }
    let applyResult = { applied: 0, matched: 0 };
    if (req.body.sourceFile) {
      applyResult = await applyAnswerKeyMapToQuestions(client, {
        tipoOrigem: req.body.tipoOrigem,
        origemId: req.body.origemId,
        sourceFile: req.body.sourceFile,
        userId: req.user.id
      });
    }
    await client.query("COMMIT");
    res.json({ ok: true, saved, applyResult });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/admin/answer-keys/apply", requireAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const applyResult = await applyAnswerKeyMapToQuestions(client, {
      tipoOrigem: req.body.tipoOrigem,
      origemId: req.body.origemId,
      sourceFile: req.body.sourceFile,
      userId: req.user.id
    });
    await client.query("COMMIT");
    res.json({ ok: true, applyResult });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/admin/questions/import", requireAdmin, async (req, res, next) => {
  const allowedFiles = new Set([
    "1___100_questoes_ALUNO.json",
    "2___100_questoes_ALUNO.json",
    "3___100_questoes_ALUNO.json",
    "questoes_cespe_tratadas.json",
    "questoes_importadas_novas.json"
  ]);

  try {
    const requestedFiles = Array.isArray(req.body.files) && req.body.files.length > 0
      ? req.body.files
      : Array.from(allowedFiles);
    const files = requestedFiles.filter((file) => allowedFiles.has(file));
    if (files.length === 0) return res.status(400).json({ error: "Nenhum arquivo de questões permitido foi informado." });

    const client = await pool.connect();
    const summary = [];
    try {
      await client.query("BEGIN");
      for (const file of files) {
        const filePath = path.join(__dirname, "dados", file);
        if (!fs.existsSync(filePath)) {
          summary.push({ file, imported: 0, skipped: 0, status: "arquivo_nao_encontrado" });
          continue;
        }
        const questions = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const result = await importQuestionBatch(client, Array.isArray(questions) ? questions : [], file);
        summary.push({ file, ...result, status: "importado" });
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.json({ ok: true, summary });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/provas/link-documents", requireAdmin, async (req, res, next) => {
  try {
    const provaId = String(req.body.provaId || "").trim();
    if (!provaId) return res.status(400).json({ error: "Informe o card/prova para vincular documentos." });
    const allowedFields = ["origem", "prova", "gabarito", "edital", "recurso", "questoes"];
    const incoming = {};
    for (const field of allowedFields) {
      const value = String(req.body[field] || "").trim();
      if (value) incoming[field] = value;
    }
    if (!Object.keys(incoming).length) {
      return res.status(400).json({ error: "Informe pelo menos um vínculo de documento ou arquivo." });
    }
    const manifest = readExamManifest();
    manifest.provas[provaId] = {
      ...(manifest.provas[provaId] || {}),
      ...incoming,
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: req.user?.email || req.user?.id || "admin"
    };
    writeExamManifest(manifest);
    res.json({ ok: true, provaId, documentos: manifest.provas[provaId] });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/provas/continue-pipeline", requireAdmin, async (req, res, next) => {
  try {
    const provaId = String(req.body.provaId || "").trim();
    if (!provaId) return res.status(400).json({ error: "Informe o card/prova para continuar o pipeline." });

    const allowedFields = ["origem", "prova", "gabarito", "edital", "recurso", "questoes"];
    const incoming = {};
    for (const field of allowedFields) {
      const value = String(req.body[field] || "").trim();
      if (value) incoming[field] = value;
    }

    const manifest = readExamManifest();
    const previous = manifest.provas[provaId] || {};
    const documentos = { ...previous, ...incoming };
    const steps = [];

    if (Object.keys(incoming).length) steps.push("Vínculos informados foram salvos.");
    const origem = documentos.origem || documentos.origemUrl || documentos.fonte || documentos.source || "";
    if (origem && (!documentos.prova || !documentos.gabarito)) {
      steps.push("Consultando a página oficial de origem.");
      const discovered = await discoverExamDocumentsFromOrigin(origem);
      if (discovered.error) {
        steps.push(`Não foi possível consultar a origem automaticamente: ${discovered.error}`);
      } else {
        if (!documentos.prova && discovered.found.prova) {
          documentos.prova = discovered.found.prova;
          steps.push("Documento da prova localizado na página oficial.");
        }
        if (!documentos.gabarito && discovered.found.gabarito) {
          documentos.gabarito = discovered.found.gabarito;
          steps.push("Documento de gabarito localizado na página oficial.");
        }
        if (!documentos.edital && discovered.found.edital) documentos.edital = discovered.found.edital;
        if (!documentos.recurso && discovered.found.recurso) documentos.recurso = discovered.found.recurso;
        if (!discovered.found.prova && !discovered.found.gabarito) {
          steps.push("A origem foi consultada, mas prova/gabarito não foram identificados com segurança.");
        }
      }
    }

    for (const tipo of ["prova", "gabarito", "edital", "recurso"]) {
      const remote = documentos[tipo];
      const local = await downloadExamDocument(provaId, tipo, remote);
      if (local) {
        documentos[tipo] = local;
        steps.push(`${tipo.charAt(0).toUpperCase()}${tipo.slice(1)} baixado para a base local.`);
      }
    }

    const questionFile = findProcessableQuestionFile({
      provaId,
      sourceFile: req.body.sourceFile,
      docs: documentos
    });
    const aguardandoRevisao = documentos.estruturacao?.status === "gerado_para_revisao";
    if (questionFile) {
      documentos.questoes = questionFile;
      steps.push(aguardandoRevisao ? "JSON estruturado localizado e aguardando revisão no Laboratório." : "JSON estruturado de questões localizado.");
    } else {
      steps.push("JSON estruturado de questões ainda não localizado.");
    }

    manifest.provas[provaId] = {
      ...documentos,
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: req.user?.email || req.user?.id || "admin"
    };
    writeExamManifest(manifest);

    let nextAction = "";
    if (!documentos.prova || !documentos.gabarito) {
      nextAction = "Informe manualmente os links/caminhos do documento da prova e do gabarito, ou abra a origem oficial e copie os links dos arquivos quando a banca disponibilizar.";
    } else if (aguardandoRevisao) {
      nextAction = "Abra o Laboratório para revisar as questões estruturadas antes da integração ao banco.";
    } else if (!questionFile) {
      nextAction = "Inclua ou gere o JSON estruturado das questões para que o sistema possa importar a prova para resolução.";
    } else {
      nextAction = "JSON estruturado localizado; o frontend pode iniciar o processamento das questões.";
    }

    res.json({
      ok: true,
      provaId,
      documentos: manifest.provas[provaId],
      steps,
      canProcess: Boolean(questionFile && !aguardandoRevisao),
      questionFile,
      nextAction
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/provas/cards", requireAdmin, async (req, res, next) => {
  try {
    const rawId = String(req.body.id || "").trim();
    const banca = String(req.body.banca || "").trim();
    const orgao = String(req.body.orgao || "").trim();
    const ano = String(req.body.ano || "").trim();
    const cargo = String(req.body.cargo || "").trim();
    if (!banca || !orgao || !ano || !cargo) {
      return res.status(400).json({ error: "Informe banca, órgão, ano e cargo para criar o card." });
    }
    const generatedId = `${banca}-${orgao}-${ano}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    const id = rawId || generatedId;
    if (!id) return res.status(400).json({ error: "Não foi possível gerar o identificador do card." });

    const manifest = readExamManifest();
    manifest.cards = manifest.cards || {};
    manifest.cards[id] = {
      ...(manifest.cards[id] || {}),
      banca,
      orgao,
      ano,
      cargo,
      nivel: String(req.body.nivel || "Superior").trim() || "Superior",
      file: String(req.body.file || `${id}.json`).trim(),
      statusPipeline: String(req.body.statusPipeline || manifest.cards[id]?.statusPipeline || "card_criado").trim(),
      suspensa: Boolean(req.body.suspensa),
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: req.user?.email || req.user?.id || "admin"
    };
    writeExamManifest(manifest);
    res.status(201).json({ ok: true, id, card: manifest.cards[id] });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/provas/process-questions", requireAdmin, async (req, res, next) => {
  try {
    const provaId = String(req.body.provaId || "").trim();
    const sourceFile = String(req.body.sourceFile || "").trim();
    const meta = req.body.meta && typeof req.body.meta === "object" ? req.body.meta : {};
    const candidates = uniqueStrings([
      ...(Array.isArray(req.body.questionFileCandidates) ? req.body.questionFileCandidates : []),
      req.body.questionFile,
      req.body.documentoQuestoes,
      meta.questoes,
      meta.questoesUrl,
      provaId ? `${provaId}-questoes.json` : "",
      provaId ? `${provaId}.json` : "",
      sourceFile && sourceFile.toLowerCase().endsWith(".json") ? sourceFile : ""
    ]);

    const filePath = candidates.map(resolveLocalQuestionFile).find(Boolean);
    if (!filePath) {
      return res.status(422).json({
        error: "Nenhum arquivo estruturado de questões foi encontrado para este card. Vincule um JSON de questões em dados/provas ou envie o JSON pelo Laboratório.",
        code: "arquivo_processavel_nao_encontrado",
        expected: candidates
      });
    }

    const manifest = readExamManifest();
    const estruturacaoStatus = manifest.provas[provaId]?.estruturacao?.status || "";
    if (estruturacaoStatus === "gerado_para_revisao") {
      return res.status(423).json({
        error: "As questões estruturadas ainda aguardam revisão no Laboratório. Libere a revisão antes de importar para o banco.",
        code: "revisao_laboratorio_pendente"
      });
    }

    const questions = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "O arquivo de questões localizado está vazio ou não é uma lista JSON." });
    }

    const enrichedQuestions = questions.map((question) => ({
      ...question,
      origem_questao: {
        banca: meta.banca,
        orgao: meta.orgao,
        cargo: meta.cargo,
        ano: meta.ano,
        prova: meta.prova || meta.orgao,
        ...(question.origem_questao || {})
      },
      origem_importacao: {
        ...(question.origem_importacao || {}),
        prova_id: provaId,
        arquivo_original: path.basename(filePath),
        documento_prova: meta.documentoProva || "",
        documento_gabarito: meta.documentoGabarito || "",
        origem: meta.origem || ""
      }
    }));

    const client = await pool.connect();
    let result;
    try {
      await client.query("BEGIN");
      result = await importQuestionBatch(client, enrichedQuestions, sourceFile || path.basename(filePath));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.json({
      ok: true,
      file: path.relative(__dirname, filePath),
      sourceFile: sourceFile || path.basename(filePath),
      ...result
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/provas/structure-questions", requireAdmin, async (req, res, next) => {
  try {
    const provaId = String(req.body.provaId || "").trim();
    if (!provaId) return res.status(400).json({ error: "Informe o card/prova para estruturar as questões." });

    const manifest = readExamManifest();
    const docs = manifest.provas[provaId] || {};
    const card = manifest.cards[provaId] || {};
    const documentoProva = String(req.body.documentoProva || docs.prova || "").trim();
    const localProvaPath = resolveLocalExamDocument(documentoProva);
    let texto = String(req.body.texto || "").trim();
    const steps = [];

    if (!texto && localProvaPath) {
      steps.push("Tentando extrair texto do PDF da prova.");
      texto = await extractTextFromPdfIfPossible(localProvaPath);
      if (!texto) {
        steps.push("O servidor não encontrou extrator de PDF disponível ou o texto não pôde ser lido automaticamente.");
      }
    }

    if (!texto) {
      return res.status(422).json({
        error: "Não foi possível extrair texto suficiente da prova. Cole o texto da prova no campo de estruturação ou instale um extrator de PDF no servidor.",
        code: "texto_prova_indisponivel",
        steps
      });
    }

    const meta = {
      provaId,
      banca: req.body.banca || card.banca || "",
      orgao: req.body.orgao || card.orgao || "",
      cargo: req.body.cargo || card.cargo || "",
      ano: req.body.ano || card.ano || "",
      prova: req.body.prova || card.orgao || "",
      documentoProva,
      origem: docs.origem || req.body.origem || ""
    };
    const questions = parseStructuredQuestionsFromText(texto, meta);
    if (!questions.length) {
      return res.status(422).json({
        error: "O texto foi lido, mas a numeração das questões não foi identificada com segurança. Revise ou cole o texto com as questões numeradas.",
        code: "questoes_nao_identificadas",
        steps
      });
    }

    const answerKey = await loadAnswerKeyMapForExam({ ...docs, gabarito: req.body.documentoGabarito || docs.gabarito });
    let gabaritosAplicados = 0;
    if (answerKey.total) {
      questions.forEach((question) => {
        const answer = answerKey.answers[question.numero];
        if (!answer) return;
        question.gabarito = answer;
        question.gabarito_origem = {
          tipo: "banca_oficial",
          fonte: answerKey.source,
          atualizado_em: new Date().toISOString(),
          atualizado_por: req.user?.email || req.user?.id || "admin"
        };
        if (question.origem_importacao) question.origem_importacao.documento_gabarito = answerKey.source;
        if (Array.isArray(question.alternativas)) {
          question.alternativas = question.alternativas.map((alt) => ({
            ...alt,
            is_correta: answer !== "X" && String(alt.letra || "").toUpperCase() === answer
          }));
        }
        gabaritosAplicados += 1;
      });
      steps.push(`${answerKey.total} gabarito(s) extraído(s) do documento oficial; ${gabaritosAplicados} aplicado(s) ao JSON revisável.`);
    }

    const outputDir = path.join(__dirname, "dados", "provas");
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${provaId}.json`);
    fs.writeFileSync(outputPath, `${JSON.stringify(questions, null, 2)}\n`, "utf8");

    manifest.provas[provaId] = {
      ...docs,
      questoes: toRelativeAppPath(outputPath),
      estruturacao: {
        status: "gerado_para_revisao",
        totalQuestoes: questions.length,
        revisaoObrigatoria: true,
        gabaritosExtraidos: answerKey.total,
        gabaritosAplicados,
        documentoGabarito: answerKey.source || docs.gabarito || "",
        atualizadoEm: new Date().toISOString(),
        atualizadoPor: req.user?.email || req.user?.id || "admin"
      },
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: req.user?.email || req.user?.id || "admin"
    };
    writeExamManifest(manifest);

    res.json({
      ok: true,
      provaId,
      file: toRelativeAppPath(outputPath),
      questions,
      count: questions.length,
      steps: [...steps, `${questions.length} questão(ões) estruturada(s) para revisão no Laboratório.`]
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/provas/apply-answer-key", requireAdmin, async (req, res, next) => {
  try {
    const provaId = String(req.body.provaId || "").trim();
    if (!provaId) return res.status(400).json({ error: "Informe o card/prova para aplicar o gabarito." });

    const manifest = readExamManifest();
    const docs = manifest.provas[provaId] || {};
    const questionFile = findProcessableQuestionFile({ provaId, docs });
    const filePath = resolveLocalQuestionFile(questionFile);
    if (!filePath) {
      return res.status(422).json({ error: "Não há JSON estruturado local para receber o gabarito oficial." });
    }

    const questions = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "O arquivo de questões localizado está vazio ou inválido." });
    }

    const answerKey = await loadAnswerKeyMapForExam(docs);
    if (!answerKey.total) {
      return res.status(422).json({ error: "Não foi possível extrair gabaritos do documento vinculado." });
    }

    let applied = 0;
    questions.forEach((question) => {
      const answer = answerKey.answers[question.numero];
      if (!answer) return;
      question.gabarito = answer;
      question.gabarito_origem = {
        tipo: "banca_oficial",
        fonte: answerKey.source,
        atualizado_em: new Date().toISOString(),
        atualizado_por: req.user?.email || req.user?.id || "admin"
      };
      question.origem_importacao = {
        ...(question.origem_importacao || {}),
        documento_gabarito: answerKey.source,
        status: question.origem_importacao?.status || "estruturado_para_revisao"
      };
      if (Array.isArray(question.alternativas)) {
        question.alternativas = question.alternativas.map((alt) => ({
          ...alt,
          is_correta: answer !== "X" && String(alt.letra || "").toUpperCase() === answer
        }));
      }
      applied += 1;
    });

    fs.writeFileSync(filePath, `${JSON.stringify(questions, null, 2)}\n`, "utf8");
    manifest.provas[provaId] = {
      ...docs,
      questoes: toRelativeAppPath(filePath),
      estruturacao: {
        ...(docs.estruturacao || {}),
        totalQuestoes: questions.length,
        revisaoObrigatoria: docs.estruturacao?.status !== "liberado_para_processamento",
        gabaritosExtraidos: answerKey.total,
        gabaritosAplicados: applied,
        documentoGabarito: answerKey.source,
        atualizadoEm: new Date().toISOString(),
        atualizadoPor: req.user?.email || req.user?.id || "admin"
      },
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: req.user?.email || req.user?.id || "admin"
    };
    writeExamManifest(manifest);

    res.json({ ok: true, provaId, file: toRelativeAppPath(filePath), extracted: answerKey.total, applied, documentos: manifest.provas[provaId] });
  } catch (error) {
    next(error);
  }
});
app.post("/api/admin/provas/release-structured", requireAdmin, async (req, res, next) => {
  try {
    const provaId = String(req.body.provaId || "").trim();
    if (!provaId) return res.status(400).json({ error: "Informe o card/prova para liberar a revisão." });

    const manifest = readExamManifest();
    const docs = manifest.provas[provaId] || {};
    if (!docs.questoes) {
      return res.status(422).json({ error: "Não há JSON estruturado vinculado a esta prova para liberar." });
    }

    manifest.provas[provaId] = {
      ...docs,
      estruturacao: {
        ...(docs.estruturacao || {}),
        status: "liberado_para_processamento",
        revisaoObrigatoria: false,
        liberadoEm: new Date().toISOString(),
        liberadoPor: req.user?.email || req.user?.id || "admin"
      },
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: req.user?.email || req.user?.id || "admin"
    };
    writeExamManifest(manifest);

    res.json({
      ok: true,
      provaId,
      documentos: manifest.provas[provaId],
      nextAction: "Revisão liberada. O JSON estruturado pode ser importado para o banco pelo pipeline."
    });
  } catch (error) {
    next(error);
  }
});
app.get("/api/admin/users", requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id, nome, email, nivel, status, telefone, validade, notas, created_at FROM usuarios ORDER BY created_at DESC"
    );
    res.json({ users: result.rows.map(publicUser) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users", requireAdmin, async (req, res, next) => {
  try {
    requireFields(req.body, ["nome", "email", "nivel", "status"]);
    const tempPassword = crypto.randomBytes(9).toString("base64url");
    const result = await pool.query(
      `INSERT INTO usuarios (id, nome, email, senha_hash, nivel, status, telefone, validade, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, '')::date, $9)
       RETURNING id, nome, email, nivel, status, telefone, validade, notas, created_at`,
      [
        `u_${crypto.randomUUID()}`,
        String(req.body.nome).trim(),
        normalizeEmail(req.body.email),
        hashPassword(req.body.senha || tempPassword),
        req.body.nivel,
        req.body.status,
        req.body.telefone || "",
        req.body.validade || "",
        req.body.notas || ""
      ]
    );
    res.status(201).json({ user: publicUser(result.rows[0]), tempPassword: req.body.senha ? null : tempPassword });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Este e-mail já está cadastrado." });
    next(error);
  }
});

app.put("/api/admin/users/:id", requireAdmin, async (req, res, next) => {
  try {
    requireFields(req.body, ["nome", "email", "nivel", "status"]);
    const result = await pool.query(
      `UPDATE usuarios
       SET nome = $2, email = $3, nivel = $4, status = $5, telefone = $6,
           validade = NULLIF($7, '')::date, notas = $8, updated_at = NOW()
       WHERE id = $1
       RETURNING id, nome, email, nivel, status, telefone, validade, notas, created_at`,
      [
        req.params.id,
        String(req.body.nome).trim(),
        normalizeEmail(req.body.email),
        req.body.nivel,
        req.body.status,
        req.body.telefone || "",
        req.body.validade || "",
        req.body.notas || ""
      ]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Usuário não encontrado." });
    res.json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/users/:id", requireAdmin, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: "Não é possível excluir o próprio usuário logado." });
    }
    await pool.query("DELETE FROM usuarios WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/project-costs", requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM projeto_custos
       ORDER BY COALESCE(proximo_vencimento, data_vencimento, data_competencia, created_at::date) ASC, created_at DESC`
    );
    const costs = result.rows.map(publicProjectCost);
    const summary = costs.reduce(
      (acc, item) => {
        const valorRealizado = item.valorPago || 0;
        const valorPrevisto = item.valorPrevisto || 0;
        const recorrente = item.valorRecorrente || 0;
        acc.totalPago += valorRealizado;
        acc.totalPrevisto += valorPrevisto;
        if (item.periodicidade === "mensal") acc.custoFixoMensal += recorrente || valorPrevisto;
        if (item.periodicidade === "anual") acc.custoAnualPrevisto += recorrente || valorPrevisto;
        if (item.status === "vencido") acc.vencidos += 1;
        if (!item.responsavel) acc.semResponsavel += 1;
        if (!item.linkDocumento && item.status === "pago") acc.pagosSemComprovante += 1;
        return acc;
      },
      {
        totalPago: 0,
        totalPrevisto: 0,
        custoFixoMensal: 0,
        custoAnualPrevisto: 0,
        vencidos: 0,
        semResponsavel: 0,
        pagosSemComprovante: 0
      }
    );

    res.json({
      costs,
      summary,
      categories: [...new Set(costs.map((item) => item.categoria).filter(Boolean))].sort(),
      suppliers: [...new Set(costs.map((item) => item.fornecedor).filter(Boolean))].sort()
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/project-costs", requireAdmin, async (req, res, next) => {
  try {
    requireFields(req.body, ["nome", "categoria", "status"]);
    const id = `cost_${crypto.randomUUID()}`;
    const result = await pool.query(
      `INSERT INTO projeto_custos (
         id, nome, categoria, descricao, produto, centro_custo, responsavel, fornecedor,
         local_contratacao, link_documento, observacoes, valor_pago, valor_previsto,
         valor_recorrente, moeda, forma_pagamento, status, data_pagamento,
         data_competencia, data_vencimento, proximo_vencimento, periodicidade,
         origem_sistema, origem_modulo, tipo_registro, criado_por
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18,
         $19, $20, $21, $22,
         'REMB Estudos', 'Financeiro', $23, $24
       )
       RETURNING *`,
      [
        id,
        String(req.body.nome).trim(),
        String(req.body.categoria).trim(),
        req.body.descricao || "",
        req.body.produto || "REMB Estudos",
        req.body.centroCusto || "",
        req.body.responsavel || "",
        req.body.fornecedor || "",
        req.body.localContratacao || "",
        req.body.linkDocumento || "",
        req.body.observacoes || "",
        toMoney(req.body.valorPago),
        toMoney(req.body.valorPrevisto),
        toMoney(req.body.valorRecorrente),
        req.body.moeda || "BRL",
        req.body.formaPagamento || "",
        req.body.status,
        toNullableDate(req.body.dataPagamento),
        toNullableDate(req.body.dataCompetencia),
        toNullableDate(req.body.dataVencimento),
        toNullableDate(req.body.proximoVencimento),
        req.body.periodicidade || "unica",
        req.body.tipoRegistro || (toMoney(req.body.valorPago) > 0 ? "custo_realizado" : "custo_previsto"),
        req.user.id
      ]
    );
    res.status(201).json({ cost: publicProjectCost(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/project-costs/:id", requireAdmin, async (req, res, next) => {
  try {
    requireFields(req.body, ["nome", "categoria", "status"]);
    const result = await pool.query(
      `UPDATE projeto_custos
       SET nome = $2, categoria = $3, descricao = $4, produto = $5, centro_custo = $6,
           responsavel = $7, fornecedor = $8, local_contratacao = $9, link_documento = $10,
           observacoes = $11, valor_pago = $12, valor_previsto = $13, valor_recorrente = $14,
           moeda = $15, forma_pagamento = $16, status = $17, data_pagamento = $18,
           data_competencia = $19, data_vencimento = $20, proximo_vencimento = $21,
           periodicidade = $22, tipo_registro = $23, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        req.params.id,
        String(req.body.nome).trim(),
        String(req.body.categoria).trim(),
        req.body.descricao || "",
        req.body.produto || "REMB Estudos",
        req.body.centroCusto || "",
        req.body.responsavel || "",
        req.body.fornecedor || "",
        req.body.localContratacao || "",
        req.body.linkDocumento || "",
        req.body.observacoes || "",
        toMoney(req.body.valorPago),
        toMoney(req.body.valorPrevisto),
        toMoney(req.body.valorRecorrente),
        req.body.moeda || "BRL",
        req.body.formaPagamento || "",
        req.body.status,
        toNullableDate(req.body.dataPagamento),
        toNullableDate(req.body.dataCompetencia),
        toNullableDate(req.body.dataVencimento),
        toNullableDate(req.body.proximoVencimento),
        req.body.periodicidade || "unica",
        req.body.tipoRegistro || (toMoney(req.body.valorPago) > 0 ? "custo_realizado" : "custo_previsto")
      ]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Custo não encontrado." });
    res.json({ cost: publicProjectCost(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/project-costs/:id", requireAdmin, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM projeto_custos WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

async function getFinanceData() {
  const [costResult, revenueResult, subscriptionResult, competenceResult, billingResult, cashResult] = await Promise.all([
    pool.query(
      `SELECT *
       FROM projeto_custos
       ORDER BY COALESCE(proximo_vencimento, data_vencimento, data_competencia, created_at::date) ASC, created_at DESC`
    ),
    pool.query(
      `SELECT *
       FROM projeto_receitas
       ORDER BY COALESCE(proximo_recebimento, data_recebimento, data_vencimento, data_competencia, created_at::date) ASC, created_at DESC`
    ),
    pool.query("SELECT * FROM projeto_assinaturas ORDER BY created_at DESC"),
    pool.query("SELECT * FROM projeto_receita_competencias ORDER BY competencia ASC, created_at ASC"),
    pool.query(
      `SELECT *
       FROM projeto_cobrancas
       ORDER BY COALESCE(data_pagamento, data_vencimento, data_competencia, created_at::date) ASC, created_at DESC`
    ),
    pool.query("SELECT * FROM projeto_caixa_movimentos ORDER BY data_movimento ASC, created_at ASC")
  ]);
  const costs = costResult.rows.map(publicProjectCost);
  const revenues = revenueResult.rows.map(publicProjectRevenue);
  const subscriptions = subscriptionResult.rows.map(publicSubscription);
  const billings = billingResult.rows.map(publicBilling);
  const cashMovements = cashResult.rows.map(publicCashMovement);
  const revenueCompetences = competenceResult.rows.map(publicRevenueCompetence);
  return {
    costs,
    revenues,
    subscriptions,
    billings,
    cashMovements,
    revenueCompetences,
    summary: buildFinanceSummary(costs, revenues, subscriptions, billings, cashMovements, revenueCompetences)
  };
}

async function createSubscriptionRecords(client, subscription, userId) {
  const assinaturaId = `sub_${crypto.randomUUID()}`;
  const dataInicio = toNullableDate(subscription.dataInicio) || toDateOnly(new Date());
  const periodicidade = subscription.periodicidade || "mensal";
  const meses = Number(subscription.duracaoMeses || (periodicidade === "anual" ? 12 : 1));
  const safeMeses = Number.isFinite(meses) && meses > 0 ? Math.round(meses) : 1;
  const dataFim = toNullableDate(subscription.dataFim) || toDateOnly(addMonths(new Date(`${dataInicio}T00:00:00`), safeMeses - 1));
  const mesesCompetencia = monthsBetweenInclusive(dataInicio, dataFim);
  const valorTotal = toMoney(subscription.valorTotal || subscription.valorPrevisto || subscription.valorRecorrente);
  const valorMensal = mesesCompetencia > 0 ? Number((valorTotal / mesesCompetencia).toFixed(2)) : valorTotal;

  const inserted = await client.query(
    `INSERT INTO projeto_assinaturas (
       id, usuario_id, usuario_nome, plano, periodicidade, valor_total, valor_mensal_reconhecido,
       data_inicio, data_fim, status, forma_pagamento, observacoes, criado_por
     )
     VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      assinaturaId,
      subscription.usuarioId || "",
      subscription.usuarioNome || "",
      String(subscription.plano || "Plano REMB Estudos").trim(),
      periodicidade,
      valorTotal,
      valorMensal,
      dataInicio,
      dataFim,
      subscription.status || "ativa",
      subscription.formaPagamento || "",
      subscription.observacoes || "",
      userId
    ]
  );

  const start = new Date(`${dataInicio}T00:00:00`);
  for (let i = 0; i < mesesCompetencia; i += 1) {
    await client.query(
      `INSERT INTO projeto_receita_competencias (
         id, assinatura_id, usuario_id, usuario_nome, plano, competencia, valor_previsto, status
       )
       VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7, 'prevista')`,
      [
        `comp_${crypto.randomUUID()}`,
        assinaturaId,
        subscription.usuarioId || "",
        subscription.usuarioNome || "",
        subscription.plano || "Plano REMB Estudos",
        toDateOnly(addMonths(start, i)),
        valorMensal
      ]
    );
  }

  const billingValue = periodicidade === "anual" ? valorTotal : valorMensal;
  await client.query(
    `INSERT INTO projeto_cobrancas (
       id, assinatura_id, usuario_id, usuario_nome, plano, descricao, valor, moeda, status,
       data_competencia, data_vencimento, gateway, referencia_externa
     )
     VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7, 'BRL', 'a_receber', $8, $9, $10, $11)`,
    [
      `bill_${crypto.randomUUID()}`,
      assinaturaId,
      subscription.usuarioId || "",
      subscription.usuarioNome || "",
      subscription.plano || "Plano REMB Estudos",
      `Cobrança ${subscription.plano || "assinatura REMB Estudos"}`,
      billingValue,
      dataInicio,
      toNullableDate(subscription.dataVencimento) || dataInicio,
      subscription.gateway || "",
      subscription.referenciaExterna || ""
    ]
  );

  return publicSubscription(inserted.rows[0]);
}

async function confirmBillingPayment(billingId, body) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const billingResult = await client.query("SELECT * FROM projeto_cobrancas WHERE id = $1 FOR UPDATE", [billingId]);
    if (billingResult.rowCount === 0) {
      const err = new Error("Cobrança não encontrada.");
      err.statusCode = 404;
      throw err;
    }
    const billing = billingResult.rows[0];
    const valor = toMoney(body.valor || billing.valor);
    const dataRecebimento = toNullableDate(body.dataRecebimento) || toDateOnly(new Date());
    const recebimentoId = `pay_${crypto.randomUUID()}`;
    const movimentoId = `cash_${crypto.randomUUID()}`;

    await client.query(
      `INSERT INTO projeto_recebimentos (
         id, cobranca_id, assinatura_id, valor, moeda, data_recebimento, forma_recebimento,
         gateway, referencia_externa, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmado')`,
      [
        recebimentoId,
        billing.id,
        billing.assinatura_id,
        valor,
        billing.moeda || "BRL",
        dataRecebimento,
        body.formaRecebimento || "",
        body.gateway || billing.gateway || "",
        body.referenciaExterna || billing.referencia_externa || ""
      ]
    );

    await client.query(
      `INSERT INTO projeto_caixa_movimentos (
         id, tipo, origem_tipo, origem_id, descricao, categoria, valor, moeda, data_movimento, status
       )
       VALUES ($1, 'entrada', 'recebimento', $2, $3, 'Assinatura', $4, $5, $6, 'confirmado')`,
      [
        movimentoId,
        recebimentoId,
        `Recebimento ${billing.descricao}`,
        valor,
        billing.moeda || "BRL",
        dataRecebimento
      ]
    );

    await client.query(
      `UPDATE projeto_cobrancas
       SET status = 'paga', data_pagamento = $2, updated_at = NOW()
       WHERE id = $1`,
      [billing.id, dataRecebimento]
    );

    await client.query("COMMIT");
    return { ok: true, recebimentoId, movimentoId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

app.get("/api/admin/finance-overview", requireAdmin, async (req, res, next) => {
  try {
    const data = await getFinanceData();
    res.json({
      ...data,
      costCategories: [...new Set(data.costs.map((item) => item.categoria).filter(Boolean))].sort(),
      suppliers: [...new Set(data.costs.map((item) => item.fornecedor).filter(Boolean))].sort(),
      revenueCategories: [...new Set(data.revenues.map((item) => item.categoria).filter(Boolean))].sort(),
      revenueSources: [...new Set(data.revenues.map((item) => item.fonte).filter(Boolean))].sort()
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/subscriptions", requireAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    requireFields(req.body, ["plano", "valorTotal", "dataInicio"]);
    await client.query("BEGIN");
    const subscription = await createSubscriptionRecords(client, req.body, req.user.id);
    await client.query("COMMIT");
    res.status(201).json({ subscription });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/admin/subscription-billings/:id/receive", requireAdmin, async (req, res, next) => {
  try {
    const result = await confirmBillingPayment(req.params.id, req.body || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/project-revenues", requireAdmin, async (req, res, next) => {
  try {
    const data = await getFinanceData();
    res.json({
      revenues: data.revenues,
      summary: data.summary,
      categories: [...new Set(data.revenues.map((item) => item.categoria).filter(Boolean))].sort(),
      sources: [...new Set(data.revenues.map((item) => item.fonte).filter(Boolean))].sort()
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/project-revenues", requireAdmin, async (req, res, next) => {
  try {
    requireFields(req.body, ["nome", "categoria", "status"]);
    const id = `rev_${crypto.randomUUID()}`;
    const result = await pool.query(
      `INSERT INTO projeto_receitas (
         id, nome, categoria, descricao, fonte, usuario_id, usuario_nome, plano, produto,
         valor_recebido, valor_previsto, valor_recorrente, moeda, forma_recebimento,
         status, data_recebimento, data_competencia, data_vencimento, proximo_recebimento,
         periodicidade, link_documento, observacoes, origem_sistema, origem_modulo,
         tipo_registro, criado_por
       )
       VALUES (
         $1, $2, $3, $4, $5, NULLIF($6, ''), $7, $8, $9,
         $10, $11, $12, $13, $14,
         $15, $16, $17, $18, $19,
         $20, $21, $22, 'REMB Estudos', 'Financeiro',
         $23, $24
       )
       RETURNING *`,
      [
        id,
        String(req.body.nome).trim(),
        String(req.body.categoria).trim(),
        req.body.descricao || "",
        req.body.fonte || "",
        req.body.usuarioId || "",
        req.body.usuarioNome || "",
        req.body.plano || "",
        req.body.produto || "REMB Estudos",
        toMoney(req.body.valorRecebido),
        toMoney(req.body.valorPrevisto),
        toMoney(req.body.valorRecorrente),
        req.body.moeda || "BRL",
        req.body.formaRecebimento || "",
        req.body.status,
        toNullableDate(req.body.dataRecebimento),
        toNullableDate(req.body.dataCompetencia),
        toNullableDate(req.body.dataVencimento),
        toNullableDate(req.body.proximoRecebimento),
        req.body.periodicidade || "mensal",
        req.body.linkDocumento || "",
        req.body.observacoes || "",
        req.body.tipoRegistro || (toMoney(req.body.valorRecebido) > 0 ? "receita_realizada" : "receita_prevista"),
        req.user.id
      ]
    );
    res.status(201).json({ revenue: publicProjectRevenue(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/project-revenues/:id", requireAdmin, async (req, res, next) => {
  try {
    requireFields(req.body, ["nome", "categoria", "status"]);
    const result = await pool.query(
      `UPDATE projeto_receitas
       SET nome = $2, categoria = $3, descricao = $4, fonte = $5, usuario_id = NULLIF($6, ''),
           usuario_nome = $7, plano = $8, produto = $9, valor_recebido = $10,
           valor_previsto = $11, valor_recorrente = $12, moeda = $13,
           forma_recebimento = $14, status = $15, data_recebimento = $16,
           data_competencia = $17, data_vencimento = $18, proximo_recebimento = $19,
           periodicidade = $20, link_documento = $21, observacoes = $22,
           tipo_registro = $23, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        req.params.id,
        String(req.body.nome).trim(),
        String(req.body.categoria).trim(),
        req.body.descricao || "",
        req.body.fonte || "",
        req.body.usuarioId || "",
        req.body.usuarioNome || "",
        req.body.plano || "",
        req.body.produto || "REMB Estudos",
        toMoney(req.body.valorRecebido),
        toMoney(req.body.valorPrevisto),
        toMoney(req.body.valorRecorrente),
        req.body.moeda || "BRL",
        req.body.formaRecebimento || "",
        req.body.status,
        toNullableDate(req.body.dataRecebimento),
        toNullableDate(req.body.dataCompetencia),
        toNullableDate(req.body.dataVencimento),
        toNullableDate(req.body.proximoRecebimento),
        req.body.periodicidade || "mensal",
        req.body.linkDocumento || "",
        req.body.observacoes || "",
        req.body.tipoRegistro || (toMoney(req.body.valorRecebido) > 0 ? "receita_realizada" : "receita_prevista")
      ]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Receita não encontrada." });
    res.json({ revenue: publicProjectRevenue(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/project-revenues/:id", requireAdmin, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM projeto_receitas WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use(
  express.static(__dirname, {
    etag: true,
    maxAge: isProduction ? "1d" : 0,
    setHeaders: (res, filePath) => {
      if (path.basename(filePath) === "index.html") {
        res.setHeader("Cache-Control", "no-cache");
      }
    }
  })
);

app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api/")) {
    return res.sendFile(path.join(__dirname, "index.html"));
  }
  next();
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({ error: error.message || "Erro interno do servidor." });
});

ensureAuthSchema()
  .then(() => {
    const server = app.listen(port);

    server.on("listening", () => {
      console.log(`REMB Estudos disponível em http://localhost:${port}`);
    });

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.log(`REMB Estudos já parece estar aberto em http://localhost:${port}`);
        console.log("Se precisar reiniciar, feche o terminal antigo do servidor antes de rodar npm start novamente.");
        process.exit(0);
      }

      console.error("Falha ao iniciar servidor:", error);
      process.exit(1);
    });
  })
  .catch((error) => {
    console.error("Falha ao preparar banco de dados:", error);
    process.exit(1);
  });



