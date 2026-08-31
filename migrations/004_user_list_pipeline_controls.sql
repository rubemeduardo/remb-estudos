-- Controles de listas importadas por usuários comuns.
-- Mantém listas privadas por padrão, permite busca por tags e preserva divergências de gabarito sem sobrescrever fonte oficial.

ALTER TABLE listas ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE listas ADD COLUMN IF NOT EXISTS usar_na_resolucao BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE listas ADD COLUMN IF NOT EXISTS origem_tipo VARCHAR(40) NOT NULL DEFAULT 'manual';
ALTER TABLE listas ADD COLUMN IF NOT EXISTS arquivo_origem TEXT;
ALTER TABLE listas ADD COLUMN IF NOT EXISTS compartilhamento_status VARCHAR(30) NOT NULL DEFAULT 'privada';
ALTER TABLE listas ADD COLUMN IF NOT EXISTS gabaritos_pendentes INT NOT NULL DEFAULT 0;
ALTER TABLE listas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

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

CREATE INDEX IF NOT EXISTS idx_listas_usuario ON listas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_listas_tags_gin ON listas USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_lista_tags_tag ON lista_tags(tag);
