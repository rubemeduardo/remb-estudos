# Prioridade 1 - Questoes no Backend

## O que foi tratado

- Criada API autenticada para consulta paginada de questoes:
  - `GET /api/questions`
  - `GET /api/questions/:id`
  - `GET /api/questions-meta`
- Criada API administrativa para importar os arquivos JSON locais:
  - `POST /api/admin/questions/import`
- O banco passou a armazenar a questao completa em `raw_data`, preservando campos pedagogicos e metadados originais.
- Campos de busca e filtro foram normalizados em colunas/indexes: disciplina, assunto, banca, ano, prova, enunciado e status.
- IDs de questoes foram ampliados para `VARCHAR(160)` para suportar IDs longos vindos dos arquivos importados.
- O importador passou a deduplicar por `fingerprint`, evitando abortar quando arquivos diferentes trazem questoes equivalentes.
- Adicionado comando operacional:
  - `npm run import:questions`

## Validacao realizada em 2026-08-27

- Instancia temporaria validada em `http://localhost:8090`.
- Importacao completa executada com sucesso.
- Arquivos processados:
  - `1___100_questoes_ALUNO.json`: 99 questoes
  - `2___100_questoes_ALUNO.json`: 100 questoes
  - `3___100_questoes_ALUNO.json`: 100 questoes
  - `questoes_cespe_tratadas.json`: 3443 questoes
  - `questoes_importadas_novas.json`: 1576 questoes
- Total final no banco apos deduplicacao: 4839 questoes ativas.
- Consulta paginada retornou `200`.
- Filtro por disciplina retornou `200`.
- Consulta sem `includeAnswer=true` nao expôs `gabarito` nem marcador de alternativa correta.
- Consulta com `includeAnswer=true` expôs `gabarito` para uso controlado.

## O que ainda fica para a proxima etapa

- Conectar progressivamente as demais telas que ainda usam a base local, como biblioteca de provas, favoritas, caderno de erros, estatisticas e laboratorio.
- Adaptar filtros, biblioteca de provas, caderno e estatisticas para usarem consultas sob demanda.
- Criar cache e estrategia de carregamento por pagina/filtro na interface.

## Integracao da Sala realizada em 2026-08-27

- A tela de configuracao da Sala passou a carregar disciplinas, assuntos e bancas por `/api/questions-meta`.
- A listagem da Sala passou a consultar `/api/questions` com pagina, limite e filtros.
- A geracao de sessao passou a buscar questoes no backend com `includeAnswer=true`, necessario para corrigir respostas durante o estudo.
- `index.html` deixou de carregar inicialmente:
  - `js/banco_questoes.js`
  - `js/questoes_cespe_tratadas.js`
- As bases antigas passaram a ser carregadas sob demanda por JSON apenas em telas legadas que ainda dependem delas.
- Validacao em `http://localhost:8090`:
  - HTML inicial sem os scripts grandes.
  - `/api/questions-meta` retornou total de 4839 questoes.
  - `/api/questions?page=1&limit=20&includeAnswer=true` retornou 20 questoes.
