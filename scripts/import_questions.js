const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const match = line.match(/^\s*([^#][^=]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^"|"$/g, "");
      }
    });
}

const port = process.env.PORT || 8081;
const baseUrl = process.env.REMB_BASE_URL || `http://localhost:${port}`;

async function request(pathname, options = {}, cookie = "") {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload.error || `Falha HTTP ${response.status}`);
  return { response, payload };
}

async function main() {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    throw new Error("ADMIN_EMAIL e ADMIN_PASSWORD precisam estar definidos no .env.");
  }

  const login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL,
      senha: process.env.ADMIN_PASSWORD
    })
  });

  const cookie = login.response.headers.get("set-cookie") || "";
  const imported = await request("/api/admin/questions/import", { method: "POST", body: "{}" }, cookie);
  const meta = await request("/api/questions-meta", {}, cookie);

  console.log(JSON.stringify({ importacao: imported.payload.summary, total: meta.payload.total }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
