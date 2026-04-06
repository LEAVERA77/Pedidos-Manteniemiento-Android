<#
.SYNOPSIS
  Respaldo lógico local de Neon (PostgreSQL) con pg_dump — sin subir secretos al repo.

.DESCRIPTION
  Genera un archivo .dump (formato custom, comprimido) en tu usuario de Windows.
  Intervalo prudente sugerido: **1 vez por semana** (DB chica/mediana) o **diario** si
  tenés mucho tráfico; Neon además ofrece historial PITR según el plan.

.PARAMETER ConnectionString
  URI postgresql://... (si no pasás nada, usa $env:DATABASE_URL o $env:NEON_CONNECTION_STRING).

.PARAMETER EnvFile
  Ruta a un .env que contenga DATABASE_URL= o DB_CONNECTION= (primera coincidencia).

.PARAMETER OutDir
  Carpeta de salida (por defecto: %USERPROFILE%\Backups\GestorNova-Neon).

.PARAMETER Keep
  Cuántos respaldos .dump conservar (los más viejos se borran tras un backup OK).

.PARAMETER PgDumpPath
  Ruta completa a pg_dump.exe si no está en el PATH.

.EXAMPLE
  $env:DATABASE_URL = "postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"
  .\scripts\backup-neon-local.ps1

.EXAMPLE
  .\scripts\backup-neon-local.ps1 -EnvFile "C:\secrets\pedidos-api.env" -Keep 12

.EXAMPLE
  .\scripts\backup-neon-local.ps1 -EnvFile ".\api\.env" -Keep 12 -PgDumpPath "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"

.NOTAS
  - Neon suele usar PostgreSQL 17 u otro mayor. pg_dump debe ser de versión >= servidor;
    si solo tenés el 16 instalado verás "no coincide la versión del servidor". Instalá 17 u 18
    (conviven en C:\Program Files\PostgreSQL\17 y \18) y usá ese binario o dejá que el script
    lo detecte (prueba 18, 17, 16…).
  - winget: winget install PostgreSQL.PostgreSQL.18 (o .17). Solo "Command line tools" si lo ofrece el instalador.
  - Si el dump falla por timeout, en Neon probá la URI **sin** -pooler (host directo).
  - No commitees la connection string ni la carpeta de backups con datos reales.
#>
[CmdletBinding()]
param(
    [string]$ConnectionString = "",
    [string]$EnvFile = "",
    [string]$OutDir = "",
    [int]$Keep = 8,
    [string]$PgDumpPath = ""
)

$ErrorActionPreference = "Stop"

function Read-ConnectionStringFromEnvFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "No existe el archivo: $Path"
    }
    $raw = Get-Content -LiteralPath $Path -Raw
    foreach ($line in ($raw -split "`r?`n")) {
        $t = $line.Trim()
        if ($t -match '^\s*#' -or $t -eq "") { continue }
        if ($t -match '^(?:DATABASE_URL|DB_CONNECTION|NEON_CONNECTION_STRING)\s*=\s*(.+)$') {
            $v = $Matches[1].Trim().Trim('"').Trim("'")
            if ($v) { return $v }
        }
    }
    throw "No se encontró DATABASE_URL, DB_CONNECTION ni NEON_CONNECTION_STRING en: $Path"
}

if (-not $OutDir) {
    $OutDir = Join-Path $env:USERPROFILE "Backups\GestorNova-Neon"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$conn = $ConnectionString
if (-not $conn) { $conn = $env:DATABASE_URL }
if (-not $conn) { $conn = $env:NEON_CONNECTION_STRING }
if (-not $conn -and $EnvFile) {
    $conn = Read-ConnectionStringFromEnvFile -Path $EnvFile
}
if (-not $conn) {
    throw @"
Falta cadena de conexión. Opciones:
  1) `$env:DATABASE_URL = 'postgresql://...'
  2) `$env:NEON_CONNECTION_STRING = 'postgresql://...'
  3) .\backup-neon-local.ps1 -EnvFile 'R:\api\.env'
"@
}

if ($conn -notmatch "^postgres(ql)?://") {
    throw "La URI debe empezar con postgresql:// o postgres://"
}

$pgDump = $PgDumpPath
if (-not $pgDump) {
    $cmd = Get-Command pg_dump -ErrorAction SilentlyContinue
    if ($cmd) { $pgDump = $cmd.Source }
}
if (-not $pgDump -or -not (Test-Path -LiteralPath $pgDump)) {
    # Orden: mayor primero (Neon a menudo es PG 17+; pg_dump viejo no puede dumpear servidor nuevo).
    $candidates = @(
        "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\14\bin\pg_dump.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path -LiteralPath $c) { $pgDump = $c; break }
    }
}
if (-not $pgDump -or -not (Test-Path -LiteralPath $pgDump)) {
    throw @"
No se encontró pg_dump. Instalá cliente >= versión del servidor Neon (p. ej. 17 u 18):
  winget install PostgreSQL.PostgreSQL.18
Luego cerrá y abrí la terminal, o pasá explícitamente:
  -PgDumpPath 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe'
"@
}

$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$outFile = Join-Path $OutDir "neon-backup_$stamp.dump"

Write-Host "pg_dump: $pgDump"
Write-Host "Salida:  $outFile"

$pgDumpArgs = @(
    "--dbname=$conn",
    "-Fc",
    "-f", $outFile,
    "--no-owner",
    "--no-acl"
)

$p = Start-Process -FilePath $pgDump -ArgumentList $pgDumpArgs -Wait -PassThru -NoNewWindow
if ($p.ExitCode -ne 0) {
    if (Test-Path -LiteralPath $outFile) { Remove-Item -LiteralPath $outFile -Force -ErrorAction SilentlyContinue }
    throw "pg_dump terminó con código $($p.ExitCode)"
}

$len = (Get-Item -LiteralPath $outFile).Length
$mb = [math]::Round($len / 1MB, 2)
Write-Host ('OK - tamano ' + [string]$mb + ' MB')

$files = Get-ChildItem -LiteralPath $OutDir -Filter "neon-backup_*.dump" -File | Sort-Object LastWriteTime -Descending
if ($files.Count -gt $Keep) {
    $files | Select-Object -Skip $Keep | ForEach-Object {
        Write-Host ('Eliminando respaldo viejo: ' + $_.Name)
        Remove-Item -LiteralPath $_.FullName -Force
    }
}

Write-Host ('Listo. Carpeta de respaldos: ' + $OutDir)
