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

CREATE INDEX IF NOT EXISTS idx_usuario_prova_acessos_usuario ON usuario_prova_acessos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuario_lista_acessos_usuario ON usuario_lista_acessos(usuario_id);

