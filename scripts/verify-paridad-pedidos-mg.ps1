<#
.SYNOPSIS
  Verifica que los assets de Nexxo coincidan con el clon Pedidos-MG (paridad Pages / APK).

.DESCRIPTION
  Compara hash SHA256 de archivos que sync-assets-to-pedidos-mg.ps1 copia.
  Exit 0 = paridad OK. Exit 1 = diferencias o archivos faltantes.

.PARAMETER PedidosMgRoot
  Ruta al repo Pedidos-MG (default: hermano de Nexxo).

.PARAMETER AutoFix
  Si hay diferencias, ejecuta sync-assets-to-pedidos-mg.ps1 y vuelve a comparar (solo local).

.EXAMPLE
  .\scripts\verify-paridad-pedidos-mg.ps1
  .\scripts\verify-paridad-pedidos-mg.ps1 -PedidosMgRoot 'D:\repos\Pedidos-MG'
#>
[CmdletBinding()]
param(
    [string] $PedidosMgRoot = '',
    [switch] $AutoFix
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $repoRoot 'app\src\main\assets'

if (-not $PedidosMgRoot) {
    $PedidosMgRoot = Join-Path (Split-Path -Parent $repoRoot) 'Pedidos-MG'
}

if (-not (Test-Path $assets)) {
    Write-Error "No existe assets: $assets"
}

function Compare-Paridad {
    param([string] $MgRoot)

    if (-not (Test-Path $MgRoot)) {
        Write-Warning "Pedidos-MG no encontrado en: $MgRoot (omitir verificación de paridad)."
        return $true
    }

    $rootFiles = @(
        'index.html', 'app.js', 'sw.js', 'styles.css', 'gn-android-shell-perf.css',
        'gn-trust-ui.css', 'status.html', 'map.js', 'map-view.js', 'offline.js'
    )

    $diffs = @()

    foreach ($f in $rootFiles) {
        $src = Join-Path $assets $f
        $dst = Join-Path $MgRoot $f
        if (-not (Test-Path $src)) { continue }
        if (-not (Test-Path $dst)) {
            $diffs += "FALTA en Pedidos-MG: $f"
            continue
        }
        $h1 = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash
        $h2 = (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash
        if ($h1 -ne $h2) {
            $diffs += "DISTINTO: $f"
        }
    }

    $modSrc = Join-Path $assets 'modules'
    $modDst = Join-Path $MgRoot 'modules'
    if ((Test-Path $modSrc) -and (Test-Path $modDst)) {
        Get-ChildItem -Path $modSrc -Filter '*.js' -File | ForEach-Object {
            $rel = $_.Name
            $dstFile = Join-Path $modDst $rel
            if (-not (Test-Path $dstFile)) {
                $diffs += "FALTA módulo: modules/$rel"
                return
            }
            $h1 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
            $h2 = (Get-FileHash -LiteralPath $dstFile -Algorithm SHA256).Hash
            if ($h1 -ne $h2) {
                $diffs += "DISTINTO módulo: modules/$rel"
            }
        }
    } elseif (Test-Path $modSrc) {
        $diffs += 'FALTA carpeta modules/ en Pedidos-MG'
    }

    if ($diffs.Count -eq 0) {
        Write-Host "Paridad OK: Nexxo assets = Pedidos-MG ($MgRoot)"
        return $true
    }

    Write-Host "Paridad con diferencias ($($diffs.Count)):" -ForegroundColor Yellow
    $diffs | ForEach-Object { Write-Host "  $_" }
    return $false
}

$ok = Compare-Paridad -MgRoot $PedidosMgRoot

if (-not $ok -and $AutoFix) {
    Write-Host "AutoFix: ejecutando sync..."
    & (Join-Path $PSScriptRoot 'sync-assets-to-pedidos-mg.ps1') -PedidosMgRoot $PedidosMgRoot
    $ok = Compare-Paridad -MgRoot $PedidosMgRoot
}

if (-not $ok) {
    Write-Host ""
    Write-Host "Corregir: .\scripts\sync-assets-to-pedidos-mg.ps1 y commit en Pedidos-MG."
    exit 1
}

exit 0
