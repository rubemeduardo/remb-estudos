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
  concurso_id INT REFERENCES concursos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS questao_fontes (
  id SERIAL PRIMARY KEY,
  questao_id VARCHAR(160) REFERENCES questoes(id) ON DELETE CASCADE,
  tipo_fonte VARCHAR(50) NOT NULL,
  prova_id INT REFERENCES provas(id) ON DELETE SET NULL,
  numero_original INT
);

CREATE TABLE IF NOT EXISTS listas (
  id VARCHAR(50) PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
  is_publica BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lista_questoes (
  lista_id VARCHAR(50) REFERENCES listas(id) ON DELETE CASCADE,
  questao_id VARCHAR(160) REFERENCES questoes(id) ON DELETE CASCADE,
  ordem INT NOT NULL,
  PRIMARY KEY (lista_id, questao_id)
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

CREATE INDEX IF NOT EXISTS idx_questoes_enunciado_tsv ON questoes USING GIN (to_tsvector('portuguese', enunciado));
CREATE INDEX IF NOT EXISTS idx_questao_fontes_questao ON questao_fontes(questao_id);
CREATE INDEX IF NOT EXISTS idx_questao_fontes_prova ON questao_fontes(prova_id);
CREATE INDEX IF NOT EXISTS idx_resolucoes_usuario_questao ON resolucoes_questao(usuario_id, questao_id);
