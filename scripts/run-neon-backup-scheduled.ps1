<#
.SYNOPSIS
  Ejecuta backup-neon-local.ps1 y copia el último .dump a una carpeta (p. ej. Google Drive for desktop).

.DESCRIPTION
  Pensado para el Programador de tareas de Windows. Ejecutá la tarea con el MISMO usuario
  con el que iniciás sesión en Windows (no «SYSTEM»): así existen %USERPROFILE%\Backups\…
  y la unidad de Google Drive (G:, etc.) si tenés «Drive for desktop» abierto.

  Programador de tareas — ejemplo:
    Programa:  powershell.exe
    Argumentos: -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Users\leave\AndroidStudioProjects\Nexxo\scripts\run-neon-backup-scheduled.ps1"
    (Opcional) Agregar: -DrivePath "G:\Mi unidad\Programas\Backups Neon" -Keep 12

  Variable de entorno opcional (usuario o sistema para la tarea):
    GESTORNOVA_NEON_BACKUP_DRIVE = ruta carpeta destino en Drive (sin barra final).

.NOTAS
  - backup-neon-local.ps1 genera archivos neon-backup_yyyy-MM-dd_HHmmss.dump
  - Antes se buscaba cualquier *.dump por CreationTime; ahora neon-backup_*.dump por LastWriteTime.
  - Si la copia a Drive falla, el backup local en %USERPROFILE%\Backups\GestorNova-Neon igual quedó hecho.
#>
[CmdletBinding()]
param(
    [int]$Keep = 12,
    [string]$PgDumpPath = "",
    # Carpeta destino en Google Drive (for desktop). Si vacío: env GESTORNOVA_NEON_BACKUP_DRIVE o rutas típicas.
    [string]$DrivePath = "",
    # Raíz del repo Nexxo (donde está api\.env). Si vacío: padre de la carpeta scripts.
    [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}
$envFile = Join-Path $RepoRoot "api\.env"
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
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Write-LogLine {
    param([string]$Message)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    [System.IO.File]::AppendAllText($logFile, $line + [Environment]::NewLine, $utf8)
}

Write-LogLine "===== inicio ===== user=$($env:USERNAME) profile=$($env:USERPROFILE)"

function Resolve-DriveBackupFolder {
    param([string]$Explicit)
    $candidates = @()
    if ($Explicit) { $candidates += $Explicit }
    if ($env:GESTORNOVA_NEON_BACKUP_DRIVE) { $candidates += $env:GESTORNOVA_NEON_BACKUP_DRIVE.Trim() }
    $candidates += @(
        "G:\Mi unidad\Programas\Backups Neon",
        "G:\My Drive\Programas\Backups Neon",
        "H:\Mi unidad\Programas\Backups Neon",
        "H:\My Drive\Programas\Backups Neon"
    )
    foreach ($p in $candidates) {
        if (-not $p) { continue }
        if ($p -match '^([A-Za-z]):\\') {
            $driveLetter = $Matches[1] + ":\"
            if (Test-Path -LiteralPath $driveLetter) {
                return $p
            }
        }
    }
    return $null
}

try {
    if ($PgDumpPath) {
        & $backupScript -EnvFile $envFile -Keep $Keep -PgDumpPath $PgDumpPath
    } else {
        & $backupScript -EnvFile $envFile -Keep $Keep
    }

    $backupDir = Join-Path $env:USERPROFILE "Backups\GestorNova-Neon"
    $latestBackup =
        Get-ChildItem -LiteralPath $backupDir -Filter "neon-backup_*.dump" -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $latestBackup) {
        Write-LogLine "WARN no se encontro neon-backup_*.dump en $backupDir"
        throw "No se encontró ningún backup neon-backup_*.dump en $backupDir"
    }

    $generatedBackupFile = $latestBackup.FullName
    Write-LogLine "backup generado: $generatedBackupFile ($($latestBackup.Length) bytes)"

    $driveFolder = Resolve-DriveBackupFolder -Explicit $DrivePath
    if (-not $driveFolder) {
        Write-LogLine "WARN no hay carpeta de Google Drive accesible (G:/H: Mi unidad/My Drive). Definí -DrivePath o GESTORNOVA_NEON_BACKUP_DRIVE. Backup local OK."
        Write-LogLine "===== fin (solo local) ====="
        exit 0
    }

    if (-not (Test-Path -LiteralPath $driveFolder)) {
        New-Item -ItemType Directory -Path $driveFolder -Force | Out-Null
        Write-LogLine "creada carpeta: $driveFolder"
    }

    $fileName = [System.IO.Path]::GetFileName($generatedBackupFile)
    $destination = Join-Path $driveFolder $fileName

    Copy-Item -LiteralPath $generatedBackupFile -Destination $destination -Force

    if (-not (Test-Path -LiteralPath $destination)) {
        Write-LogLine "ERROR Copy-Item no dejo archivo en $destination"
        throw "No se pudo copiar a Google Drive: $destination"
    }

    Write-LogLine "OK copiado a Drive: $destination"

    $driveBackups =
        Get-ChildItem -LiteralPath $driveFolder -Filter "neon-backup_*.dump" -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending
    if ($driveBackups.Count -gt $Keep) {
        $driveBackups | Select-Object -Skip $Keep | ForEach-Object {
            try {
                Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop
                Write-LogLine "eliminado viejo en Drive: $($_.Name)"
            } catch {
                Write-LogLine "WARN no se pudo eliminar $($_.FullName): $($_.Exception.Message)"
            }
        }
    }

    Write-LogLine "===== fin OK ====="
    exit 0
} catch {
    $errorMsg = "ERROR: $($_.Exception.Message)"
    Write-LogLine $errorMsg
    Write-LogLine "===== fin con error ====="
    exit 1
}
