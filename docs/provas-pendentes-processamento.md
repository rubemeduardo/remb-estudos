# Provas Pendentes de Processamento

Este documento registra a situacao dos cards da Biblioteca de Provas.

## Regra

- Nao abrir questoes genericas da banca quando a prova exata nao foi processada.
- Nao presumir gabarito.
- O card pode apontar para um PDF direto ou para a pagina oficial da banca que contenha prova e gabarito.
- Quando o gabarito estiver no mesmo documento/pagina da prova, os dois links podem apontar para a mesma origem.
- Para usuario comum, exibir apenas cards com prova e gabarito vinculados.
- Para administrador, exibir todos os cards, com marca de arquivos baixados, documentos vinculados ou arquivos pendentes.
- Para administrador, permitir filtro por questoes processadas, arquivos baixados, documentos vinculados, origem/documento parcial e arquivos pendentes.
- O status "Questoes processadas" indica que ja existem questoes importadas para resolucao daquela prova ou lista; ele nao substitui o status de documentos/arquivos.
- "Documentos vinculados" indica apenas que existe prova/gabarito/pagina oficial como referencia; isso nao significa que as questoes daquela prova ja estejam estruturadas no banco.
- O status "Card cadastrado" indica que o concurso foi criado no sistema, mas ainda precisa de origem, prova, gabarito e/ou arquivo estruturado.
- A classificacao "Suspensa" e uma situacao de publicacao: oculta a prova para usuarios comuns, mas nao impede o administrador de seguir o tratamento no Pipeline.
- Na Biblioteca de Provas, o card do administrador pode aparecer em qualquer status e deve oferecer apenas o envio ao Pipeline.
- O tratamento do Pipeline deve ocorrer na aba Admin.
- Novos cards de concurso devem ser criados pela aba Admin > Pipeline e iniciar suspensos ate liberacao administrativa.
- Para vincular documentos no Pipeline, o administrador deve abrir o card administrativo, preencher o formulario de vinculos com origem, prova, gabarito e, opcionalmente, JSON estruturado de questoes, e salvar tudo em uma unica acao.
- O botao "Dar continuidade ao pipeline" deve mostrar andamento no proprio quadro do card, indicando salvamento, consulta da origem oficial, tentativa de localizar documentos, download local quando houver PDF direto, verificacao de JSON estruturado, processamento ou pendencia.
- A aba Admin > Pipeline permite selecionar varios cards e acionar "Dar continuidade aos selecionados"; cada card avanca automaticamente ate o primeiro ponto que exija complemento administrativo.
- No Admin, o comando "Processar questoes" aparece apenas quando houver fonte processavel de questoes, como JSON estruturado vinculado ao manifesto.
- O comando de processamento no Admin tenta importar automaticamente esse JSON estruturado ja vinculado/localizado para aquele card.
- Quando houver pagina oficial de origem, o sistema pode tentar localizar automaticamente links de prova, gabarito, edital e recurso dentro da pagina.
- Quando houver link direto para PDF, o sistema pode baixar o arquivo para `dados/provas/` e substituir o vinculo remoto pelo caminho local.
- Quando prova/gabarito ja estiverem vinculados, o administrador pode acionar "Estruturar questoes para revisao"; o sistema tenta extrair texto do PDF da prova ou usa texto colado pelo administrador para gerar um JSON revisavel.
- O JSON gerado a partir do PDF fica com gabarito em branco e status `gerado_para_revisao`; ele nao deve ser integrado automaticamente ao banco antes de revisao no Laboratorio.
- A fase `revisao_laboratorio` indica que as questoes estruturadas precisam ser revisadas no Laboratorio antes de ficarem disponiveis para usuarios.
- Se o card tiver apenas pagina oficial/PDF sem JSON estruturado, o sistema deve orientar o administrador a enviar ou vincular o JSON de questoes pelo Laboratorio; o sistema nao deve extrair/inferir gabarito automaticamente a partir do PDF.
- Fases do pipeline no card:
  - `card_criado`: card do concurso cadastrado, ainda sem todos os vinculos/documentos necessarios.
  - `arquivos_pendentes`: ainda faltam origem, prova e gabarito.
  - `documentos_parciais`: existe origem ou documento parcial, mas faltam documentos obrigatorios.
  - `documentos_vinculados`: prova/gabarito ou pagina oficial estao vinculados como referencia.
  - `arquivos_baixados`: prova/gabarito estao em arquivos locais do sistema.
  - `revisao_laboratorio`: questoes foram estruturadas a partir do PDF/texto e aguardam revisao administrativa.
  - `pronto_processamento`: existe JSON estruturado de questoes vinculado ao card.
  - `questoes_processadas`: existem questoes importadas para a prova/lista.
  - `gabaritos_pendentes`: existem questoes, mas falta gabarito explicito em pelo menos uma delas.
  - `completo`: existem questoes e gabaritos explicitos aplicados.
- Quando o pipeline fica bloqueado, a aba Admin deve exibir o bloqueio e registrar notificacao administrativa para tratamento.
- A Curação Lab e exclusiva do administrador.
- Se houver documento de gabarito vinculado no card, ele e uma fonte valida para o gabarito; a curadoria continua podendo editar/corrigir depois.
- O Painel de Gabaritos e exclusivo do administrador e aparece no card apenas quando houver questoes processadas para a prova ou lista.
- O Painel de Gabaritos deve mostrar apenas numero, gabarito aplicado e origem administrativa.
- A origem do gabarito aplicado deve permanecer oculta para usuario comum.
- O importador administrativo aceita TXT/CSV com linhas como `1 - A`, `2 - CERTO`, e JSON simples como `{ "1": "A", "2": "ERRADO" }`.
- O mapa de gabarito nao deve ser cadastrado antes das questoes serem processadas.
- O administrador deve tratar o gabarito pela numeracao das questoes existentes, podendo importar um arquivo de gabarito ou editar pontualmente o gabarito aplicado.
- O mapa e cruzado pelo numero da questao e aplicado apenas quando houver correspondencia segura.

## Base criada

- Pasta de documentos: `dados/provas/`.
- Manifesto de vinculos: `dados/provas_manifest.json`.
- Vinculador local: `npm run provas:vincular`.
- Inventario: `npm run provas:pendentes`.

## Vinculos oficiais iniciais

- `fgv-rfb-2023`: pagina oficial FGV da Receita Federal.
- `fgv-sefazmg-2022`: pagina oficial FGV da SEFAZ-MG.
- `vunesp-tjsp-juiz-2025`: pagina oficial Vunesp do 191 concurso TJ-SP.

## Estado atual

- Total de cards: 49.
- Cards com prova e gabarito vinculados: 3.
- Cards com prova e gabarito baixados no sistema: 0.
- Cards com somente origem/documento parcial vinculado: 1.
- Cards ainda sem prova e gabarito vinculados: 46.

### Pendentes

- `cebraspe-tcu-2026`: Cebraspe, 2026, TCU, Auditor Federal de Controle Externo (TI).
- `cebraspe-tcepr-2026`: Cebraspe, 2026, TCE-PR, Auditor de Controle Externo.
- `cebraspe-bnb-2025`: Cebraspe, 2025, Banco do Nordeste (BNB), Analista Bancario.
- `cebraspe-caixa-2024`: Cebraspe, 2024, Caixa Economica Federal (T.I.), Engenheiro de Seguranca / Medico.
- `cebraspe-agu-2023`: Cebraspe, 2023, Advocacia-Geral da Uniao (AGU), Advogado da Uniao / Procurador.
- `cebraspe-inss-2022`: Cebraspe, 2022, INSS, Tecnico do Seguro Social.
- `cebraspe-pf-2021`: Cebraspe, 2021, Policia Federal (PF), Agente, Escrivao e Delegado.
- `cebraspe-prf-2021`: Cebraspe, 2021, Policia Rodoviaria Federal (PRF), Policial Rodoviario Federal.
- `cebraspe-tcdf-2020`: Cebraspe, 2020, TCDF (Tribunal de Contas), Auditor de Controle Externo.
- `cebraspe-pf-2018`: Cebraspe, 2018, Policia Federal (PF), Agente e Escrivao.
- `cebraspe-abin-2018`: Cebraspe, 2018, ABIN, Oficial de Inteligencia.
- `cebraspe-inss-2016`: Cebraspe, 2016, INSS, Tecnico e Analista.
- `fgv-dataprev-2026`: FGV, 2026, DATAPREV, Analista de Tecnologia da Informacao.
- `fgv-enam-2025`: FGV, 2025, Exame Nacional da Magistratura (ENAM), Juiz Substituto (Habilitacao).
- `fgv-tjms-2024`: FGV, 2024, Tribunal de Justica de MS (TJ-MS), Analista Judiciario.
- `fgv-cgu-2022`: FGV, 2022, Controladoria-Geral da Uniao (CGU), Auditor Federal de Financas.
- `fgv-senado-2022`: FGV, 2022, Senado Federal, Consultor, Analista e Policial.
- `fgv-tcu-2022`: FGV, 2022, Tribunal de Contas da Uniao (TCU), Auditor Federal de Controle Externo.
- `fgv-tjrj-2021`: FGV, 2021, Tribunal de Justica do RJ (TJRJ), Tecnico e Analista Judiciario.
- `fgv-mpsp-2018`: FGV, 2018, Ministerio Publico de SP (MPSP), Analista Cientifico.
- `fgv-compesa-2016`: FGV, 2016, COMPESA (Pernambuco), Engenheiro e Assistente.
- `cesgranrio-bndes-2025`: Cesgranrio, 2025, BNDES, Analista (Especialidades).
- `cesgranrio-cnu-2024`: Cesgranrio, 2024, Concurso Nacional Unificado (CNU), Blocos 1 a 8 (Varios Cargos).
- `cesgranrio-caixa-2024`: Cesgranrio, 2024, Caixa Economica Federal, Tecnico Bancario Novo.
- `cesgranrio-bb-2023`: Cesgranrio, 2023, Banco do Brasil (BB), Escriturario (Agente Comercial e T.I.).
- `cesgranrio-transpetro-2023`: Cesgranrio, 2023, Transpetro, Engenheiro, Tecnico e Marinha.
- `cesgranrio-petrobras-2022`: Cesgranrio, 2022, Petrobras, Tecnico de Operacoes / Manutencao.
- `cesgranrio-bb-2021`: Cesgranrio, 2021, Banco do Brasil (BB), Escriturario.
- `cesgranrio-liquigas-2018`: Cesgranrio, 2018, LIQUIGAS, Oficial de Producao e Assistente.
- `cesgranrio-anp-2016`: Cesgranrio, 2016, ANP (Agencia do Petroleo), Tecnico e Especialista.
- `fcc-trt15-2025`: FCC, 2025, TRT-15 (Campinas/SP), Tecnico e Analista Judiciario.
- `fcc-trt11-2024`: FCC, 2024, TRT-11 (AM/RR), Tecnico e Analista Judiciario.
- `fcc-tresp-2023`: FCC, 2023, TRE-SP, Tecnico e Analista Judiciario.
- `fcc-trt4-2022`: FCC, 2022, TRT-4 (RS) / TRT-5 / TRT-9, Tecnico e Analista Judiciario.
- `fcc-cldf-2018`: FCC, 2018, CLDF (Camara Legislativa DF), Consultor e Tecnico Legislativo.
- `fcc-sabesp-2018`: FCC, 2018, Sabesp, Tecnico, Engenheiro e Assistente.
- `fcc-tst-2017`: FCC, 2017, TST (Tribunal Superior), Tecnico e Analista Judiciario.
- `fcc-trt20-2016`: FCC, 2016, TRT-20 (SE) / TRT-11, Tecnico e Analista Judiciario.
- `vunesp-tjsp-juiz-2023`: Vunesp, 2023, Tribunal de Justica de SP (TJ-SP), Juiz Substituto (190 concurso).
- `vunesp-tjsp-juiz-2021`: Vunesp, 2021, Tribunal de Justica de SP (TJ-SP), Juiz Substituto (189 concurso).
- `vunesp-mpsp-promotor-2026`: Vunesp, 2026, Ministerio Publico de SP (MP-SP), Promotor de Justica Substituto (96 concurso).
- `vunesp-mpsp-promotor-2023`: Vunesp, 2023, Ministerio Publico de SP (MP-SP), Promotor de Justica Substituto (95 concurso).
- `vunesp-mpsc-promotor-2025`: Vunesp, 2025, Ministerio Publico de SC (MP-SC), Promotor de Justica Substituto (45 concurso).
- `vunesp-pcsp-delegado-2023`: Vunesp, 2023, Policia Civil de SP (PC-SP), Delegado de Policia.
- `vunesp-pcsp-delegado-2022`: Vunesp, 2022, Policia Civil de SP (PC-SP), Delegado de Policia.
- `vunesp-pcsp-delegado-2018`: Vunesp, 2018, Policia Civil de SP (PC-SP), Delegado de Policia.

## Como adicionar os demais

Coloque o arquivo em `dados/provas/` usando o id do card:

```text
cebraspe-tcu-2026-prova.pdf
cebraspe-tcu-2026-gabarito.pdf
```

Depois rode:

```bash
npm run provas:vincular
npm run provas:pendentes
```

Se houver apenas uma pagina oficial com prova e gabarito juntos, adicione a mesma URL nos campos `prova` e `gabarito` do manifesto.
