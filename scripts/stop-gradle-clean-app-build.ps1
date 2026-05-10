<#
.SYNOPSIS
  Detiene daemons de Gradle y borra app/build cuando `gradlew clean` falla por archivos bloqueados (Windows).

.DESCRIPTION
  Suele pasar si Android Studio tiene el proyecto abierto: lint-cache mantiene .jar abiertos.
  Cerrá el IDE o al menos **File → Invalidate Caches** no suele bastar: primero **Stop** Gradle (este script) y cerrar AS si Remove-Item falla.

.EXAMPLE
  .\scripts\stop-gradle-clean-app-build.ps1
  .\gradlew :app:assembleRelease :app:exportReleaseApkFlat
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host 'Deteniendo daemons de Gradle...'
& (Join-Path $repoRoot 'gradlew.bat') --stop 2>$null
Start-Sleep -Seconds 3

$buildDir = Join-Path $repoRoot 'app\build'
if (-not (Test-Path $buildDir)) {
    Write-Host "No existe $buildDir — nada que borrar."
    exit 0
}

Write-Host "Borrando $buildDir ..."
try {
    Remove-Item -LiteralPath $buildDir -Recurse -Force
    Write-Host 'Listo. Podés ejecutar gradlew clean o assembleRelease.'
} catch {
    Write-Warning $_.Exception.Message
    Write-Host ''
    Write-Host 'Si sigue bloqueado: cerrá Android Studio, volvé a ejecutar este script, o borrá app\build desde el Explorador.'
    exit 1
}
