# Manual de Identidade Visual - REMB Estudos

Este manual registra a identidade visual observada na plataforma existente em `index.html`, `css/style.css`, `css/login.css`, `css/session.css` e `planner/style.css`.

Para regras de construcao de paginas, estrutura de arquivos, SEO, acessibilidade e evolucao do frontend, consulte tambem `docs/manual-frontend-paginas-seo.md`.

## Essencia da Marca

**Nome de exibicao:** REMB Estudos  
**Contexto:** plataforma premium de estudos para concursos publicos.  
**Tom visual:** institucional, limpo, orientado a performance e confianca.  
**Personalidade:** foco, metodo, alto rendimento, curadoria pedagogica e controle de progresso.

## Assinatura Visual

A marca aparece em dois formatos principais:

- **Sidebar:** simbolo em forma de "R" estilizado com gradiente ciano-azul e texto `REMB Estudos`.
- **Login:** bloco navy com simbolo branco e check verde, reforcando acesso, validacao e progresso.

Arquivos relacionados:

- `logo-remb-estudos.svg`
- `logo-app-icon.svg`

## Tipografia

A plataforma usa duas familias do Google Fonts:

- **Outfit:** titulos, logotipo, botoes, navegacao e metricas.
- **Inter:** corpo de texto, formularios, descricoes e leitura prolongada.

Diretriz:

- Use Outfit para dar peso institucional e ritmo de produto.
- Use Inter para clareza em questoes, explicacoes, filtros e textos operacionais.

## Paleta Principal

### Cores-base

| Papel | Cor | Uso |
|---|---:|---|
| Navy institucional | `#0f172a` | sidebar, logo box, textos fortes |
| Azul principal | `#2563eb` | acao primaria, destaque, links, estado ativo |
| Azul hover | `#1d4ed8` | hover de botoes primarios |
| Fundo claro | `#f1f5f9` | plano principal da aplicacao |
| Card | `#ffffff` | superficies e paineis |
| Texto principal | `#0f172a` | titulos e conteudo forte |
| Texto secundario | `#475569` | descricoes e metadados |
| Borda | `#cbd5e1` | divisores e inputs |

### Cores semanticas

| Papel | Cor | Uso |
|---|---:|---|
| Correto / sucesso | `#10b981` | acertos, status positivo |
| Incorreto / erro | `#ef4444` | erros, exclusao, respostas erradas |
| Alerta | `#f59e0b` | favoritos, avisos, marcacoes |
| Ciano de marca | `#06b6d4` | gradiente do simbolo |

### Subtema Planner

O planner possui linguagem mais escura e energetica:

| Papel | Cor |
|---|---:|
| Fundo planner | `#09090b` |
| Card translucido | `rgba(20, 20, 25, 0.6)` |
| Primaria planner | `#6366f1` |
| Secundaria planner | `#a855f7` |
| Estudo | `#8b5cf6` |
| Trabalho | `#3b82f6` |
| Academia | `#10b981` |
| Descanso | `#f59e0b` |

Arquivo relacionado:

- `paleta-visual.svg`

## Forma e UI

Padroes observados:

- Cards brancos com borda clara e sombra baixa.
- Sidebar escura, compacta e funcional.
- Botoes primarios azuis com raio de 8px.
- Inputs com borda de 1.5px e foco azul.
- Badges arredondados para status, favoritos e contadores.
- Iconografia linear em SVG, com traco simples.
- Cards maiores chegam a 12px-16px de raio; controles menores usam 6px-8px.

Arquivo relacionado:

- `componentes-chave.svg`

## Tema Claro

O tema claro e o padrao principal da plataforma. Ele deve priorizar:

- fundo `#f1f5f9`;
- cards `#ffffff`;
- titulos em `#0f172a`;
- acoes em `#2563eb`;
- bordas discretas em `#cbd5e1`.

## Tema Escuro

O tema escuro existe na aplicacao principal e usa:

- fundo `#090d16`;
- sidebar `#05080e`;
- cards `#131926`;
- texto principal `#f8fafc`;
- azul ativo `#3b82f6`.

## Regras de Uso

1. Mantenha o azul como cor de acao, nao como preenchimento dominante de toda a tela.
2. Use navy para autoridade e estrutura, principalmente sidebar e cabecalhos.
3. Preserve bastante branco/cinza claro na area de estudo para leitura confortavel.
4. Reserve verde, vermelho e amarelo para feedback semantico.
5. Use o subtema roxo/indigo apenas no planner ou em modulos de rotina/ciclo.
6. Evite misturar o visual escuro do planner com telas de questoes, a menos que seja uma area realmente separada.
7. Para novas telas, comece com: sidebar navy, conteudo claro, cards brancos, botoes azuis e tipografia Outfit/Inter.

## Regras de Frontend e SEO

Novas paginas devem respeitar a identidade visual e tambem nascer com estrutura tecnica limpa:

1. Use arquivos separados para HTML, CSS e JavaScript.
2. Evite estilos inline e eventos inline em novas telas.
3. Use um unico `h1` por pagina indexavel.
4. Inclua `title`, `description`, `canonical`, Open Graph e dados estruturados quando a pagina for publica.
5. Mantenha o conteudo principal visivel no HTML inicial quando a pagina tiver objetivo de busca organica.
6. Carregue dados grandes e bibliotecas externas apenas quando forem necessarios.
7. Preserve acessibilidade: labels, contraste, foco por teclado e nomes acessiveis em botoes de icone.

## Assets Criados

Esta pasta contem:

- `manual-identidade-visual.md`: este manual.
- `logo-remb-estudos.svg`: assinatura horizontal principal.
- `logo-app-icon.svg`: icone quadrado inspirado no login.
- `paleta-visual.svg`: mapa visual de cores.
- `componentes-chave.svg`: referencia visual de componentes recorrentes.
