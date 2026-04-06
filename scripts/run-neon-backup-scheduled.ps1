<#
.SYNOPSIS
  Ejecuta backup-neon-local.ps1 con rutas fijas al repo (para Programador de tareas).

.DESCRIPTION
  Usá este archivo como acción del programador: no depende del directorio actual.
  Lee la cadena desde api\.env del repo Nexxo (DATABASE_URL, DB_CONNECTION o NEON_CONNECTION_STRING).

.PARAMETER Keep
  Igual que backup-neon-local.ps1 (cuántos .dump conservar).

.PARAMETER PgDumpPath
  Opcional; si no pasás, backup-neon-local detecta pg_dump 18/17/16…

.EXAMPLE
  # Probar a mano:
  .\scripts\run-neon-backup-scheduled.ps1

.EXAMPLE
  # Programador de tareas → Acción → Programa: powershell.exe
  # Argumentos: -NoProfile -ExecutionPolicy Bypass -File "C:\Users\leave\AndroidStudioProjects\Nexxo\scripts\run-neon-backup-scheduled.ps1"
#>
[CmdletBinding()]
param(
    [int]$Keep = 12,
    [string]$PgDumpPath = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot "api\.env"
$backupScript = Join-Path $PSScriptRoot "backup-neon-local.ps1"

if (-not (Test-Path -LiteralPath $envFile)) {
    throw "No existe api\.env en el repo: $envFile"
}
if (-not (Test-Path -LiteralPath $backupScript)) {
    throw "No se encontró backup-neon-local.ps1: $backupScript"
}

$logDir = Join-Path $env:USERPROFILE "Backups\GestorNova-Neon"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "neon-backup-scheduler.log"
$line = "===== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ====="
Add-Content -LiteralPath $logFile -Value $line

try {
    if ($PgDumpPath) {
        & $backupScript -EnvFile $envFile -Keep $Keep -PgDumpPath $PgDumpPath
    } else {
        & $backupScript -EnvFile $envFile -Keep $Keep
    }
    Add-Content -LiteralPath $logFile -Value "OK $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
} catch {
    Add-Content -LiteralPath $logFile -Value ("ERROR: " + ($_.Exception.Message))
    throw
}
