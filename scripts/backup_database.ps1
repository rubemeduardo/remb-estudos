param(
  [string]$OutputDir = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Read-DotEnv {
  param([string]$Path)

  if (!(Test-Path -LiteralPath $Path)) {
    return
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (!$line -or $line.StartsWith("#") -or !$line.Contains("=")) {
      return
    }

    $parts = $line -split "=", 2
    $name = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"')

    if ($name -match "^[A-Z0-9_]+$" -and !(Test-Path "Env:$name")) {
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Read-DotEnv -Path (Join-Path $repoRoot ".env")

if (!$OutputDir) {
  $OutputDir = Join-Path $repoRoot "backups"
}

if (!$env:DATABASE_URL -and (!$env:DB_USER -or !$env:DB_HOST -or !$env:DB_NAME -or !$env:DB_PASS)) {
  throw "Banco de dados nao configurado. Defina DATABASE_URL ou DB_USER, DB_HOST, DB_NAME e DB_PASS."
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$databaseLabel = if ($env:DB_NAME) { $env:DB_NAME } else { "database" }
$safeDatabaseLabel = $databaseLabel -replace "[^A-Za-z0-9_.-]", "_"
$target = Join-Path $OutputDir "remb_${safeDatabaseLabel}_${timestamp}.dump"

if ($DryRun) {
  Write-Output "Backup seria salvo em: $target"
  exit 0
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

if (!(Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  throw "pg_dump nao foi encontrado no PATH. Instale as ferramentas cliente do PostgreSQL ou rode este script em ambiente que tenha pg_dump."
}

if ($env:DATABASE_URL) {
  & pg_dump $env:DATABASE_URL --format=custom --no-owner --no-acl --file=$target
} else {
  $env:PGPASSWORD = $env:DB_PASS
  $port = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
  & pg_dump -h $env:DB_HOST -p $port -U $env:DB_USER -d $env:DB_NAME --format=custom --no-owner --no-acl --file=$target
}

if ($LASTEXITCODE -ne 0) {
  throw "Falha ao gerar backup do banco."
}

Write-Output "Backup criado: $target"
