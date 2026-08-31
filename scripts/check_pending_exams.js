const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "..", "js", "app.js");
const dadosDir = path.join(__dirname, "..", "dados");
const docsDir = path.join(dadosDir, "provas");
const manifestPath = path.join(dadosDir, "provas_manifest.json");
const source = fs.readFileSync(appPath, "utf8");
const start = source.indexOf("const BANCO_PROVAS = [");
if (start === -1) {
  throw new Error("BANCO_PROVAS nao encontrado em js/app.js.");
}
const end = source.indexOf("];", start);
const block = source.slice(start, end);
const localFiles = new Set(fs.readdirSync(dadosDir).filter((file) => file.endsWith(".json")));
const docFiles = fs.existsSync(docsDir) ? new Set(fs.readdirSync(docsDir)) : new Set();
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { provas: {} };

const exams = [];
const getDocument = (docs, type) => docs?.[type] || docs?.[`${type}Url`] || "";
const isLocalSystemDocument = (value) => Boolean(value && !/^https?:\/\//i.test(String(value)) && String(value).startsWith("dados/provas/"));
const objectRegex = /\{[^{}]*id:\s*"([^"]+)"[^{}]*banca:\s*"([^"]+)"[^{}]*ano:\s*"([^"]+)"[^{}]*orgao:\s*"([^"]+)"[^{}]*cargo:\s*"([^"]+)"[^{}]*file:\s*"([^"]+)"[^{}]*\}/g;
let match;
while ((match = objectRegex.exec(block))) {
  const [, id, banca, ano, orgao, cargo, file] = match;
  const objectText = match[0];
  const manifestDocs = manifest.provas?.[id] || {};
  const hasDocumentLink = /(?:provaUrl|gabaritoUrl|arquivoProva|arquivoGabarito|documentoGabarito|linkGabarito|documentos|links)\s*:/.test(objectText)
    || Object.keys(manifestDocs).length > 0;
  const expectedLocalDocs = ["prova", "gabarito", "edital", "recurso"].filter((type) => docFiles.has(`${id}-${type}.pdf`));
  const effectiveDocs = { ...manifestDocs };
  expectedLocalDocs.forEach((type) => {
    effectiveDocs[type] = effectiveDocs[type] || `dados/provas/${id}-${type}.pdf`;
  });
  const hasRequiredDocuments = Boolean(getDocument(effectiveDocs, "prova") && getDocument(effectiveDocs, "gabarito"));
  const requiredDocumentsDownloaded = isLocalSystemDocument(getDocument(effectiveDocs, "prova"))
    && isLocalSystemDocument(getDocument(effectiveDocs, "gabarito"));
  const status = localFiles.has(file)
    ? "arquivo_json_local"
    : requiredDocumentsDownloaded
      ? "arquivos_obrigatorios_baixados"
      : hasRequiredDocuments
        ? "documentos_obrigatorios_vinculados"
        : hasDocumentLink
          ? "documento_parcial_vinculado"
          : "pendente_sem_arquivo";
  exams.push({
    id,
    banca,
    ano,
    orgao,
    cargo,
    file,
    arquivoJsonLocal: localFiles.has(file),
    documentoVinculado: hasDocumentLink,
    documentosObrigatoriosVinculados: hasRequiredDocuments,
    arquivosObrigatoriosBaixados: requiredDocumentsDownloaded,
    documentosManifesto: manifestDocs,
    documentosLocaisEncontrados: expectedLocalDocs,
    status
  });
}

const summary = exams.reduce(
  (acc, exam) => {
    acc.total += 1;
    acc[exam.status] += 1;
    return acc;
  },
  {
    total: 0,
    arquivo_json_local: 0,
    arquivos_obrigatorios_baixados: 0,
    documentos_obrigatorios_vinculados: 0,
    documento_parcial_vinculado: 0,
    pendente_sem_arquivo: 0
  }
);

console.log(JSON.stringify({ ok: true, summary, exams }, null, 2));
