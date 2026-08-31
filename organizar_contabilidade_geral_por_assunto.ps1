$ErrorActionPreference = "Stop"

$base = Join-Path $PSScriptRoot "Materiais_Callado"
$destRoot = Join-Path $base "Contabilidade_Geral_Topicos_Atualizado"
$sourceRoot = Join-Path $env:USERPROFILE "OneDrive\CONCURSO\CALLADO\CONTABILIDADE GERAL"

$candidateRoots = @(
    (Join-Path $base "Contabilidade_Geral"),
    (Join-Path $base "Complementares_CALLADO\Contabilidade_Geral"),
    (Join-Path $base "Gmail_Contabilidade_Geral_Complementos"),
    $sourceRoot
) | Where-Object { Test-Path -LiteralPath $_ }

$topics = @(
    [pscustomobject]@{ Ordem = 1; Assunto = "Estrutura Conceitual"; Pasta = "Estrutura_Conceitual"; Tipo = "Teoria e Exercicios"; Padrao = "ESTRUTURA[_ ]CONCEITUAL|NBC[_ ]?TG[_ ]?00|NBCTG00|CPC[_ ]?00" },
    [pscustomobject]@{ Ordem = 2; Assunto = "CPC 01 - Reducao ao Valor Recuperavel de Ativos"; Pasta = "CPC_01_Reducao_Valor_Recuperavel"; Tipo = "Teoria"; Padrao = "CPC[_ ]?01|NBC[_ ]?TG[_ ]?01|NBCTG01|REDUCAO.*VALOR.*RECUPERAVEL|RECUPERAVEL" },
    [pscustomobject]@{ Ordem = 3; Assunto = "CPC 03 - DFC"; Pasta = "CPC_03_DFC"; Tipo = "Lista e Pacote"; Padrao = "CPC[_ ]?03|DFC|DEMONSTRACAO.*FLUXO.*CAIXA|FLUXO.*CAIXA|Aula[_ ]20-04-2024[_ ]DFC" },
    [pscustomobject]@{ Ordem = 4; Assunto = "CPC 12 - Ajuste a Valor Presente"; Pasta = "CPC_12_Ajuste_Valor_Presente"; Tipo = "Teoria"; Padrao = "CPC[_ ]?12|AJUSTE[_ ]?VALOR[_ ]?PRESENTE|VALOR_PRESENTE" },
    [pscustomobject]@{ Ordem = 5; Assunto = "CPC 16 - Estoques"; Pasta = "CPC_16_Estoques"; Tipo = "Teoria"; Padrao = "CPC[_ ]?16|ESTOQUES" },
    [pscustomobject]@{ Ordem = 6; Assunto = "CPC 25 - Provisoes, Passivos contingentes e ativos contingentes"; Pasta = "CPC_25_Provisoes_Contingentes"; Tipo = "Teoria"; Padrao = "CPC[_ ]?25|PROVISAO|PROVISOES|PASSIVOS.*CONTINGENTES|ATIVOS.*CONTINGENTES" },
    [pscustomobject]@{ Ordem = 7; Assunto = "CPC 26"; Pasta = "CPC_26"; Tipo = "A localizar"; Padrao = "CPC[_ ]?26|APRESENTACAO.*DEMONSTRACOES|DEMONSTRACOES.*CONTABEIS" },
    [pscustomobject]@{ Ordem = 8; Assunto = "Ativo Imobilizado"; Pasta = "Ativo_Imobilizado"; Tipo = "Teoria e Comentarios"; Padrao = "ATIVO[_ ]?IMOBILIZADO|NBC[_ ]?TG[_ ]?27|NBCTG27" },
    [pscustomobject]@{ Ordem = 9; Assunto = "Lucro nao realizado"; Pasta = "Lucro_nao_realizado"; Tipo = "A localizar"; Padrao = "LUCRO.*REALIZADO" },
    [pscustomobject]@{ Ordem = 10; Assunto = "CPC 18"; Pasta = "CPC_18"; Tipo = "A localizar"; Padrao = "CPC[_ ]?18|COLIGADA|CONTROLADA|EQUIVALENCIA" },
    [pscustomobject]@{ Ordem = 11; Assunto = "CPC 36"; Pasta = "CPC_36"; Tipo = "Video/Aula"; Padrao = "CPC[_ ]?36|DEMONSTRACOES[_ ]?CONSOLIDADAS|CONSOLIDADAS" },
    [pscustomobject]@{ Ordem = 12; Assunto = "Contabilidade de Custos"; Pasta = "Contabilidade_de_Custos"; Tipo = "Teoria e Pacote"; Padrao = "CONTABILIDADE[_ ]DE[_ ]CUSTOS|Aula[_ ]CUSTOS|CUSTOS" }
)

$allowedExtensions = @(".pdf", ".doc", ".docx", ".xlsx", ".xls", ".csv", ".txt", ".zip", ".mp4")
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

    $matches = $allFiles | Where-Object {
        $relativeContext = $_.FullName
        $relativeContext -match $topic.Padrao
    } | Sort-Object FullName

    $seenHashes = @{}
    $copied = 0

    foreach ($file in $matches) {
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

$mapPath = Join-Path $base "contabilidade_geral_mapa_assuntos.csv"
$filesPath = Join-Path $base "contabilidade_geral_arquivos_por_assunto.csv"

$mapRows | Export-Csv -LiteralPath $mapPath -NoTypeInformation -Encoding UTF8
$fileRows | Export-Csv -LiteralPath $filesPath -NoTypeInformation -Encoding UTF8

"Organizacao concluida."
"Pasta: $destRoot"
"Mapa: $mapPath"
"Arquivos: $filesPath"
$mapRows | Sort-Object Ordem | Format-Table Ordem, Assunto, ArquivosLocalizados, Status -AutoSize
