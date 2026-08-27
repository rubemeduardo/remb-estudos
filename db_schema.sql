-- SCHEMA DO BANCO DE DADOS REMB CONCURSOS (POSTGRESQL 16)
-- Define a estrutura relacional do sistema seguindo o Manual de Arquitetura e Modelagem V1.0

-- 1. IDENTIDADE E ACESSO
CREATE TABLE IF NOT EXISTS usuarios (
    id VARCHAR(50) PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    nivel VARCHAR(50) NOT NULL DEFAULT 'ALUNO',
    status VARCHAR(20) NOT NULL DEFAULT 'ATIVO',
    telefone VARCHAR(30),
    validade DATE,
    notas TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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

-- 2. ESTRUTURA DE CONCURSOS E ORIGENS
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

-- 3. CONTEÚDO E QUESTÕES
CREATE TABLE IF NOT EXISTS questoes (
    id VARCHAR(50) PRIMARY KEY,
    tipo_questao VARCHAR(30) NOT NULL DEFAULT 'MULTIPLA_ESCOLHA', -- 'MULTIPLA_ESCOLHA' ou 'CERTO_ERRADO'
    enunciado TEXT NOT NULL,
    justificativa TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'ATIVA',
    fingerprint VARCHAR(64) UNIQUE, -- Para deduplicação
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alternativas (
    id SERIAL PRIMARY KEY,
    questao_id VARCHAR(50) REFERENCES questoes(id) ON DELETE CASCADE,
    letra CHAR(1) NOT NULL, -- 'A', 'B', 'C', 'D', 'E' ou 'C', 'E' (para certo/errado)
    texto TEXT NOT NULL,
    is_correta BOOLEAN NOT NULL DEFAULT FALSE,
    ordem INT NOT NULL,
    UNIQUE (questao_id, letra)
);

-- PROVENIÊNCIA E IMPORTAÇÃO
CREATE TABLE IF NOT EXISTS questao_fontes (
    id SERIAL PRIMARY KEY,
    questao_id VARCHAR(50) REFERENCES questoes(id) ON DELETE CASCADE,
    tipo_fonte VARCHAR(50) NOT NULL, -- 'PROVA', 'LISTA', 'AUTORAL'
    prova_id INT REFERENCES provas(id) ON DELETE SET NULL,
    numero_original INT
);

-- 4. CLASSIFICAÇÃO ACADÊMICA
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

CREATE TABLE IF NOT EXISTS questao_assuntos (
    questao_id VARCHAR(50) REFERENCES questoes(id) ON DELETE CASCADE,
    assunto_id INT REFERENCES assuntos(id) ON DELETE CASCADE,
    PRIMARY KEY (questao_id, assunto_id)
);

-- 5. LISTAS DO USUÁRIO
CREATE TABLE IF NOT EXISTS listas (
    id VARCHAR(50) PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
    is_publica BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lista_questoes (
    lista_id VARCHAR(50) REFERENCES listas(id) ON DELETE CASCADE,
    questao_id VARCHAR(50) REFERENCES questoes(id) ON DELETE CASCADE,
    ordem INT NOT NULL,
    PRIMARY KEY (lista_id, questao_id)
);

-- 6. SESSÕES DE ESTUDO E HISTÓRICO DE RESOLUÇÕES (IMUTÁVEL)
CREATE TABLE IF NOT EXISTS sessoes_estudo (
    id SERIAL PRIMARY KEY,
    usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'ATIVA', -- 'ATIVA', 'CONCLUIDA'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessao_questoes (
    sessao_id INT REFERENCES sessoes_estudo(id) ON DELETE CASCADE,
    questao_id VARCHAR(50) REFERENCES questoes(id) ON DELETE CASCADE,
    ordem INT NOT NULL,
    PRIMARY KEY (sessao_id, questao_id)
);

CREATE TABLE IF NOT EXISTS resolucoes_questao (
    id SERIAL PRIMARY KEY,
    sessao_id INT REFERENCES sessoes_estudo(id) ON DELETE SET NULL,
    usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
    questao_id VARCHAR(50) REFERENCES questoes(id) ON DELETE CASCADE,
    resposta VARCHAR(10) NOT NULL, -- Letra respondida ('A', 'B', etc. ou 'C', 'E')
    is_correta BOOLEAN NOT NULL,
    tempo_segundos INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. INTERAÇÃO E ESTADO PESSOAL DO USUÁRIO
CREATE TABLE IF NOT EXISTS favoritos (
    usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
    questao_id VARCHAR(50) REFERENCES questoes(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, questao_id)
);

CREATE TABLE IF NOT EXISTS questao_anotacoes (
    usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
    questao_id VARCHAR(50) REFERENCES questoes(id) ON DELETE CASCADE,
    texto TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, questao_id)
);

CREATE TABLE IF NOT EXISTS marcacoes_usuario (
    usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
    questao_id VARCHAR(50) REFERENCES questoes(id) ON DELETE CASCADE,
    tipo_marcacao VARCHAR(50) NOT NULL, -- 'RISCADA', 'TACHADA_LETRA'
    valor VARCHAR(255) NOT NULL,       -- e.g. 'A' ou 'true'
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, questao_id, tipo_marcacao)
);

-- 8. ÍNDICES DE DESEMPENHO
CREATE INDEX IF NOT EXISTS idx_resolucoes_usuario_questao ON resolucoes_questao(usuario_id, questao_id);
CREATE INDEX IF NOT EXISTS idx_questoes_fingerprint ON questoes(fingerprint);
CREATE INDEX IF NOT EXISTS idx_questao_assuntos_assunto ON questao_assuntos(assunto_id);
CREATE INDEX IF NOT EXISTS idx_usuario_sessoes_token_hash ON usuario_sessoes(token_hash);
CREATE INDEX IF NOT EXISTS idx_usuario_sessoes_expires_at ON usuario_sessoes(expires_at);
