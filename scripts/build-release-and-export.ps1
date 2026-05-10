<#
.SYNOPSIS
  Compila release SIN GESTORNOVA_RELEASE_COPY_DIR y luego copia la APK (evita AccessDenied en OneDrive durante packageRelease).

.DESCRIPTION
  Si `GESTORNOVA_RELEASE_COPY_DIR` está definida como variable de usuario de Windows o en Android Studio
  (Gradle Environment), AGP puede intentar escribir bajo OneDrive durante :app:packageRelease y fallar con
  `baselineProfiles\...` + AccessDeniedException. Este script quita la variable solo para el assemble y
  la define solo para exportReleaseApkFlat.

.PARAMETER ExportDir
  Carpeta destino absoluta (ej. carpeta local fuera de OneDrive, o OneDrive solo para el paso de copia).

.EXAMPLE
  .\scripts\build-release-and-export.ps1 -ExportDir 'C:\Users\leave\AppData\Local\GestorNova\release'
  .\scripts\build-release-and-export.ps1 -ExportDir 'C:\Users\leave\OneDrive\Documentos\Releases\release'
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $ExportDir
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$gw = Join-Path $repoRoot 'gradlew.bat'
if (-not (Test-Path $gw)) {
    Write-Error "No se encontró gradlew.bat en $repoRoot"
}

$saved = $env:GESTORNOVA_RELEASE_COPY_DIR
Remove-Item Env:GESTORNOVA_RELEASE_COPY_DIR -ErrorAction SilentlyContinue

Write-Host '== assembleRelease (sin GESTORNOVA_RELEASE_COPY_DIR) ==' -ForegroundColor Cyan
& $gw :app:assembleRelease --no-daemon
if ($LASTEXITCODE -ne 0) {
    if ($null -ne $saved) { $env:GESTORNOVA_RELEASE_COPY_DIR = $saved }
    exit $LASTEXITCODE
}

$env:GESTORNOVA_RELEASE_COPY_DIR = $ExportDir.TrimEnd('\')
Write-Host "== exportReleaseApkFlat -> $env:GESTORNOVA_RELEASE_COPY_DIR ==" -ForegroundColor Cyan
& $gw :app:exportReleaseApkFlat --no-daemon

if ($null -ne $saved) {
    $env:GESTORNOVA_RELEASE_COPY_DIR = $saved
} else {
    Remove-Item Env:GESTORNOVA_RELEASE_COPY_DIR -ErrorAction SilentlyContinue
}

exit $LASTEXITCODE
