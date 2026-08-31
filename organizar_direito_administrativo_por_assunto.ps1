$ErrorActionPreference = "Stop"

$base = Join-Path $PSScriptRoot "Materiais_Callado"
$destRoot = Join-Path $base "Direito_Administrativo_Topicos_Atualizado"
$sourceBase = Join-Path $env:USERPROFILE "OneDrive\CONCURSO\CALLADO"

$candidateRoots = @(
    (Join-Path $base "Direito_Administrativo"),
    (Join-Path $base "Complementares_CALLADO\Direito_Administrativo"),
    (Join-Path $base "Gmail_Direito_Administrativo_Complementos"),
    (Join-Path $sourceBase "DIREITO ADMINISTRATIVO"),
    (Join-Path $sourceBase "CONTROLE ADMINISTRATIVO"),
    (Get-ChildItem -LiteralPath (Join-Path $sourceBase "MODULOS") -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "LEI 14133" } | Select-Object -ExpandProperty FullName),
    (Join-Path $sourceBase "LISTAS DE EXERCÍCIOS"),
    $sourceBase
) | Where-Object { Test-Path -LiteralPath $_ }

$topics = @(
    [pscustomobject]@{ Ordem = 1; Assunto = "Classificacao"; Pasta = "Atos_Admin_Classificacao"; Tipo = "Teoria e Exercicios"; Padrao = "CLASSIFICACAO|CLASSIFIC" },
    [pscustomobject]@{ Ordem = 2; Assunto = "Especies"; Pasta = "Atos_Admin_Especies"; Tipo = "Teoria e Exercicios"; Padrao = "ESPECIE|ESPECIES" },
    [pscustomobject]@{ Ordem = 3; Assunto = "Elementos"; Pasta = "Atos_Admin_Elementos"; Tipo = "Teoria e Exercicios"; Padrao = "ELEMENTOS|REQUISITOS" },
    [pscustomobject]@{ Ordem = 4; Assunto = "Anulacao Revogacao Convalidacao"; Pasta = "Anulacao_Revogacao_Convalidacao"; Tipo = "Teoria, Resumo e Exercicios"; Padrao = "ANULACAO|REVOGACAO|CONVALIDACAO|EXTINCAO|SUMULA.*346|SUMULA.*473|L9784|LEI[_ ]9784" },
    [pscustomobject]@{ Ordem = 5; Assunto = "Lei 8.429 - Improbidade Administrativa"; Pasta = "Lei_8429_Improbidade"; Tipo = "Teoria e Prazos"; Padrao = "8429|8\.429|IMPROBIDADE|LIA" },
    [pscustomobject]@{ Ordem = 6; Assunto = "Lei 8.987/95 - Concessoes e Permissoes"; Pasta = "Lei_8987_Concessoes_Permissoes"; Tipo = "Teoria"; Padrao = "8987|8\.987|CONCESS|PERMISS|SERVICOS_PUBLICOS" },
    [pscustomobject]@{ Ordem = 7; Assunto = "Lei 11.079/04 - PPP"; Pasta = "Lei_11079_PPP"; Tipo = "Teoria"; Padrao = "11079|11\.079|PPP|PARCERIA.*PUBLICO.*PRIVADA" },
    [pscustomobject]@{ Ordem = 8; Assunto = "Doutrina MSZP HLM JSCF"; Pasta = "Doutrina_MSZP_HLM_JSCF"; Tipo = "Doutrina"; Padrao = "MSZP|HLM|JSCF|CABM|DOUTRINA" },
    [pscustomobject]@{ Ordem = 9; Assunto = "Lei 9.637/98"; Pasta = "Lei_9637_OS"; Tipo = "Teoria"; Padrao = "9637|9\.637|ORGANIZACOES_SOCIAIS|ORGANIZACOES.*SOCIAIS" },
    [pscustomobject]@{ Ordem = 10; Assunto = "Lei 9.790/99"; Pasta = "Lei_9790_OSCIP"; Tipo = "Teoria"; Padrao = "9790|9\.790|OSCIP" },
    [pscustomobject]@{ Ordem = 11; Assunto = "Lei 13.019/14"; Pasta = "Lei_13019_Parcerias"; Tipo = "Teoria"; Padrao = "13019|13\.019|MARCO.*REGULATORIO|PARCERIAS" },
    [pscustomobject]@{ Ordem = 12; Assunto = "Lei 14.133"; Pasta = "Lei_14133_Licitacoes"; Tipo = "Teoria, Audio e Video"; Padrao = "14133|14\.133|LICITAC|AULA.*LEI.*14133|LEI[_ ]14133" }
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
    return $builder.ToString().Normalize([Text.NormalizationForm]::FormC)
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

$mapPath = Join-Path $base "direito_administrativo_mapa_assuntos.csv"
$filesPath = Join-Path $base "direito_administrativo_arquivos_por_assunto.csv"

$mapRows | Export-Csv -LiteralPath $mapPath -NoTypeInformation -Encoding UTF8
$fileRows | Export-Csv -LiteralPath $filesPath -NoTypeInformation -Encoding UTF8

"Organizacao concluida."
"Pasta: $destRoot"
"Mapa: $mapPath"
"Arquivos: $filesPath"
$mapRows | Sort-Object Ordem | Format-Table Ordem, Assunto, ArquivosLocalizados, Status -AutoSize
