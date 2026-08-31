$ErrorActionPreference = "Stop"

$base = Join-Path $PSScriptRoot "Materiais_Callado"
$destRoot = Join-Path $base "AFO_Topicos_Final_Conferido"
$sourceBase = Join-Path $env:USERPROFILE "OneDrive\CONCURSO\CALLADO"

$candidateRoots = @(
    (Join-Path $base "Administracao_Financeira_Orcamentaria"),
    (Join-Path $base "Complementares_CALLADO\Administracao_Financeira_Orcamentaria"),
    (Join-Path $base "Complementares_CALLADO\LRF"),
    (Join-Path $base "Complementares_CALLADO\Contabilidade_Publica"),
    (Join-Path $base "Gmail_AFO_Complementos"),
    (Join-Path $sourceBase "AFO"),
    (Join-Path $sourceBase "LRF"),
    (Join-Path $sourceBase "CONTABILIDADE PUBLICA")
) | Where-Object { Test-Path -LiteralPath $_ }

$topics = @(
    [pscustomobject]@{ Ordem = 1; Assunto = "Principios"; Pasta = "Principios_Orcamentarios"; Tipo = "Teoria e Exercicios"; Padrao = "PRINCIP|LEI[_ ]4320[_ ]1964[_ ]1PARTE|LEI[_ ]4320[_ ]1964[_ ]3PARTE|MTO[_ ]2025" },
    [pscustomobject]@{ Ordem = 2; Assunto = "LRF"; Pasta = "LRF"; Tipo = "Teoria, Legislacao e Exercicios"; Padrao = "LRF|RESPONSABILIDADE[_ ]FISCAL|LEI[_ ]DE[_ ]RESPONSABILIDADE[_ ]FISCAL|ART[_ .]*1[_ ]PARAG|ART[_ .]*163|ART[_ .]*169|RENUNCIA[_ ]DE[_ ]RECEITA" },
    [pscustomobject]@{ Ordem = 3; Assunto = "Despesas de Exercicios Anteriores"; Pasta = "Despesas_Exercicios_Anteriores"; Tipo = "Teoria"; Padrao = "DESPESAS?[_ ]DE[_ ]EXERCICIOS[_ ]ANTERIORES|EXERCICIOS[_ ]ANTERIORES|DEA" },
    [pscustomobject]@{ Ordem = 4; Assunto = "Suprimentos de Fundos"; Pasta = "Suprimentos_de_Fundos"; Tipo = "Teoria"; Padrao = "SUPRIMENTO[_ ]FUNDOS|SUPRIMENTOS[_ ]DE[_ ]FUNDOS|SUPRIMENTO" },
    [pscustomobject]@{ Ordem = 5; Assunto = "LDO"; Pasta = "LDO"; Tipo = "Teoria e Exercicios"; Padrao = "LDO|LEI[_ ]DE[_ ]DIRETRIZES[_ ]ORCAMENTARIAS|DIRETRIZES[_ ]ORCAMENTARIAS|LEI[_ ]4320[_ ]1964[_ ]3PARTE|MTO[_ ]2025" },
    [pscustomobject]@{ Ordem = 6; Assunto = "LOA"; Pasta = "LOA"; Tipo = "Teoria e Exercicios"; Padrao = "LOA|LEI[_ ]ORCAMENTARIA[_ ]ANUAL|ORCAMENTARIA[_ ]ANUAL|LEI[_ ]4320[_ ]1964[_ ]1PARTE|LEI[_ ]4320[_ ]1964[_ ]3PARTE|LEI[_ ]4320[_ ]1964[_ ]4PARTE|MTO[_ ]2025" },
    [pscustomobject]@{ Ordem = 7; Assunto = "PPA"; Pasta = "PPA"; Tipo = "Teoria e Exercicios"; Padrao = "PPA|PLANO[_ ]PLURIANUAL|PLURIANUAL|LEI[_ ]4320[_ ]1964[_ ]3PARTE|MTO[_ ]2025" },
    [pscustomobject]@{ Ordem = 8; Assunto = "Receita Publica"; Pasta = "Receita_Publica"; Tipo = "Teoria"; Padrao = "RECEITA[_ ]PUBLICA|RECEITA|RENUNCIA[_ ]DE[_ ]RECEITA" },
    [pscustomobject]@{ Ordem = 9; Assunto = "Restos a Pagar"; Pasta = "Restos_a_Pagar"; Tipo = "Teoria e Exercicios"; Padrao = "RESTOS[_ ]A[_ ]PAGAR|RESTOS|LEI[_ ]4320[_ ]1964[_ ]3PARTE|LEI[_ ]4320[_ ]1964[_ ]4PARTE" },
    [pscustomobject]@{ Ordem = 10; Assunto = "Etapas da Despesa Publica"; Pasta = "Etapas_da_Despesa_Publica"; Tipo = "Teoria e Exercicios"; Padrao = "ETAPAS[_ ]DA[_ ]DESPESA|ESTAGIOS[_ ]DA[_ ]DESPESA|ESTAGIOS|EMPENHO|LIQUIDACAO|PAGAMENTO|DESPESA[_ ]PUBLICA[_ ]TEORIA|DESPESA[_ ]PUBLICA[_ ]MTO[_ ]2025" },
    [pscustomobject]@{ Ordem = 11; Assunto = "Despesas"; Pasta = "Despesas"; Tipo = "Teoria e Exercicios"; Padrao = "DESPESA|DESPESAS|PROCEDIMENTOS[_ ]CONTABEIS[_ ]ORCAMENTARIOS|DESPESA[_ ]PUBLICA[_ ]CLASSIFICACAO|DESPESA[_ ]PUBLICA[_ ]TEORIA|DESPESA[_ ]PUBLICA[_ ]MTO[_ ]2025" },
    [pscustomobject]@{ Ordem = 12; Assunto = "Divida Ativa"; Pasta = "Divida_Ativa"; Tipo = "Teoria e Exercicios"; Padrao = "DIVIDA[_ ]ATIVA|DÍVIDA[_ ]ATIVA|RECEITA[_ ]PUBLICA|LEI[_ ]4320[_ ]1964[_ ]1PARTE" }
)

function Remove-Diacritics {
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return $Text }
    $normalized = $Text.Normalize([Text.NormalizationForm]::FormD)
    $builder = New-Object System.Text.StringBuilder
    foreach ($char in $normalized.ToCharArray()) {
        if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($char) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$builder.Append($char)
        }
    }
    return $builder.ToString().Normalize([Text.NormalizationForm]::FormC).ToUpperInvariant()
}

$allowedExtensions = @(".pdf", ".doc", ".docx", ".xlsx", ".xls", ".csv", ".txt", ".zip", ".mp4", ".m4a", ".mp3")
$allFiles = foreach ($root in $candidateRoots) {
    Get-ChildItem -LiteralPath $root -Recurse -File |
        Where-Object { $allowedExtensions -contains $_.Extension.ToLowerInvariant() }
}

New-Item -ItemType Directory -Path $destRoot -Force | Out-Null

$mapRows = New-Object System.Collections.Generic.List[object]
$fileRows = New-Object System.Collections.Generic.List[object]

foreach ($topic in $topics) {
    $topicDir = Join-Path $destRoot $topic.Pasta
    New-Item -ItemType Directory -Path $topicDir -Force | Out-Null

    $matches = $allFiles | Where-Object { (Remove-Diacritics $_.FullName) -match $topic.Padrao } | Sort-Object FullName
    $seenHashes = @{}
    $copied = 0

    foreach ($file in $matches) {
        if (-not (Test-Path -LiteralPath $file.FullName)) {
            continue
        }

        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
        if ($seenHashes.ContainsKey($hash)) {
            continue
        }
        $seenHashes[$hash] = $true

        $safeName = $file.Name -replace '[<>:"/\\|?*]', '_'
        $ext = [System.IO.Path]::GetExtension($safeName)
        $stem = [System.IO.Path]::GetFileNameWithoutExtension($safeName)
        if ($stem.Length -gt 80) {
            $stem = $stem.Substring(0, 80)
            $safeName = "{0}_{1}{2}" -f $stem, $hash.Substring(0, 8), $ext
        }

        $dest = Join-Path $topicDir $safeName
        if (Test-Path -LiteralPath $dest) {
            $dest = Join-Path $topicDir ("{0}_{1}{2}" -f $stem, $hash.Substring(0, 8), $ext)
        }

        Copy-Item -LiteralPath $file.FullName -Destination $dest -Force
        $copied++

        $fileRows.Add([pscustomobject]@{
            Ordem = $topic.Ordem
            Assunto = $topic.Assunto
            TipoSugerido = $topic.Tipo
            Arquivo = (Split-Path -Leaf $dest)
            PastaDestino = $topicDir
            Origem = $file.FullName
            Hash = $hash
        })
    }

    $mapRows.Add([pscustomobject]@{
        Ordem = $topic.Ordem
        Assunto = $topic.Assunto
        Pasta = $topicDir
        ArquivosLocalizados = $copied
        Status = if ($copied -gt 0) { "Localizado" } else { "Nao localizado" }
        Observacao = if ($copied -gt 0) { "" } else { "Nao encontrei arquivo com esse tema nas pastas locais nem na copia complementar." }
    })
}

$mapPath = Join-Path $base "afo_mapa_assuntos.csv"
$filesPath = Join-Path $base "afo_arquivos_por_assunto.csv"

$mapRows | Export-Csv -LiteralPath $mapPath -NoTypeInformation -Encoding UTF8
$fileRows | Export-Csv -LiteralPath $filesPath -NoTypeInformation -Encoding UTF8

"Organizacao concluida."
"Pasta: $destRoot"
"Mapa: $mapPath"
"Arquivos: $filesPath"
$mapRows | Sort-Object Ordem | Format-Table Ordem, Assunto, ArquivosLocalizados, Status -AutoSize
