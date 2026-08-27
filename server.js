const crypto = require("crypto");
const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const envPath = path.join(__dirname, ".env");
try {
  require("fs")
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

function requireFields(body, fields) {
  const missing = fields.filter((field) => !String(body[field] || "").trim());
  if (missing.length) {
    const err = new Error(`Campos obrigatórios ausentes: ${missing.join(", ")}`);
    err.statusCode = 400;
    throw err;
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || !["CEO / PROPRIETÁRIO", "ADMIN / GESTOR"].includes(req.user.nivel)) {
    return res.status(403).json({ error: "Acesso administrativo negado." });
  }
  next();
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
    app.listen(port, () => {
      console.log(`REMB Estudos disponível em http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Falha ao preparar banco de dados:", error);
    process.exit(1);
  });
