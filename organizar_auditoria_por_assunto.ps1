$ErrorActionPreference = "Stop"

$base = Join-Path $PSScriptRoot "Materiais_Callado"
$source = Join-Path $base "Complementares_CALLADO\Auditoria"
$extraSource = Join-Path $base "Gmail_Auditoria_Complementos\Auditoria_Governamental"
$destRoot = Join-Path $base "Auditoria_Topicos"

if (-not (Test-Path -LiteralPath $source)) {
    throw "Pasta de origem nao encontrada: $source"
}

New-Item -ItemType Directory -Force -Path $destRoot | Out-Null

$topics = @(
    [pscustomobject]@{
        Assunto = "NBC TA 200 - Objetivos, conducao e conformidade"
        Pasta = "NBC_TA_200_Objetivos_Conducao_Conformidade"
        Pattern = "NBC[_ ]?TA[_ ]?200|NBCTA200|RESUMO_NBC_TA_200"
    },
    [pscustomobject]@{
        Assunto = "NBC TA 500 - Evidencia de Auditoria"
        Pasta = "NBC_TA_500_Evidencia_de_Auditoria"
        Pattern = "NBC[_ ]?TA[_ ]?500|NBCTA500|EVIDENCIA"
    },
    [pscustomobject]@{
        Assunto = "NBC TA 530 - Amostragem em Auditoria"
        Pasta = "NBC_TA_530_Amostragem_em_Auditoria"
        Pattern = "NBC[_ ]?TA[_ ]?530|NBCTA530|AMOSTRAGEM"
    },
    [pscustomobject]@{
        Assunto = "NBC TA 230 (R1) - Documentacao de Auditoria"
        Pasta = "NBC_TA_230_R1_Documentacao_de_Auditoria"
        Pattern = "NBC[_ ]?TA[_ ]?230|NBCTA230|DOCUMENTACAO"
    },
    [pscustomobject]@{
        Assunto = "Relatorio de Auditoria"
        Pasta = "Relatorio_de_Auditoria"
        Pattern = "RELATORIO[_ ]DE[_ ]AUDITORIA|NBCTA700|NBC[_ ]?TA[_ ]?700|NBCTA705|NBC[_ ]?TA[_ ]?705|NBCTA706|NBC[_ ]?TA[_ ]?706|ANOTACOES_NORMAS"
    },
    [pscustomobject]@{
        Assunto = "NBC TI 01 - Auditoria Interna"
        Pasta = "NBC_TI_01_Auditoria_Interna"
        Pattern = "NBC[_ ]?TI[_ ]?01|AUDITORIA_INTERNA"
    },
    [pscustomobject]@{
        Assunto = "COSO"
        Pasta = "COSO"
        Pattern = "COSO"
    },
    [pscustomobject]@{
        Assunto = "Instrumentos de Fiscalizacao"
        Pasta = "Instrumentos_de_Fiscalizacao"
        Pattern = "INSTRUMENTOS.*FISCALIZACAO"
    },
    [pscustomobject]@{
        Assunto = "Auditoria Governamental"
        Pasta = "Auditoria_Governamental"
        Pattern = "AUDITORIA_GOVERNAMENTAL|AUDITORIA GOVERNAMENTAL|TCU_NAT|Manual_auditoria_operacional"
    }
)

$searchRoots = @($source)
if (Test-Path -LiteralPath $extraSource) {
    $searchRoots += $extraSource
}

$files = $searchRoots | ForEach-Object { Get-ChildItem -LiteralPath $_ -Recurse -File } |
    Where-Object { $_.Extension -match '^\.(pdf|doc|docx|txt|xlsx)$' }

$summary = New-Object System.Collections.Generic.List[object]
$details = New-Object System.Collections.Generic.List[object]

foreach ($topic in $topics) {
    $topicDir = Join-Path $destRoot $topic.Pasta
    New-Item -ItemType Directory -Force -Path $topicDir | Out-Null

    $matches = $files | Where-Object { $_.Name -match $topic.Pattern } | Sort-Object Name
    $seenHashes = @{}
    $copied = 0

    foreach ($file in $matches) {
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
        if ($seenHashes.ContainsKey($hash)) {
            continue
        }
        $seenHashes[$hash] = $true

        $target = Join-Path $topicDir $file.Name
        if (-not (Test-Path -LiteralPath $target)) {
            Copy-Item -LiteralPath $file.FullName -Destination $target
        }
        $copied++

        $details.Add([pscustomobject]@{
            assunto = $topic.Assunto
            arquivo = $target
            origem = $file.FullName
        })
    }

    $summary.Add([pscustomobject]@{
        assunto = $topic.Assunto
        status = if ($copied -gt 0) { "Localizado" } else { "Nao localizado" }
        quantidade_arquivos = $copied
        pasta = $topicDir
    })
}

$summaryPath = Join-Path $base "auditoria_mapa_assuntos.csv"
$detailsPath = Join-Path $base "auditoria_arquivos_por_assunto.csv"

$summary | Export-Csv -LiteralPath $summaryPath -NoTypeInformation -Encoding UTF8
$details | Export-Csv -LiteralPath $detailsPath -NoTypeInformation -Encoding UTF8

Write-Host "Mapa criado: $summaryPath"
Write-Host "Arquivos por assunto: $detailsPath"
Write-Host "Pasta tematica: $destRoot"
