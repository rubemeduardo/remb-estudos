# Financeiro, Receitas e Custos - Primeiro Modulo

Este registro resume a primeira entrega funcional da frente Financeiro do REMB Estudos.

## Decisao de produto

A aba Financeiro deve começar como controle interno de entradas e saidas do projeto. A prioridade inicial e dar visibilidade executiva sobre receitas, custos e fluxo de caixa antes da publicacao: assinaturas de usuarios, dominio, hospedagem, ferramentas, APIs, servicos e reservas.

Essa escolha reduz risco porque troca numeros demonstrativos por uma estrutura simples, auditavel e preparada para dados reais, sem criar uma area financeira grande antes de existir volume operacional suficiente.

## Receitas

Receitas devem ser controladas separadamente dos custos. A fonte principal esperada e assinatura de usuarios, mas o modelo tambem aceita outras receitas futuras, como publicidade, parcerias, venda avulsa, licenciamento ou outra fonte comercial.

Para assinaturas, o tratamento correto passa a separar tres situacoes:

- Receita contratada/prevista: valor assumido no contrato da assinatura e distribuido no periodo de competencia.
- Cobranca gerada/a receber: valor que o assinante deve pagar em um ciclo especifico.
- Entrada de caixa: valor que so entra no financeiro quando o pagamento for confirmado.

Exemplo: uma assinatura anual de R$ 1.200 pode gerar receita prevista de R$ 100 por mes durante 12 meses. A cobranca pode ser anual ou mensal, conforme o plano. O caixa so reconhece entrada quando houver confirmacao de pagamento.

Campos previstos para receitas:

- Nome da receita.
- Categoria.
- Fonte.
- Usuario ou cliente relacionado.
- Plano.
- Produto.
- Valor recebido.
- Valor previsto.
- Valor recorrente.
- Status.
- Datas de recebimento, competencia, vencimento e proximo recebimento.
- Forma de recebimento.
- Observacoes executivas.

## Banco de dados

Foi considerada necessaria uma estrutura persistida no PostgreSQL, porque controles financeiros nao devem ficar no navegador nem misturados ao progresso do aluno.

Foram previstas tabelas para:

- Custos do projeto.
- Categorias de custo.
- Fornecedores.
- Receitas do projeto.
- Planos de assinatura.
- Assinaturas.
- Receita prevista por competencia.
- Cobrancas.
- Recebimentos.
- Movimentos de caixa.

As tabelas principais ja guardam os campos minimos para futura consolidacao no sistema REMB geral, incluindo origem do sistema, modulo, tipo de registro, categoria, fonte ou fornecedor, valores, datas, status, centro de custo, responsavel e link de documento.

## Primeira versao funcional

A primeira versao na aba Financeiro permite:

- Visualizar fluxo de caixa consolidado.
- Cadastrar assinatura e gerar receita prevista por competencia.
- Gerar cobranca inicial da assinatura.
- Confirmar pagamento de cobranca, criando entrada de caixa.
- Cadastrar receita prevista ou recebida.
- Informar fonte, plano, cliente/usuario, status, periodicidade, valores e datas.
- Cadastrar custo previsto ou realizado.
- Informar categoria, fornecedor, status, periodicidade, valores e vencimentos.
- Registrar responsavel, centro de custo, link de documento e observacoes executivas.
- Listar receitas e custos cadastrados.
- Filtrar receitas e custos por status e categoria.
- Editar ou excluir registros.
- Ver totais calculados a partir dos registros reais.

## Proximos passos recomendados

1. Separar uma pagina propria chamada Custos do Projeto quando houver mais volume.
2. Criar pagina propria de Receitas quando houver assinaturas reais integradas.
3. Criar cadastro completo de planos, categorias, fornecedores e fontes de receita.
4. Adicionar exportacao CSV/JSON.
5. Adicionar alertas por vencimento, inadimplencia e renovacao.
6. Criar permissao administrativa especifica para visualizar e alterar dados financeiros.
7. Integrar assinaturas com gateway de pagamento.
8. Preparar endpoint de sincronizacao com o sistema REMB de consolidacao geral.
