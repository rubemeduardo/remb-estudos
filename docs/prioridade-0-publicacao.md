# Prioridade 0 - Bloqueios de Publicacao

Este documento registra o tratamento inicial dos bloqueios criticos para publicar a plataforma REMB Estudos com usuarios reais.

## O que foi tratado

- Autenticacao saiu do `localStorage` e passou a usar API no servidor.
- Senhas passaram a ser armazenadas com hash `scrypt`.
- Sessoes passaram a usar token aleatorio em cookie `HttpOnly`.
- Progresso do usuario passou a ser salvo no PostgreSQL pela rota `/api/progress`.
- Acoes administrativas de usuarios passaram a exigir perfil validado no servidor.
- A troca manual de usuario/perfil no front-end foi desativada.
- O usuario padrao `ceo@rembconcursos.com.br` com senha simples foi removido do front-end e da migracao.
- O servidor agora exige configuracao explicita de banco antes de iniciar.

## Arquivos principais alterados

- `server.js`: servidor de producao, API de autenticacao, sessoes, progresso e usuarios admin.
- `js/app.js`: login, cadastro, logout, progresso e admin conectados a API.
- `db_schema.sql`: tabelas de sessoes e progresso, campos adicionais de usuario e indices.
- `js/migrate_data.js`: administrador inicial criado somente por variaveis de ambiente, com senha em hash.
- `.env.example`: modelo das variaveis de ambiente de producao.
- `.gitignore`: impede versionar `.env`, logs e dependencias instaladas.
- `package.json`: `npm start` passa a iniciar o servidor de producao.

## Variaveis obrigatorias

Configure uma das opcoes abaixo.

Opcao A: URL unica do banco:

```text
DATABASE_URL=postgres://usuario:senha@host:5432/remb_estudos
```

Opcao B: campos separados:

```text
DB_USER=postgres
DB_HOST=localhost
DB_NAME=remb_estudos
DB_PASS=senha_segura
DB_PORT=5432
DB_SSL=false
```

Para criar o primeiro administrador automaticamente:

```text
ADMIN_NAME=Administrador
ADMIN_EMAIL=admin@seudominio.com.br
ADMIN_PASSWORD=senha_segura_com_12_ou_mais_caracteres
```

## Como validar

1. Criar `.env` a partir de `.env.example`.
2. Configurar PostgreSQL acessivel.
3. Rodar `npm start`.
4. Abrir `http://localhost:8081`.
5. Entrar com o administrador definido em `ADMIN_EMAIL` e `ADMIN_PASSWORD`.
6. Testar cadastro de aluno, login, logout, progresso, favoritos, listas e tela administrativa de usuarios.

## Pendencias que ainda ficam para Prioridade 1

- Migrar o banco de questoes para consultas paginadas no backend.
- Criar build/hospedagem separados para front-end e API.
- Configurar HTTPS, dominio, cache, backup e observabilidade.
- Criar testes automatizados para login, progresso, permissoes e fluxos principais.
