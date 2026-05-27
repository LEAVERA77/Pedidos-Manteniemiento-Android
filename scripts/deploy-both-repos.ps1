<#
.SYNOPSIS
  Commit opcional + sync Pedidos-MG + push ambos repos (Nexxo y Pedidos-MG).

.PARAMETER CommitMessage
  Si se indica, hace git commit -a en Nexxo antes del sync.

.EXAMPLE
  .\scripts\deploy-both-repos.ps1 -CommitMessage "fix: algo

made by leavera77"
#>
param(
    [string] $CommitMessage = '',
    [string] $PedidosMgRoot = ''
)

$ErrorActionPreference = 'Stop'
$NexxoRoot = Split-Path -Parent $PSScriptRoot
if (-not $PedidosMgRoot) {
    $PedidosMgRoot = Join-Path (Split-Path -Parent $NexxoRoot) 'Pedidos-MG'
}

Push-Location $NexxoRoot
if ($CommitMessage) {
    git add -A
    git commit -m $CommitMessage
}
git push origin main
& (Join-Path $NexxoRoot 'scripts\sync-assets-to-pedidos-mg.ps1') -PedidosMgRoot $PedidosMgRoot

$apiFiles = @(
    'api\routes\admin.js', 'api\routes\auth.js', 'api\routes\pedidos.js',
    'api\routes\geocodeNominatim.js', 'api\services\usuarioNotifPrefs.js',
    'api\services\notificacionesMovilEnqueue.js', 'api\services\regeocodificarLoteAdmin.js',
    'api\services\adminSistemaSalud.js', 'api\services\nominatimHealthPing.js',
    'api\services\pedidosSinCoordsAdmin.js', 'api\services\geoCalidadMetricas.js'
)
foreach ($f in $apiFiles) {
    $src = Join-Path $NexxoRoot $f
    if (Test-Path $src) {
        $dst = Join-Path $PedidosMgRoot $f
        New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
        Copy-Item $src $dst -Force
    }
}
if (Test-Path (Join-Path $NexxoRoot 'docs')) {
    Copy-Item (Join-Path $NexxoRoot 'docs\*.md') (Join-Path $PedidosMgRoot 'docs\') -Force -ErrorAction SilentlyContinue
}

Pop-Location
Push-Location $PedidosMgRoot
git add -A
$status = git status --porcelain
if ($status) {
    if (-not $CommitMessage) { $CommitMessage = "chore: sync desde Nexxo`n`nmade by leavera77" }
    git commit -m $CommitMessage
}
git push origin main
Pop-Location

Write-Host "Listo: Nexxo y Pedidos-MG pusheados."
