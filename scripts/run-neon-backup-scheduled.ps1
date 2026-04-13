<#
.SYNOPSIS
  Ejecuta backup-neon-local.ps1 y copia el backup a Google Drive.
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
    
    # Buscar el último backup generado
    $backupDir = Join-Path $env:USERPROFILE "Backups\GestorNova-Neon"
    $latestBackup = Get-ChildItem $backupDir -Filter "*.dump" | Sort-Object CreationTime -Descending | Select-Object -First 1
    
    if ($latestBackup) {
        $generatedBackupFile = $latestBackup.FullName
        Add-Content -LiteralPath $logFile -Value "Backup generado: $generatedBackupFile"
        
        # COPIAR A GOOGLE DRIVE
        $drivePath = "G:\Mi unidad\Programas\Backups Neon"
        
        if (!(Test-Path $drivePath)) {
            New-Item -ItemType Directory -Path $drivePath -Force | Out-Null
            Add-Content -LiteralPath $logFile -Value "Creada carpeta en Google Drive: $drivePath"
        }
        
        $fileName = [System.IO.Path]::GetFileName($generatedBackupFile)
        $destination = Join-Path $drivePath $fileName
        
        Copy-Item -Path $generatedBackupFile -Destination $destination -Force
        
        if (Test-Path $destination) {
            Add-Content -LiteralPath $logFile -Value "✅ Backup copiado a Google Drive: $destination"
            Write-Host "✅ Backup copiado a Google Drive: $destination" -ForegroundColor Green
        } else {
            Add-Content -LiteralPath $logFile -Value "❌ ERROR: No se pudo copiar a Google Drive"
            Write-Host "❌ ERROR: No se pudo copiar a Google Drive" -ForegroundColor Red
        }
        
        # Limpiar backups antiguos en Google Drive
        $driveBackups = Get-ChildItem $drivePath -Filter "*.dump" | Sort-Object CreationTime -Descending
        if ($driveBackups.Count -gt $Keep) {
            $driveBackups | Select-Object -Skip $Keep | Remove-Item -Force
            Add-Content -LiteralPath $logFile -Value "🧹 Limpiados backups antiguos en Google Drive"
        }
    } else {
        Add-Content -LiteralPath $logFile -Value "⚠️ No se encontró ningún backup generado"
    }
    
    Add-Content -LiteralPath $logFile -Value "OK $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    Write-Host "🎉 Backup completado exitosamente!" -ForegroundColor Green
    
} catch {
    $errorMsg = "ERROR: " + $_.Exception.Message
    Add-Content -LiteralPath $logFile -Value $errorMsg
    Write-Host $errorMsg -ForegroundColor Red
    throw
}