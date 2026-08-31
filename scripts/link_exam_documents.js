const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "..", "js", "app.js");
const docsDir = path.join(__dirname, "..", "dados", "provas");
const manifestPath = path.join(__dirname, "..", "dados", "provas_manifest.json");
const source = fs.readFileSync(appPath, "utf8");
const start = source.indexOf("const BANCO_PROVAS = [");
if (start === -1) throw new Error("BANCO_PROVAS nao encontrado em js/app.js.");
const end = source.indexOf("];", start);
const block = source.slice(start, end);

if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

const exams = [];
const objectRegex = /\{[^{}]*id:\s*"([^"]+)"[^{}]*file:\s*"([^"]+)"[^{}]*\}/g;
let match;
while ((match = objectRegex.exec(block))) {
  exams.push({ id: match[1], file: match[2] });
}

const existingManifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : { provas: {} };
const manifest = { provas: { ...(existingManifest.provas || {}) } };

const docTypes = ["prova", "gabarito", "edital", "recurso"];
const files = fs.readdirSync(docsDir).filter((file) => /\.(pdf|docx?|txt|json)$/i.test(file));
const linked = [];

for (const exam of exams) {
  const fileStem = exam.file.replace(/\.[^.]+$/, "");
  const docs = { ...(manifest.provas[exam.id] || {}) };

  for (const type of docTypes) {
    const found = files.find((file) => {
      const stem = file.replace(/\.[^.]+$/, "").toLowerCase();
      return stem === `${exam.id}-${type}` || stem === `${fileStem}-${type}` || (type === "prova" && file === exam.file);
    });
    if (found) {
      docs[type] = `dados/provas/${found}`;
    }
  }

  if (Object.keys(docs).length > 0) {
    manifest.provas[exam.id] = docs;
    linked.push({ id: exam.id, documentos: docs });
  }
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, linkedCount: linked.length, linked }, null, 2));
