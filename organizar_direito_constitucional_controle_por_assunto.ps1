$ErrorActionPreference = "Stop"

$base = Join-Path $PSScriptRoot "Materiais_Callado"
$destRoot = Join-Path $base "Direito_Constitucional_Controle_Topicos_Final_Conferido"
$sourceBase = Join-Path $env:USERPROFILE "OneDrive\CONCURSO\CALLADO"

$candidateRoots = @(
    (Join-Path $base "Complementares_CALLADO\Direito_Constitucional"),
    (Join-Path $base "Complementares_CALLADO\LRF"),
    (Join-Path $base "Complementares_CALLADO\Direito_Administrativo"),
    (Join-Path $base "Complementares_CALLADO\Outros_Materiais"),
    (Join-Path $base "Direito_Administrativo_Topicos_Atualizado"),
    (Join-Path $base "AFO_Topicos_Final_Conferido"),
    (Join-Path $base "Gmail_Direito_Constitucional_Controle_Complementos"),
    (Join-Path $sourceBase "DIREITO CONSTITUCIONAL"),
    (Join-Path $sourceBase "LRF"),
    (Join-Path $sourceBase "CONTROLE ADMINISTRATIVO"),
    (Join-Path $sourceBase "DIREITO ADMINISTRATIVO"),
    (Join-Path $sourceBase "LISTAS DE EXERCÍCIOS")
) | Where-Object { Test-Path -LiteralPath $_ }

$topics = @(
    [pscustomobject]@{ Ordem = 1; Grupo = "Direito Constitucional"; Assunto = "Art. 70 a 75"; Pasta = "Direito_Constitucional\Art_70_a_75"; Tipo = "Teoria"; Padrao = "ART[._ -]*70[._ -]*(A|AO|-)[._ -]*75|ARTS?[._ -]*70[._ -]*(A|AO|-)[._ -]*75|ART[._ -]*71[._ -]*REGIMENTO|ART[._ -]*44[._ -]*(A|AO|-)[._ -]*75" },
    [pscustomobject]@{ Ordem = 2; Grupo = "Direito Constitucional"; Assunto = "Emendas Parlamentares"; Pasta = "Direito_Constitucional\Emendas_Parlamentares"; Tipo = "Teoria e Comentarios"; Padrao = "EMENDA[._ -]*PARLAMENTAR|EMENDAS[._ -]*PARLAMENTARES" },
    [pscustomobject]@{ Ordem = 3; Grupo = "Direito Constitucional"; Assunto = "Art. 163 a 169"; Pasta = "Direito_Constitucional\Art_163_a_169"; Tipo = "Teoria e Texto Legal"; Padrao = "ART[._ -]*163[._ -]*(A|AO|-)[._ -]*169|163[._ -]*(A|AO|-)[._ -]*169[._ -]*CF|ART[._ -]*163|ART[._ -]*169" },
    [pscustomobject]@{ Ordem = 4; Grupo = "Direito Constitucional"; Assunto = "Precatorios - art. 100"; Pasta = "Direito_Constitucional\Precatorios_Art_100"; Tipo = "Teoria"; Padrao = "PRECATORIO|PRECATORIOS|PRECAT[OÓ]RIO|PRECAT[OÓ]RIOS|ART[._ -]*100" },
    [pscustomobject]@{ Ordem = 5; Grupo = "Direito Constitucional"; Assunto = "Processo Legislativo"; Pasta = "Direito_Constitucional\Processo_Legislativo"; Tipo = "Teoria e Exercicios"; Padrao = "PROCESSO[._ -]*LEGISLATIVO|ARTS?[._ -]*59[._ -]*(A|AO|-)[._ -]*69" },
    [pscustomobject]@{ Ordem = 6; Grupo = "Controle Administrativo"; Assunto = "Controle da Administracao"; Pasta = "Controle_Administrativo\Controle_da_Administracao"; Tipo = "Teoria e Exercicios"; Padrao = "CONTROLE[._ -]*DA[._ -]*ADMINISTRACAO|CONTROLE[._ -]*DA[._ -]*ADMINISTRA[CÇ][AÃ]O|CONT[._ -]*DA[._ -]*ADM|CONTROL\.TXT" },
    [pscustomobject]@{ Ordem = 7; Grupo = "Controle Administrativo"; Assunto = "Controle Legislativo"; Pasta = "Controle_Administrativo\Controle_Legislativo"; Tipo = "Teoria, Exercicios e Comentarios"; Padrao = "CONTROLE[._ -]*LEGISLATIVO|CONTROE[._ -]*LEGISLATIVO|FUNCOES[._ -]*TCU|FUN[CÇ][OÕ]ES[._ -]*TCU|ART[._ -]*44[._ -]*(A|AO|-)[._ -]*75" },
    [pscustomobject]@{ Ordem = 8; Grupo = "Controle Administrativo"; Assunto = "Aspectos Gerais"; Pasta = "Controle_Administrativo\Aspectos_Gerais"; Tipo = "Teoria"; Padrao = "CONTROLE[._ -]*DA[._ -]*ADMINISTRACAO[._ -]*COMPLETO|CONTROLE[._ -]*DA[._ -]*ADMINISTRA[CÇ][AÃ]O[._ -]*COMPLETO|CONTROLE[._ -]*ADMINISTRATIVO|CONTROL\.TXT" },
    [pscustomobject]@{ Ordem = 9; Grupo = "Controle Administrativo"; Assunto = "1a Parte"; Pasta = "Controle_Administrativo\1a_Parte"; Tipo = "Teoria e Exercicios"; Padrao = "1PARTE|1[._ -]*PARTE|ALUNO[._ -]*1|1[._ -]*22SET2024|1[._ -]*09NOVEMBRO2023|COMPLETO[._ -]*ALUNO[._ -]*1" },
    [pscustomobject]@{ Ordem = 10; Grupo = "Controle Administrativo"; Assunto = "2a Parte"; Pasta = "Controle_Administrativo\2a_Parte"; Tipo = "Teoria e Exercicios"; Padrao = "2PARTE|2[._ -]*PARTE|ALUNO[._ -]*2|30SET24|2[._ -]*11NOVEMBRO2023" },
    [pscustomobject]@{ Ordem = 11; Grupo = "Administracao Publica"; Assunto = "Aspectos Historicos"; Pasta = "Administracao_Publica\Aspectos_Historicos"; Tipo = "Teoria e Exercicios"; Padrao = "ADMINISTRACAO[._ -]*PUBLICA.*1|ADMINISTRA[CÇ][AÃ]O[._ -]*P[UÚ]BLICA.*1|ASPECTOS[._ -]*HISTORICOS|HISTORICOS|PDRAE|PATRIMONIALISMO|BUROCRATICA|GERENCIAL" },
    [pscustomobject]@{ Ordem = 12; Grupo = "Administracao Publica"; Assunto = "Governanca no Setor Publico"; Pasta = "Administracao_Publica\Governanca_no_Setor_Publico"; Tipo = "Teoria, Exercicios e Materiais de Apoio"; Padrao = "GOVERNANCA|GOVERNAN[CÇ]A|GOVERNABILIDADE|ACCOUNTABILITY|TRANSPARENCIA|TRANSPAR[ÊE]NCIA|INDICADORES[._ -]*DE[._ -]*GOVERNANCA|ADMINISTRACAO[._ -]*PUBLICA.*2|ADMINISTRA[CÇ][AÃ]O[._ -]*P[UÚ]BLICA.*2" }
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

function Get-ReceivedDate {
    param([string]$Path)
    $name = Split-Path -Leaf $Path
    if ($name -match "^(20\d{2}-\d{2}-\d{2})__") { return $Matches[1] }
    if ($name -match "(\d{1,2})(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(20\d{2})") {
        $months = @{
            "janeiro" = "01"; "fevereiro" = "02"; "marco" = "03"; "março" = "03"; "abril" = "04"; "maio" = "05"; "junho" = "06";
            "julho" = "07"; "agosto" = "08"; "setembro" = "09"; "outubro" = "10"; "novembro" = "11"; "dezembro" = "12"
        }
        return "{0}-{1}-{2:00}" -f $Matches[3], $months[$Matches[2]], [int]$Matches[1]
    }
    return ""
}

function Get-Kind {
    param([string]$Path)
    $normal = (Remove-Diacritics $Path).ToUpperInvariant()
    if ($normal -match "LISTA|EXERCICIO|EXERCICIOS|QUESTOES|ALUNO_[0-9]|COMENTARIO|COMENTARIOS|GABARITO") { return "Lista de exercicios/comentarios" }
    if ($normal -match "TEORIA|LIVRO|PROF|REGIMENTO|CF|CONSTITUICAO|PDRAE") { return "Teoria/material de apoio" }
    return "Material"
}

$allowedExtensions = @(".pdf", ".doc", ".docx", ".txt")
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

    $matches = $allFiles | Where-Object { (Remove-Diacritics $_.FullName).ToUpperInvariant() -match $topic.Padrao } | Sort-Object FullName
    $seenHashes = @{}
    $copied = 0

    foreach ($file in $matches) {
        if (-not (Test-Path -LiteralPath $file.FullName)) { continue }
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
        if ($seenHashes.ContainsKey($hash)) { continue }
        $seenHashes[$hash] = $true

        $datePrefix = Get-ReceivedDate $file.FullName
        $safeName = $file.Name -replace '[<>:"/\\|?*]', '_'
        if ($datePrefix -and $safeName -notmatch "^20\d{2}-\d{2}-\d{2}__") {
            $safeName = "$datePrefix`__$safeName"
        }
        $ext = [System.IO.Path]::GetExtension($safeName)
        $stem = [System.IO.Path]::GetFileNameWithoutExtension($safeName)
        if ($stem.Length -gt 110) {
            $stem = $stem.Substring(0, 110)
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
            Grupo = $topic.Grupo
            Assunto = $topic.Assunto
            TipoSugerido = $topic.Tipo
            Classificacao = Get-Kind $file.FullName
            DataIdentificada = $datePrefix
            Arquivo = (Split-Path -Leaf $dest)
            PastaDestino = $topicDir
            Origem = $file.FullName
            Hash = $hash
        })
    }

    $mapRows.Add([pscustomobject]@{
        Ordem = $topic.Ordem
        Grupo = $topic.Grupo
        Assunto = $topic.Assunto
        Pasta = $topicDir
        ArquivosLocalizados = $copied
        Status = if ($copied -gt 0) { "Localizado" } else { "Nao localizado" }
        Observacao = if ($copied -gt 0) { "" } else { "Nao encontrei arquivo com esse tema nas pastas locais, na pasta CALLADO ou nos complementos baixados do Gmail." }
    })
}

$mapPath = Join-Path $base "direito_constitucional_controle_mapa_assuntos.csv"
$filesPath = Join-Path $base "direito_constitucional_controle_arquivos_por_assunto.csv"

$mapRows | Export-Csv -LiteralPath $mapPath -NoTypeInformation -Encoding UTF8
$fileRows | Export-Csv -LiteralPath $filesPath -NoTypeInformation -Encoding UTF8

"Organizacao concluida."
"Pasta: $destRoot"
"Mapa: $mapPath"
"Arquivos: $filesPath"
$mapRows | Sort-Object Ordem | Format-Table Ordem, Grupo, Assunto, ArquivosLocalizados, Status -AutoSize
