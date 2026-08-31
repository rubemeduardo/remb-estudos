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

CREATE INDEX IF NOT EXISTS idx_gabarito_mapas_origem ON gabarito_mapas(tipo_origem, origem_id);
CREATE INDEX IF NOT EXISTS idx_gabarito_mapas_questao ON gabarito_mapas(aplicado_questao_id);
