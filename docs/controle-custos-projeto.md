# Controle de Custos e Orcamento do Projeto

Este documento define o escopo inicial da area de controle de custos da plataforma REMB Estudos e sua futura integracao com o sistema REMB de consolidacao geral.

## Objetivo

Registrar todos os custos ja realizados e previstos do projeto, permitindo visao de gastos por categoria, fornecedor, vencimento, recorrencia, status de pagamento e impacto no orcamento.

## Local sugerido na plataforma

Inicialmente, a area pode ser incluida na aba **Financeiro** do painel administrativo, pois essa tela ja existe na plataforma.

Se o volume de controles crescer, a recomendacao e evoluir para uma pagina propria chamada **Custos do Projeto** ou **Orcamento do Projeto**, vinculada ao Financeiro.

## Dados que devem ser registrados

### Cadastro do gasto

- Identificador interno.
- Nome do gasto.
- Categoria.
- Descricao.
- Projeto ou produto relacionado.
- Centro de custo.
- Responsavel interno.
- Fornecedor.
- Local onde foi contratado ou tratado.
- Link de acesso, painel, contrato, fatura ou comprovante.
- Observacoes.

### Valores

- Valor pago.
- Valor previsto.
- Valor recorrente.
- Moeda.
- Forma de pagamento.
- Status: previsto, aprovado, contratado, pago, vencido, cancelado ou encerrado.
- Data de pagamento.
- Data de competencia.
- Data de vencimento.
- Proximo vencimento.
- Periodicidade: unica, mensal, anual ou outra.

### Dominio

Para dominio, registrar no minimo:

- Nome do dominio.
- Provedor ou registrador.
- Data de aquisicao.
- Valor pago na aquisicao.
- Data de vencimento/renovacao.
- Valor previsto de renovacao.
- Conta ou local onde foi tratado.
- Responsavel pelo acesso.
- Metodo de pagamento usado.
- Status de renovacao automatica.
- DNS utilizado.
- Observacoes sobre titularidade e acesso.

### Hospedagem

Para hospedagem, registrar:

- Provedor.
- Plano contratado.
- Ambiente: desenvolvimento, homologacao ou producao.
- Recursos contratados.
- Valor mensal/anual.
- Data de inicio.
- Data de vencimento.
- Forma de pagamento.
- Responsavel pelo acesso.
- Link do painel.
- Limites relevantes de uso.
- Politica de backup.
- Observacoes de escalabilidade.

### Outros custos sugeridos

- Banco de dados gerenciado.
- APIs de IA.
- E-mail transacional.
- Armazenamento de arquivos.
- CDN.
- Certificado SSL, se houver custo separado.
- Ferramentas de monitoramento e logs.
- Ferramentas de analytics.
- Ferramentas de design.
- Licencas de bibliotecas, templates ou assets.
- Servicos juridicos, contabeis ou administrativos.
- Desenvolvimento, manutencao e suporte.
- Compra de provas, materiais ou bases de conteudo.
- Reserva tecnica para contingencias.

## Relatorios desejados

- Total gasto no mes.
- Total gasto acumulado.
- Custos fixos mensais.
- Custos anuais previstos.
- Proximos vencimentos.
- Gastos por categoria.
- Gastos por fornecedor.
- Comparativo entre previsto e realizado.
- Alertas de vencimento.
- Itens sem comprovante.
- Itens sem responsavel definido.

## Campos para integracao futura com o sistema REMB

Cada registro financeiro deve nascer com dados suficientes para ser enviado futuramente ao sistema REMB de consolidacao:

- `origem_sistema`: REMB Estudos.
- `origem_modulo`: Financeiro ou Custos do Projeto.
- `origem_id`: identificador local do registro.
- `tipo_registro`: custo_realizado, custo_previsto, contrato, assinatura ou orcamento.
- `categoria`.
- `fornecedor`.
- `descricao`.
- `valor`.
- `moeda`.
- `data_competencia`.
- `data_vencimento`.
- `data_pagamento`.
- `periodicidade`.
- `status`.
- `centro_custo`.
- `responsavel`.
- `link_documento`.
- `created_at`.
- `updated_at`.

## Recomendacao de implementacao

1. Criar estrutura de dados no backend para custos, categorias, fornecedores e anexos/comprovantes.
2. Substituir os numeros ficticios atuais da aba Financeiro por dados reais.
3. Criar tela inicial com cards de resumo, tabela de custos e formulario de cadastro.
4. Adicionar filtros por status, categoria, fornecedor, periodo e vencimento.
5. Adicionar alertas de vencimento para dominio, hospedagem e assinaturas recorrentes.
6. Preparar exportacao em JSON/CSV e futura API de sincronizacao com o sistema REMB.
7. Definir permissao administrativa especifica para visualizar e alterar custos.

## Observacao inicial

A aba Financeiro atual deve ser tratada como espaco reservado. Antes de uso real, ela precisa deixar de exibir valores demonstrativos e passar a consumir registros persistidos no banco.
