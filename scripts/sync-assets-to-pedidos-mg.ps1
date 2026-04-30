<#
.SYNOPSIS
  Copia el front modular desde app/src/main/assets hacia el clon local de Pedidos-MG (raíz del sitio Pages).

.DESCRIPTION
  Mantiene paridad entre Nexxo (fuente de verdad) y el repo LEAVERA77/Pedidos-MG.
  Tras ejecutar: en la carpeta Pedidos-MG hacé git add/commit/push si querés publicar.

.PARAMETER PedidosMgRoot
  Ruta al repo Pedidos-MG. Por defecto: hermano de Nexxo (AndroidStudioProjects/Pedidos-MG).

.EXAMPLE
  .\scripts\sync-assets-to-pedidos-mg.ps1
  .\scripts\sync-assets-to-pedidos-mg.ps1 -PedidosMgRoot 'D:\repos\Pedidos-MG'
#>
[CmdletBinding()]
param(
    [string] $PedidosMgRoot = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $repoRoot 'app\src\main\assets'

if (-not $PedidosMgRoot) {
    $PedidosMgRoot = Join-Path (Split-Path -Parent $repoRoot) 'Pedidos-MG'
}

if (-not (Test-Path $assets)) {
    Write-Error "No existe la carpeta assets: $assets"
}
if (-not (Test-Path $PedidosMgRoot)) {
    Write-Error "No existe Pedidos-MG en: $PedidosMgRoot`nPasá -PedidosMgRoot con la ruta correcta."
}

$files = @(
    'index.html',
    'index.min.html',
    'autocompletado-calles.js',
    'gestornova-logo.png',
    'styles.css',
    'admin-web-responsive.css',
    'app.js',
    'map.js',
    'map-view.js',
    'offline.js',
    'sync-worker.js',
    'sw.js'
)

foreach ($f in $files) {
    $src = Join-Path $assets $f
    if (-not (Test-Path $src)) {
        Write-Warning "Omitido (no existe): $src"
        continue
    }
    Copy-Item -LiteralPath $src -Destination (Join-Path $PedidosMgRoot $f) -Force
    Write-Host "OK $f"
}

# Módulos ES compartidos (p. ej. app.js → import './js/utils.js'). Sin esta carpeta, GitHub Pages falla al cargar el bundle.
$jsSrc = Join-Path $assets 'js'
$jsDst = Join-Path $PedidosMgRoot 'js'
if (Test-Path $jsSrc) {
    New-Item -ItemType Directory -Force -Path $jsDst | Out-Null
    Copy-Item -Path (Join-Path $jsSrc '*') -Destination $jsDst -Force
    Write-Host 'OK js/*'
} else {
    Write-Warning "Omitido (no existe carpeta js): $jsSrc"
}

$modSrc = Join-Path $assets 'modules'
$modDst = Join-Path $PedidosMgRoot 'modules'
if (Test-Path $modSrc) {
    New-Item -ItemType Directory -Force -Path $modDst | Out-Null
    Copy-Item -Path (Join-Path $modSrc '*') -Destination $modDst -Force
    Write-Host 'OK modules/*'
} else {
    Write-Warning "Omitido (no existe carpeta modules): $modSrc"
}

$brandSrc = Join-Path $assets 'branding'
$brandDst = Join-Path $PedidosMgRoot 'branding'
if (Test-Path $brandSrc) {
    New-Item -ItemType Directory -Force -Path $brandDst | Out-Null
    Copy-Item -Path (Join-Path $brandSrc '*') -Destination $brandDst -Force
    Write-Host 'OK branding/*'
}

# Paridad con lo que suele haber en assets para WebView empaquetado
$idx = Join-Path $assets 'index.html'
$min = Join-Path $assets 'index.min.html'
if (Test-Path $idx) {
    Copy-Item -LiteralPath $idx -Destination $min -Force
    Write-Host 'OK index.min.html (copia de index.html en assets)'
}

Write-Host ""
Write-Host "Listo. Siguiente en Pedidos-MG: git status, git add, git commit, git push origin main"
