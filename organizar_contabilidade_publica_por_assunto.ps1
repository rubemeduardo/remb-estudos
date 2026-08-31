$ErrorActionPreference = "Stop"

$base = Join-Path $PSScriptRoot "Materiais_Callado"
$destRoot = Join-Path $base "Contabilidade_Publica_Topicos"

$roots = @(
    (Join-Path $base "Contabilidade_Publica"),
    (Join-Path $base "Complementares_CALLADO\Contabilidade_Publica"),
    (Join-Path $base "Complementares_CALLADO\Administracao_Financeira_Orcamentaria"),
    (Join-Path $base "Gmail_Contabilidade_Publica_Complementos"),
    (Join-Path $base "Complementares_CALLADO\LRF"),
    (Join-Path $base "Complementares_CALLADO\Outros")
) | Where-Object { Test-Path -LiteralPath $_ }

New-Item -ItemType Directory -Force -Path $destRoot | Out-Null

$topics = @(
    [pscustomobject]@{ Assunto = "Estrutura Conceitual"; Pasta = "Estrutura_Conceitual"; Pattern = "ESTRUTURA[_ ]CONCEITUAL|NBC[_ ]TSP[_ ]00" },
    [pscustomobject]@{ Assunto = "Variacoes Patrimoniais"; Pasta = "Variacoes_Patrimoniais"; Pattern = "VARIACAO[_ ]PATRIMONIAL|VARIACOES[_ ]PATRIMONIAIS|DEMONSTRACAO[_ ]VARIACAO[_ ]PATRIMONIAL|DVP" },
    [pscustomobject]@{ Assunto = "Parte 1"; Pasta = "Parte_1"; Pattern = "1parte|1_parte|_1_|PARTE[_ ]I|PARTE_1" },
    [pscustomobject]@{ Assunto = "Parte 2"; Pasta = "Parte_2"; Pattern = "2parte|2_parte|_2_|PARTE[_ ]II|PARTE_2" },
    [pscustomobject]@{ Assunto = "Balanco Orcamentario"; Pasta = "Balanco_Orcamentario"; Pattern = "BALANCO[_ ]ORCAMENTARIO|BALANCO_ORC|ORCAMENTARIO" },
    [pscustomobject]@{ Assunto = "Balanco Financeiro"; Pasta = "Balanco_Financeiro"; Pattern = "BALANCO[_ ]FINANCEIRO" },
    [pscustomobject]@{ Assunto = "Balanco Patrimonial"; Pasta = "Balanco_Patrimonial"; Pattern = "BALANCO[_ ]PATRIMONIAL" },
    [pscustomobject]@{ Assunto = "DFC"; Pasta = "DFC"; Pattern = "DEMONSTRACAO[_ ]FLUXO[_ ]CAIXA|FLUXO[_ ]CAIXA|\bDFC\b" },
    [pscustomobject]@{ Assunto = "DVP"; Pasta = "DVP"; Pattern = "DVP|DEMONSTRACAO[_ ]VARIACAO[_ ]PATRIMONIAL|VARIACAO[_ ]PATRIMONIAL" },
    [pscustomobject]@{ Assunto = "DMPL"; Pasta = "DMPL"; Pattern = "DEMONSTRACAO[_ ]MUTACOES[_ ]PATRIMONIO[_ ]LIQUIDO|MUTACOES[_ ]PATRIMONIO[_ ]LIQUIDO|\bDMPL\b" },
    [pscustomobject]@{ Assunto = "Notas Explicativas"; Pasta = "Notas_Explicativas"; Pattern = "NOTAS[_ ]EXPLICATIVAS" },
    [pscustomobject]@{ Assunto = "Consolidacao"; Pasta = "Consolidacao"; Pattern = "CONSOLIDADA|CONSOLIDACAO|CONSOLIDADO" },
    [pscustomobject]@{ Assunto = "Portaria 42"; Pasta = "Portaria_42"; Pattern = "PORTARIA[_ ]42|MCASP[_ -]PORTARIA[_ ]42|MOG[_ ]42" },
    [pscustomobject]@{ Assunto = "Portaria 163"; Pasta = "Portaria_163"; Pattern = "PORTARIA[_ ]163|MCASP[_ -]PORTARIA[_ ]163" },
    [pscustomobject]@{ Assunto = "Plano de Contas Aplicado ao Setor Publico"; Pasta = "PCASP"; Pattern = "PCASP|PLANO[_ ]DE[_ ]CONTAS" },
    [pscustomobject]@{ Assunto = "Ativo Intangivel"; Pasta = "Ativo_Intangivel"; Pattern = "ATIVO[_ ]INTANGIVEL|NBC[_ ]TSP[_ ]08" },
    [pscustomobject]@{ Assunto = "Ativo Imobilizado"; Pasta = "Ativo_Imobilizado"; Pattern = "ATIVO[_ ]IMOBILIZADO|NBC[_ ]TSP[_ ]07|NBCTSP07" },
    [pscustomobject]@{ Assunto = "Custos no Setor Publico - NBC TSP 34"; Pasta = "Custos_NBC_TSP_34"; Pattern = "CUSTOS.*SETOR.*PUBLICO|NBC[_ ]TSP[_ ]34|TSP[_ ]34|TESTE_COMPLETO_DIVERSOS_ASSUNTOS_1_27dezembro2024" },
    [pscustomobject]@{ Assunto = "Receita Publica"; Pasta = "Receita_Publica"; Pattern = "RECEITA[_ ]PUBLICA|RECEITA_PUBLICA" },
    [pscustomobject]@{ Assunto = "Lei 4.320/64"; Pasta = "Lei_4320"; Pattern = "LEI[_ ]?4?\.?320|LEI[_ ]4320" }
)

$files = $roots |
    ForEach-Object { Get-ChildItem -LiteralPath $_ -Recurse -File } |
    Where-Object { $_.Extension -match '^\.(pdf|doc|docx|txt|xlsx|zip)$' }

$summary = New-Object System.Collections.Generic.List[object]
$details = New-Object System.Collections.Generic.List[object]

foreach ($topic in $topics) {
    $topicDir = Join-Path $destRoot $topic.Pasta
    New-Item -ItemType Directory -Force -Path $topicDir | Out-Null

    $matches = $files | Where-Object { $_.Name -match $topic.Pattern } | Sort-Object Name
    $seenHashes = @{}
    $count = 0

    foreach ($file in $matches) {
        if (-not (Test-Path -LiteralPath $file.FullName)) {
            continue
        }

        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
        if ($seenHashes.ContainsKey($hash)) {
            continue
        }
        $seenHashes[$hash] = $true

        $target = Join-Path $topicDir $file.Name
        if (-not (Test-Path -LiteralPath $target)) {
            Copy-Item -LiteralPath $file.FullName -Destination $target
        }
        $count++

        $details.Add([pscustomobject]@{
            assunto = $topic.Assunto
            arquivo = $target
            origem = $file.FullName
        })
    }

    $summary.Add([pscustomobject]@{
        assunto = $topic.Assunto
        status = if ($count -gt 0) { "Localizado" } else { "Nao localizado" }
        quantidade_arquivos = $count
        pasta = $topicDir
    })
}

$summary | Export-Csv -LiteralPath (Join-Path $base "contabilidade_publica_mapa_assuntos.csv") -NoTypeInformation -Encoding UTF8
$details | Export-Csv -LiteralPath (Join-Path $base "contabilidade_publica_arquivos_por_assunto.csv") -NoTypeInformation -Encoding UTF8

Write-Host "Pasta tematica: $destRoot"
