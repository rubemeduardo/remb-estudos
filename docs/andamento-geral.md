# Andamento Geral do Desenvolvimento

Este documento registra, em alto nivel, o estado atual da plataforma REMB Estudos e as frentes que devem ser tratadas em chats ou tarefas especificas.

## O que ja existe

- Aplicacao web principal em `index.html`, com area logada da plataforma.
- Servidor Node/Express em `server.js`.
- Banco PostgreSQL modelado em `db_schema.sql`.
- Autenticacao por API, senha com hash `scrypt` e sessao em cookie `HttpOnly`.
- Salvamento de progresso do usuario pela rota `/api/progress`.
- Painel administrativo basico de usuarios pela rota `/api/admin/users`.
- Telas de dashboard, questoes, laboratorio de validacao, caderno de erros, favoritas, notas, configuracoes, assinatura, notificacoes, integracoes, backup, suporte, termos, provas, listas, estatisticas, planner e admin.
- Planner independente em `planner/`.
- Identidade visual em `identidade_visual/`.
- Documentacao de publicacao inicial em `docs/prioridade-0-publicacao.md`.
- Manual de frontend e SEO em `docs/manual-frontend-paginas-seo.md`.
- Bases locais de questoes em `dados/`.
- Script de migracao de dados em `js/migrate_data.js`.

## Pontos a serem tratados

### 1. Banco de questoes no backend

Migrar o banco de questoes para consultas no servidor, com filtros, paginacao e carregamento sob demanda.

### 2. Refatoracao do frontend

Reduzir a concentracao de responsabilidades em `index.html`, `js/app.js` e `css/style.css`, extraindo componentes e modulos menores.

### 3. Persistencia de dados do usuario

Separar o que deve continuar local no navegador do que deve ser salvo por usuario no banco, incluindo progresso, filtros, listas, planner e preferencias.

### 4. Planner

Definir se o planner continua como modulo local, se sincroniza por usuario ou se vira modulo proprio no backend.

### 5. Importacao e qualidade das questoes

Melhorar o fluxo de importacao, revisar inconsistencias, padronizar dados e tratar questoes extraidas sem alternativas ou com enunciado incompleto.

### 6. Administracao e permissoes

Ampliar o painel administrativo com permissoes, validade de acesso, reset de senha, auditoria, metricas e controles operacionais.

### 7. Publicacao e infraestrutura

Definir hospedagem, dominio, HTTPS, cache, backup, logs, monitoramento, ambiente de producao e separacao entre frontend e API.

### 8. Testes automatizados

Criar cobertura para login, cadastro, sessao, progresso, permissoes administrativas e fluxos principais de resolucao de questoes.

### 9. SEO e paginas publicas

Criar paginas publicas leves, separadas da SPA logada, com canonical, Open Graph, dados estruturados, sitemap e robots.

### 10. Versionamento

Organizar o versionamento do projeto antes de mudancas maiores, garantindo historico confiavel de evolucao.

### 11. Controle de custos, orcamento e consolidacao REMB

Criar uma area de controle financeiro do projeto como um todo, inicialmente dentro da pagina Financeiro do painel administrativo, salvo decisao posterior por uma pagina propria.

Essa frente deve registrar gastos ja efetuados, gastos recorrentes, previsoes futuras e orcamento planejado, incluindo dominio, hospedagem, ferramentas, APIs, servicos, ativos, mao de obra, manutencao e reservas. Tambem deve preparar os dados para envio futuro ao sistema REMB, que sera desenvolvido para consolidacao geral de controles, incluindo financeiro e custos.

Documento de escopo: `docs/controle-custos-projeto.md`.

## Chats especificos sugeridos

- Backend de questoes e paginacao.
- Refatoracao do frontend.
- Persistencia do planner e progresso.
- Importacao e saneamento das questoes.
- Painel administrativo e permissoes.
- Publicacao em producao.
- Testes automatizados.
- SEO e paginas publicas.
- Controle financeiro, custos e orcamento do projeto.
