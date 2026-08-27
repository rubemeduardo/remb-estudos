# Manual de Frontend das Paginas - REMB Estudos

Este manual orienta a evolucao do frontend da plataforma REMB Estudos, com foco em clareza visual, manutencao do codigo, acessibilidade e melhor posicionamento organico no Google.

## Diagnostico do Frontend Atual

O sistema atual e uma aplicacao web estatica servida por `dev_server.js`.

Arquivos principais:

- `index.html`: SPA principal da plataforma REMB Estudos.
- `css/style.css`: tema, layout principal, cards, questoes, planner interno, responsividade e componentes gerais.
- `css/login.css`: login e cadastro.
- `css/session.css`: sessao ativa de resolucao de questoes.
- `js/app.js`: motor central da SPA, filtros, questoes, dashboard, planner embutido, laboratorio, listas, modo correcao, tema e login local.
- `js/session.js`: experiencia de sessao ativa.
- `planner/index.html`: planner independente em iframe.
- `planner/style.css`: identidade visual propria do planner.
- `planner/js/app.js`: regras e estado do planner.
- `identidade_visual/`: logos, paleta, componentes e manual visual.

Paginas/telas existentes na SPA principal:

- Dashboard.
- Questoes.
- Laboratorio de validacao.
- Caderno de erros.
- Favoritas.
- Minhas notas.
- Configuracoes.
- Assinatura.
- Notificacoes.
- Integracoes.
- Backup.
- Suporte.
- Termos e privacidade.
- Biblioteca de provas.
- Listas de questoes.
- Estatisticas.
- Planner.
- Painel administrativo.

Observacoes tecnicas relevantes:

- A base visual ja possui bons tokens CSS em `:root` e tema escuro em `[data-theme="dark"]`.
- A plataforma usa `Outfit` para titulos/controles e `Inter` para leitura.
- Ha separacao parcial entre HTML, CSS e JS, mas `index.html` e `js/app.js` concentram muitas responsabilidades.
- Ha muitos estilos inline e eventos inline, como `style=""` e `onclick=""`, que dificultam manutencao, reaproveitamento e auditoria de acessibilidade.
- A aplicacao carrega arquivos JS muito grandes com bases de questoes, o que pode prejudicar velocidade percebida e metricas de SEO quando usado em paginas publicas.
- O SEO atual tem `title`, `description` e `keywords`, mas ainda falta arquitetura propria para paginas publicas indexaveis, canonical, Open Graph, dados estruturados e conteudo rastreavel por pagina.

## Principio Central

Cada pagina deve ser intuitiva primeiro e tecnicamente rastreavel depois. O usuario precisa entender onde esta, o que pode fazer e qual e o proximo passo; o Google precisa conseguir identificar tema, hierarquia, conteudo principal, links, performance e autoridade da pagina.

## Arquitetura de Arquivos Recomendada

Para novas paginas, use um arquivo por responsabilidade.

Estrutura recomendada:

```text
pages/
  nome-da-pagina/
    index.html
    nome-da-pagina.css
    nome-da-pagina.js
    nome-da-pagina.data.js
    nome-da-pagina.schema.json
    README.md

components/
  nome-do-componente/
    nome-do-componente.html
    nome-do-componente.css
    nome-do-componente.js
```

Quando a pagina for pequena, `nome-da-pagina.data.js` e `nome-da-pagina.schema.json` podem ser omitidos. Quando houver conteudo SEO, o schema deve ser mantido em arquivo proprio ou em bloco `<script type="application/ld+json">` gerado a partir de dados versionados.

Regra pratica:

- HTML define estrutura semantica e conteudo inicial.
- CSS define aparencia, estados visuais e responsividade.
- JS define comportamento, eventos, filtros, renderizacao dinamica e persistencia.
- Dados grandes ficam fora do bundle principal e devem ser carregados sob demanda.
- Um componente reutilizavel deve ter pasta propria quando aparecer em 2 ou mais telas.

## Convencao de Nomes

Use nomes descritivos e consistentes:

- Paginas: `pages/biblioteca-provas/`, `pages/sala-questoes/`, `pages/planner-estudos/`.
- CSS de pagina: `biblioteca-provas.css`.
- JS de pagina: `biblioteca-provas.js`.
- Componentes: `components/question-card/`, `components/sidebar-nav/`, `components/filter-panel/`.
- Classes CSS: preferir padrao por bloco, como `.question-card`, `.question-card__header`, `.question-card--answered`.
- IDs: usar somente quando o JS precisa de um alvo unico.

Evite:

- `style=""` em HTML.
- `onclick=""` em HTML.
- nomes vagos como `.box`, `.item2`, `.blue-card`.
- duplicar IDs, especialmente em navegacoes e abas.

## Template Minimo de Pagina

Toda pagina publica ou indexavel deve seguir esta base:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tema principal da pagina | REMB Estudos</title>
  <meta name="description" content="Resumo claro com ate 155 caracteres, incluindo a intencao de busca principal.">
  <link rel="canonical" href="https://www.dominio.com.br/caminho-da-pagina/">
  <meta name="robots" content="index,follow">
  <meta property="og:title" content="Tema principal da pagina | REMB Estudos">
  <meta property="og:description" content="Resumo claro da pagina para compartilhamento.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://www.dominio.com.br/caminho-da-pagina/">
  <meta property="og:image" content="https://www.dominio.com.br/assets/og/remb-estudos.jpg">
  <link rel="stylesheet" href="../../css/style.css">
  <link rel="stylesheet" href="./nome-da-pagina.css">
</head>
<body>
  <header class="site-header"></header>
  <main id="conteudo-principal">
    <article>
      <h1>Titulo unico e especifico da pagina</h1>
    </article>
  </main>
  <script src="./nome-da-pagina.js" defer></script>
</body>
</html>
```

## SEO para Google

SEO e parte da construcao da pagina, nao um ajuste final.

### Regras Obrigatorias

- Cada URL indexavel deve ter um unico tema principal.
- Cada pagina deve ter apenas um `<h1>`.
- Use hierarquia real: `<h2>` para secoes principais, `<h3>` para subsecoes.
- Escreva title com ate 60 caracteres quando possivel.
- Escreva description com 140 a 155 caracteres quando possivel.
- Use canonical em paginas publicas.
- Use URLs legiveis: `/questoes-cebraspe/`, `/planner-de-estudos/`, `/concurso-tcu/`.
- O conteudo principal deve existir no HTML inicial sempre que a pagina precisar ranquear.
- Evite depender apenas de JS para exibir texto importante de SEO.
- Imagens informativas devem ter `alt` descritivo.
- Imagens decorativas devem ter `alt=""` ou ser plano de fundo CSS.
- Links devem usar texto claro, nao apenas "clique aqui".
- Botoes executam acoes; links navegam para URLs.

### Conteudo Recomendado por Tipo de Pagina

Pagina de funcionalidade:

- H1 com o nome da ferramenta ou beneficio.
- Explicacao objetiva do problema resolvido.
- Blocos de uso, diferenciais e perguntas frequentes.
- CTA claro para entrar, testar ou iniciar estudo.

Pagina de biblioteca de provas:

- H1 com banca, orgao, cargo ou ano.
- Texto introdutorio sobre a prova.
- Lista rastreavel de provas, gabaritos, filtros e assuntos.
- Dados estruturados quando houver materiais baixaveis.

Pagina de questoes:

- H1 especifico por banca/disciplina/assunto.
- Descricao textual antes da lista.
- Filtros com labels acessiveis.
- Paginacao rastreavel se virar pagina publica.

Pagina institucional:

- H1 com marca ou promessa objetiva.
- Beneficios reais.
- Provas sociais ou indicadores verificaveis.
- FAQ com perguntas que correspondam a buscas reais.

### Dados Estruturados

Use JSON-LD quando a pagina tiver conteudo publico. Tipos mais adequados:

- `Organization`: marca REMB Estudos.
- `WebSite`: site principal e busca interna.
- `SoftwareApplication`: plataforma de estudos.
- `FAQPage`: perguntas frequentes reais.
- `BreadcrumbList`: trilha de navegacao.
- `Course` ou `LearningResource`: conteudos educacionais, quando aplicavel.

Exemplo:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "REMB Estudos",
  "applicationCategory": "EducationalApplication",
  "operatingSystem": "Web",
  "description": "Plataforma de estudos para concursos publicos com questoes, caderno de erros, planner e metricas."
}
</script>
```

## Separacao entre Paginas Publicas e Plataforma Interna

A SPA atual e boa para area logada, mas nao e ideal como unica estrategia SEO.

Recomendacao:

- Manter `index.html` como plataforma/app.
- Criar paginas publicas leves em `pages/` ou em rotas equivalentes.
- Evitar carregar `js/banco_questoes.js` e `js/questoes_cespe_tratadas.js` em paginas publicas sem necessidade.
- Criar uma landing publica otimizada para "plataforma de estudos para concursos".
- Criar paginas de acervo por banca, disciplina e prova quando houver conteudo publico.
- Usar a SPA logada para estudo, filtros avancados e interacoes personalizadas.

## Performance e Core Web Vitals

Prioridades:

- Carregar JS com `defer`, exceto scripts realmente necessarios antes da renderizacao.
- Carregar bibliotecas externas apenas nas paginas que usam essas bibliotecas.
- Dividir bases de questoes por banca, ano, disciplina ou demanda.
- Evitar inserir grandes blocos via `innerHTML` quando houver risco de re-renderizacao pesada.
- Usar imagens otimizadas em `webp` ou `avif` para paginas publicas.
- Definir `width` e `height` ou `aspect-ratio` para midias.
- Reduzir CSS nao usado em paginas publicas.
- Preferir fontes com pesos limitados: 400, 600, 700 e 800 somente quando necessario.
- Usar cache em producao. O servidor atual esta correto para desenvolvimento com `no-cache`, mas producao deve usar cache com versionamento.

Meta de qualidade:

- LCP abaixo de 2,5s.
- CLS abaixo de 0,1.
- INP abaixo de 200ms.
- HTML inicial com conteudo essencial em ate 14KB quando possivel para paginas publicas.

## Acessibilidade

Regras para novas paginas:

- Todo input deve ter `<label for="">`.
- Todo botao de icone deve ter `aria-label` ou tooltip acessivel.
- Navegacao principal deve usar `<nav>`.
- Conteudo principal deve estar em `<main>`.
- Modais devem declarar `role="dialog"` e `aria-modal="true"`.
- Estados ativos devem usar classe visual e, quando aplicavel, `aria-current="page"` ou `aria-selected="true"`.
- Contraste minimo: 4.5:1 para texto comum.
- Nao usar emoji como unico comunicador de estado.
- A ordem de tabulacao deve seguir a ordem visual.

## Padroes Visuais

Preserve a identidade atual:

- Fundo claro principal `#f1f5f9`.
- Sidebar/navy `#0f172a`.
- Cards `#ffffff`.
- Texto principal `#0f172a`.
- Texto secundario `#475569`.
- Azul de acao `#2563eb`.
- Verde para sucesso, vermelho para erro, amarelo para alerta.
- `Outfit` para titulos, botoes e metricas.
- `Inter` para leitura e formularios.

O planner pode manter subtema escuro/indigo, mas deve ser apresentado como modulo funcional separado.

Cards:

- Use cards para itens repetidos, modais e paineis de ferramenta.
- Evite card dentro de card.
- Raio recomendado: 8px para controles e cards padrao; 12px apenas quando ja for padrao da tela existente.

Botoes:

- Acao primaria: azul.
- Acao secundaria: neutra.
- Acao destrutiva: vermelho.
- Icones devem reforcar a acao, nao substituir texto quando a acao nao for obvia.

## Componentes Prioritarios para Extrair

Para reduzir a complexidade do `index.html` e do `js/app.js`, extraia primeiro:

- `components/sidebar-nav/`: menu lateral, seletor de portal, tema e logout.
- `components/topbar-mobile/`: barra superior e menu mobile.
- `components/question-card/`: card de questao, alternativas, tags, favoritos e rodape.
- `components/filter-panel/`: filtros de disciplina, assunto, banca, ano e listas.
- `components/pagination/`: paginacao e itens por pagina.
- `components/highlighter-toolbar/`: barra de caneta e controles de tonalidade.
- `components/modal/`: estrutura comum de modais.
- `components/kpi-card/`: cards de metricas do dashboard.
- `components/proof-card/`: cards da biblioteca de provas.

Cada componente deve ter:

- HTML ou funcao de template isolada.
- CSS proprio ou bloco claro no arquivo da pagina.
- JS com eventos via `addEventListener`.
- contrato simples de dados.

## Padrao de JS

Para novas implementacoes:

- Use `addEventListener` em vez de `onclick` no HTML.
- Centralize seletores DOM no inicio do modulo.
- Separe estado, renderizacao e eventos.
- Evite variaveis globais; quando inevitavel, documente no topo do arquivo.
- Evite interpolar dados de usuario diretamente em `innerHTML`.
- Quando usar `innerHTML`, sanitize ou restrinja a origem dos dados.
- Persistencia local deve ter prefixo `remb_`.
- Funcoes devem ter nomes de intencao: `renderizarBibliotecaProvas`, `aplicarFiltrosProvas`, `abrirModalQuestao`.

Modelo recomendado:

```js
const state = {
  filtroAtual: null,
  itens: []
};

const elements = {
  lista: document.querySelector("[data-js='lista']"),
  filtro: document.querySelector("[data-js='filtro']")
};

function render() {
  // Atualiza a tela a partir do estado.
}

function bindEvents() {
  elements.filtro.addEventListener("change", handleFiltroChange);
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  render();
});
```

## Padrao de CSS

Para novas implementacoes:

- Comece com tokens existentes.
- Crie classes reutilizaveis antes de estilos especificos.
- Evite `!important`.
- Evite CSS inline.
- Mantenha media queries perto do bloco correspondente ou em area responsiva da pagina.
- Use `rem`, `px` e porcentagem com criterio: texto em `rem`, bordas e icones em `px`, grids com `minmax`.
- Defina dimensoes estaveis em grids, toolbars, cards e botoes para evitar saltos de layout.

Exemplo:

```css
.proof-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
  padding: 16px;
}

.proof-card__title {
  font-family: var(--font-heading);
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-primary);
}
```

## Checklist de Criacao de Nova Pagina

Antes de considerar uma pagina pronta:

- Ha um arquivo HTML, um CSS e um JS separados.
- O HTML tem `lang="pt-BR"`, viewport, title e description.
- Pagina publica tem canonical, robots, Open Graph e JSON-LD quando aplicavel.
- Existe apenas um H1.
- A hierarquia H2/H3 esta correta.
- O conteudo principal aparece sem depender totalmente do JS.
- Botoes e inputs estao acessiveis.
- Nao ha texto estourando em mobile.
- Nao ha estilos inline fora de excecoes temporarias documentadas.
- Bibliotecas externas so carregam quando usadas.
- Dados grandes sao carregados sob demanda.
- A pagina foi testada em desktop, tablet e mobile.
- A identidade visual segue o manual da pasta `identidade_visual/`.

## Plano de Evolucao Recomendado

1. Criar paginas publicas SEO leves para aquisicao organica.
2. Extrair componentes comuns da SPA principal.
3. Remover gradualmente estilos inline do `index.html`.
4. Trocar eventos inline por `addEventListener`.
5. Dividir `js/app.js` por dominio: questoes, provas, listas, planner, admin, tema, login.
6. Dividir bases de questoes para carregamento sob demanda.
7. Adicionar dados estruturados nas paginas publicas.
8. Criar `sitemap.xml` e `robots.txt` na raiz quando houver dominio de producao.
9. Criar politica de cache de producao diferente do servidor de desenvolvimento.
10. Medir Core Web Vitals depois de cada grande mudanca.

## Regra de Ouro

Toda nova pagina deve responder a tres perguntas:

- Para o usuario: consigo entender e usar a tela sem explicacao?
- Para o desenvolvedor: consigo alterar um elemento sem abrir um arquivo gigante?
- Para o Google: consigo identificar claramente o assunto, a estrutura e a utilidade desta URL?
