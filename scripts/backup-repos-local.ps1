<#
.SYNOPSIS
    Copia fiel de Nexxo y Pedidos-MG bajo AndroidStudioProjects (para recuperación / push a GitHub).

.DESCRIPTION
    Crea BACKUP_REPOS_<fecha> con robocopy /E incluyendo .git.
    Excluye node_modules, .gradle y carpetas build (se regeneran con npm install / Gradle).

.PARAMETER ProjectsRoot
    Carpeta padre (default: directorio padre de este repo = AndroidStudioProjects).

.PARAMETER PedidosMgPath
    Ruta al clon de Pedidos-MG (default: hermano ..\Pedidos-MG).

.PARAMETER Stamp
    Sufijo de carpeta; default: yyyyMMdd_HHmmss.

.EXAMPLE
    .\scripts\backup-repos-local.ps1
    .\scripts\backup-repos-local.ps1 -PedidosMgPath "D:\clones\Pedidos-MG"
#>
param(
    [string] $ProjectsRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
    [string] $PedidosMgPath = "",
    [string] $Stamp = (Get-Date -Format "yyyyMMdd_HHmmss")
)
if (-not $PedidosMgPath) {
    $PedidosMgPath = Join-Path $ProjectsRoot "Pedidos-MG"
}

$ErrorActionPreference = "Stop"
$nexxoSrc = Join-Path $ProjectsRoot "Nexxo"
$destRoot = Join-Path $ProjectsRoot "BACKUP_REPOS_$Stamp"

if (-not (Test-Path $nexxoSrc)) {
    Write-Error "No existe Nexxo en: $nexxoSrc"
}

New-Item -ItemType Directory -Path $destRoot -Force | Out-Null

$commonRobo = @(
    "/E", "/COPY:DAT", "/R:2", "/W:3",
    "/XD", "node_modules", ".gradle", "build",
    "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np"
)

Write-Host "Destino: $destRoot" -ForegroundColor Cyan

Write-Host "Copiando Nexxo..." -ForegroundColor Yellow
& robocopy $nexxoSrc (Join-Path $destRoot "Nexxo") @commonRobo
if ($LASTEXITCODE -ge 8) { throw "robocopy Nexxo falló con código $LASTEXITCODE" }

if (Test-Path $PedidosMgPath) {
    Write-Host "Copiando Pedidos-MG..." -ForegroundColor Yellow
    & robocopy $PedidosMgPath (Join-Path $destRoot "Pedidos-MG") @commonRobo
    if ($LASTEXITCODE -ge 8) { throw "robocopy Pedidos-MG falló con código $LASTEXITCODE" }
} else {
    Write-Warning "No se encontró Pedidos-MG en: $PedidosMgPath (solo se copió Nexxo)."
}

$readme = @"
BACKUP_REPOS_$Stamp
===================
Fecha (PC): $(Get-Date -Format "o")

Contenido:
- Nexxo/     → clon habitual (Pedidos-Manteniemiento-Android)
- Pedidos-MG/ → admin web + api en Pages/Render

Incluye historial Git (.git). Excluidos en copia: node_modules, .gradle, build (reinstalar deps tras restaurar).

Restaurar en el disco (reemplazar carpeta rota)
----------------------------------------------
1. Cerrar Android Studio / procesos que usen las carpetas.
2. Renombrar o borrar la carpeta dañada (ej. Nexxo → Nexxo_roto).
3. Copiar de vuelta:
   xcopy /E /I /H /Y "$destRoot\Nexxo" "C:\Users\leave\AndroidStudioProjects\Nexxo"
   (o robocopy equivalente)

4. En cada repo restaurado:
   cd ...\Nexxo\api && npm ci   (o npm install)
   En Android Studio: Sync Gradle, Build.

Volver a subir a GitHub (reemplazar remoto roto)
-------------------------------------------------
Desde la copia restaurada (o desde esta carpeta si renombrás a Nexxo):

  cd <ruta>\Nexxo
  git remote -v
  git status
  git push origin main

Si el remoto tiene commits que NO querés conservar y esta copia es la verdad:

  git push origin main --force-with-lease

Misma idea en Pedidos-MG. Usá --force-with-lease con cuidado (avisá al equipo).

Hecho por script: scripts/backup-repos-local.ps1 (repo Nexxo).
"@
$readme | Set-Content -Path (Join-Path $destRoot "LEEME_RESTAURAR.txt") -Encoding UTF8

Write-Host "Listo: $destRoot" -ForegroundColor Green
Write-Host "Ver LEEME_RESTAURAR.txt en esa carpeta." -ForegroundColor Green
