# Banco de Dados - Operacao e Evolucao

Este documento concentra os cuidados de banco da plataforma REMB Estudos: schema, importacao, integridade, indices, backup, variaveis de ambiente e preparacao para hospedagem.

## Estado atual

- Backend Node/Express usa PostgreSQL via `server.js`.
- O schema base esta em `db_schema.sql`.
- O servidor cria/atualiza tabelas essenciais no inicio por comandos idempotentes.
- Login, cadastro, logout, sessao, progresso e importacao de questoes foram validados localmente.
- Total validado depois da deduplicacao: 4839 questoes ativas.
- A Sala de Questoes consulta `/api/questions-meta` e `/api/questions`.

## Regras de seguranca

- Nao executar `DROP`, `TRUNCATE`, `DELETE` amplo, recriacao de banco ou limpeza em massa sem confirmacao explicita.
- Antes de alteracoes estruturais em ambiente com dados reais, gerar backup e registrar a migracao aplicada.
- Separar scripts somente-leitura de scripts de escrita. O comando `npm run db:check` deve permanecer diagnostico e nao destrutivo.
- Nunca versionar `.env`, dumps ou backups. A protecao ja esta registrada em `.gitignore`.

## Variaveis de ambiente

Use `DATABASE_URL` em hospedagem gerenciada quando possivel. Em ambiente local, use os campos separados:

```text
DB_USER=postgres
DB_HOST=localhost
DB_NAME=remb_estudos
DB_PASS=senha_segura
DB_PORT=5432
DB_SSL=false
```

Para hospedagem com SSL obrigatorio:

```text
DB_SSL=true
```

O administrador inicial depende de:

```text
ADMIN_NAME=Administrador
ADMIN_EMAIL=admin@seudominio.com.br
ADMIN_PASSWORD=senha_segura_com_12_ou_mais_caracteres
ADMIN_RESET_PASSWORD=false
```

Use `ADMIN_RESET_PASSWORD=true` apenas quando for intencional redefinir a senha do administrador na proxima inicializacao.

## Diagnostico

Rodar o diagnostico somente-leitura:

```bash
npm run db:check
```

O comando informa contagens de tabelas, questoes ativas, questoes sem gabarito, questoes sem alternativas, sessoes expiradas e indices encontrados.

Achado atual em 2026-08-27:

- Banco local `remb_estudos`: 4839 questoes ativas.
- Duas migracoes versionadas registradas em `schema_migrations`.
- Nenhuma questao ativa esta sem alternativas.
- Nenhuma alternativa orfa foi encontrada.
- Nenhuma questao ativa esta sem fonte estruturada em `questao_fontes`.
- Todas as questoes ativas tem `fingerprint`.
- 4838 questoes ativas nao tem resposta correta recuperavel por `gabarito` nem por alternativa marcada como correta.
- A mesma lacuna aparece nos JSONs de origem: apenas 1 questao dos arquivos importados possui `gabarito` preenchido.

Os gabaritos nao devem ser inventados pelo banco nem por backfill automatico. O tratamento deve acontecer no Laboratorio: ao editar uma questao e selecionar o gabarito, a curadoria e persistida no PostgreSQL, marcando a questao com `raw_data.curadoria.origem = laboratorio`.

O indicador de avanco dessa frente e `questionsCuratedInLab` no `npm run db:check`.

Regra permanente: o banco nunca deve deduzir, presumir ou preencher gabarito padrao. Gabarito so pode entrar por curadoria explicita no Laboratorio ou por fonte oficial/documento vinculado ao card da prova.

As provas podem manter documentos associados em `provas.prova_url`, `provas.gabarito_url`, `provas.edital_url` e `provas.recurso_url`. Na Biblioteca de Provas, o link "Gabarito" deve abrir o documento de gabarito vinculado ao card ou o mesmo documento da prova quando o gabarito estiver contido nele; se nao houver documento, a tela deve avisar que nenhum gabarito foi vinculado.

Inventario atual dos cards da Biblioteca de Provas:

- Total de cards: 49.
- Cards com JSON local correspondente em `dados/`: 0.
- Cards com documento/link estruturado vinculado no proprio card: 0.
- Cards pendentes sem arquivo/link para processamento: 49.

Portanto, o processamento em lote das provas pendentes depende de associar arquivos ou links oficiais aos cards antes da extracao/importacao.

## Migracoes versionadas

Rodar migracoes pendentes:

```bash
npm run db:migrate
```

O comando registra os arquivos aplicados em `schema_migrations`. A primeira migracao criada e `migrations/001_operational_foundation.sql`, com tabelas auxiliares e indices idempotentes que ja existiam no schema planejado.

## Fontes estruturadas

Popular tabelas auxiliares de origem a partir das questoes ja importadas:

```bash
npm run db:backfill:sources
```

Este comando nao altera questoes nem alternativas; ele insere registros ausentes em `bancas`, `orgaos`, `concursos`, `provas` e `questao_fontes`.

Resultado aplicado no banco local em 2026-08-27:

- 4839 questoes verificadas.
- 4839 vinculos inseridos em `questao_fontes`.
- Diagnostico final: `activeQuestionsWithoutSource = 0`.

## Importacao de questoes

Rodar a importacao administrativa:

```bash
npm run import:questions
```

Cuidados antes de importar:

- Confirmar que o servidor esta iniciado com o mesmo banco de destino.
- Confirmar `ADMIN_EMAIL` e `ADMIN_PASSWORD`.
- Gerar backup quando o banco tiver dados reais.
- Conferir o resultado em `/api/questions-meta` e no `npm run db:check`.

## Indices e consultas

Indices atuais relevantes:

- Sessoes por `token_hash` e `expires_at`.
- Questoes por `fingerprint`, `disciplina_id`, `assunto_id`, `banca`, `ano`, `status`.
- Busca textual em `enunciado` por vetor `to_tsvector('portuguese', enunciado)`.
- Relacao `questao_assuntos` por `assunto_id`.

Status atual: a busca por `search` em `/api/questions` ja usa `to_tsvector`/`plainto_tsquery` para `enunciado` e `contexto`, mantendo `ILIKE` como apoio para `prova`, `cargo` e `banca`.

## Backup

Antes de subir para producao, definir um procedimento padrao:

- Backup automatico diario no provedor do banco.
- Retencao minima de 7 a 30 dias, conforme custo.
- Backup manual antes de importacoes grandes e migracoes.
- Teste periodico de restauracao em banco separado.

Com PostgreSQL local, o backup manual recomendado e um dump customizado:

```bash
pg_dump --format=custom --no-owner --no-acl --file=backups/remb_estudos_YYYY-MM-DD.dump remb_estudos
```

Neste projeto, tambem ha um comando local para gerar backup na pasta `backups/`:

```bash
npm run db:backup
```

Nunca salvar dumps dentro do repositorio remoto.

## Migracoes

Enquanto o projeto estiver pequeno, `db_schema.sql`, `ensureAuthSchema()` e a pasta `migrations/` mantem a base inicial e a evolucao controlada. Em producao, aplicar migracoes antes de iniciar uma versao nova da API.

Modelo sugerido:

```text
migrations/
  001_base.sql
  002_questions_indexes.sql
  003_financeiro.sql
```

Cada migracao deve ser idempotente quando possivel e revisada antes de rodar em producao.

## Checklist para hospedagem

- Banco PostgreSQL provisionado.
- `DATABASE_URL` configurada na hospedagem.
- SSL confirmado e `DB_SSL=true` quando necessario.
- `NODE_ENV=production`.
- `ADMIN_PASSWORD` forte.
- Backup automatico ativado.
- Logs de erro acessiveis.
- Teste de login administrativo.
- Teste de cadastro de aluno.
- Teste de progresso.
- Teste de `/api/questions-meta`.
- Teste de `/api/questions?page=1&limit=20`.
- `npm run db:check` sem alertas graves.
