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

CREATE TABLE IF NOT EXISTS usuario_prova_acessos (
    usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
    prova_id VARCHAR(120) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, prova_id)
);

CREATE TABLE IF NOT EXISTS usuario_lista_acessos (
    usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
    lista_id VARCHAR(50) REFERENCES listas(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, lista_id)
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
    concurso_id INT REFERENCES concursos(id) ON DELETE CASCADE,
    prova_url TEXT,
    gabarito_url TEXT,
    edital_url TEXT,
    recurso_url TEXT
);

-- 3. CLASSIFICAÇÃO ACADÊMICA
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

-- 3. CONTEÚDO E QUESTÕES
CREATE TABLE IF NOT EXISTS questoes (
    id VARCHAR(160) PRIMARY KEY,
    tipo_questao VARCHAR(30) NOT NULL DEFAULT 'MULTIPLA_ESCOLHA', -- 'MULTIPLA_ESCOLHA' ou 'CERTO_ERRADO'
    numero INT,
    disciplina_id INT REFERENCES disciplinas(id) ON DELETE SET NULL,
    assunto_id INT REFERENCES assuntos(id) ON DELETE SET NULL,
    subassunto VARCHAR(180),
    banca VARCHAR(120),
    orgao VARCHAR(180),
    cargo VARCHAR(180),
    ano INT,
    prova VARCHAR(255),
    contexto TEXT,
    enunciado TEXT NOT NULL,
    justificativa TEXT,
    dificuldade VARCHAR(50),
    gabarito VARCHAR(10),
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    origem_questao JSONB NOT NULL DEFAULT '{}'::jsonb,
    origem_importacao JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'ATIVA',
    fingerprint VARCHAR(64) UNIQUE, -- Para deduplicação
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alternativas (
    id SERIAL PRIMARY KEY,
    questao_id VARCHAR(160) REFERENCES questoes(id) ON DELETE CASCADE,
    letra CHAR(1) NOT NULL, -- 'A', 'B', 'C', 'D', 'E' ou 'C', 'E' (para certo/errado)
    texto TEXT NOT NULL,
    is_correta BOOLEAN NOT NULL DEFAULT FALSE,
    ordem INT NOT NULL,
    UNIQUE (questao_id, letra)
);

-- PROVENIÊNCIA E IMPORTAÇÃO
CREATE TABLE IF NOT EXISTS questao_fontes (
    id SERIAL PRIMARY KEY,
    questao_id VARCHAR(160) REFERENCES questoes(id) ON DELETE CASCADE,
    tipo_fonte VARCHAR(50) NOT NULL, -- 'PROVA', 'LISTA', 'AUTORAL'
    prova_id INT REFERENCES provas(id) ON DELETE SET NULL,
    numero_original INT
);

CREATE TABLE IF NOT EXISTS gabarito_mapas (
    id VARCHAR(80) PRIMARY KEY,
    tipo_origem VARCHAR(30) NOT NULL, -- 'prova' ou 'lista'
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

CREATE TABLE IF NOT EXISTS questao_assuntos (
    questao_id VARCHAR(160) REFERENCES questoes(id) ON DELETE CASCADE,
    assunto_id INT REFERENCES assuntos(id) ON DELETE CASCADE,
    PRIMARY KEY (questao_id, assunto_id)
);

-- 5. LISTAS DO USUÁRIO
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

CREATE TABLE IF NOT EXISTS lista_tags (
    lista_id VARCHAR(50) REFERENCES listas(id) ON DELETE CASCADE,
    tag VARCHAR(80) NOT NULL,
    usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lista_id, tag)
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
    questao_id VARCHAR(160) REFERENCES questoes(id) ON DELETE CASCADE,
    ordem INT NOT NULL,
    PRIMARY KEY (sessao_id, questao_id)
);

CREATE TABLE IF NOT EXISTS resolucoes_questao (
    id SERIAL PRIMARY KEY,
    sessao_id INT REFERENCES sessoes_estudo(id) ON DELETE SET NULL,
    usuario_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
    questao_id VARCHAR(160) REFERENCES questoes(id) ON DELETE CASCADE,
    resposta VARCHAR(10) NOT NULL, -- Letra respondida ('A', 'B', etc. ou 'C', 'E')
    is_correta BOOLEAN NOT NULL,
    tempo_segundos INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. INTERAÇÃO E ESTADO PESSOAL DO USUÁRIO
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
    tipo_marcacao VARCHAR(50) NOT NULL, -- 'RISCADA', 'TACHADA_LETRA'
    valor VARCHAR(255) NOT NULL,       -- e.g. 'A' ou 'true'
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, questao_id, tipo_marcacao)
);

-- 8. FINANCEIRO E CUSTOS DO PROJETO
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

-- 9. ÍNDICES DE DESEMPENHO
CREATE INDEX IF NOT EXISTS idx_resolucoes_usuario_questao ON resolucoes_questao(usuario_id, questao_id);
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
CREATE INDEX IF NOT EXISTS idx_usuario_sessoes_token_hash ON usuario_sessoes(token_hash);
CREATE INDEX IF NOT EXISTS idx_usuario_sessoes_expires_at ON usuario_sessoes(expires_at);
CREATE INDEX IF NOT EXISTS idx_usuario_prova_acessos_usuario ON usuario_prova_acessos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuario_lista_acessos_usuario ON usuario_lista_acessos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_projeto_custos_status ON projeto_custos(status);
CREATE INDEX IF NOT EXISTS idx_projeto_custos_categoria ON projeto_custos(categoria);
CREATE INDEX IF NOT EXISTS idx_projeto_custos_fornecedor ON projeto_custos(fornecedor);
CREATE INDEX IF NOT EXISTS idx_projeto_custos_vencimento ON projeto_custos(data_vencimento, proximo_vencimento);
CREATE INDEX IF NOT EXISTS idx_projeto_receitas_status ON projeto_receitas(status);
CREATE INDEX IF NOT EXISTS idx_projeto_receitas_categoria ON projeto_receitas(categoria);
CREATE INDEX IF NOT EXISTS idx_projeto_receitas_usuario ON projeto_receitas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_projeto_receitas_datas ON projeto_receitas(data_recebimento, data_vencimento, proximo_recebimento);
CREATE INDEX IF NOT EXISTS idx_projeto_assinaturas_status ON projeto_assinaturas(status);
CREATE INDEX IF NOT EXISTS idx_projeto_assinaturas_usuario ON projeto_assinaturas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_projeto_receita_competencias_assinatura ON projeto_receita_competencias(assinatura_id);
CREATE INDEX IF NOT EXISTS idx_projeto_receita_competencias_data ON projeto_receita_competencias(competencia);
CREATE INDEX IF NOT EXISTS idx_projeto_cobrancas_status ON projeto_cobrancas(status);
CREATE INDEX IF NOT EXISTS idx_projeto_cobrancas_vencimento ON projeto_cobrancas(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_projeto_caixa_movimentos_data ON projeto_caixa_movimentos(data_movimento);



