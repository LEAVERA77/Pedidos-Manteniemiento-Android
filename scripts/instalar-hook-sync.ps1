# Script de instalación del hook post-commit para sync automático
# Ejecuta este script una sola vez para activar la sincronización automática
# made by leavera77

$HookSource = "$PSScriptRoot\..\git\hooks\post-commit"
$HookTarget = "$PSScriptRoot\..\.git\hooks\post-commit"

Write-Host "=== Instalador de Hook de Sync Automático ===" -ForegroundColor Cyan
Write-Host ""

# Verificar que existe la carpeta git/hooks (versionada)
if (-not (Test-Path "$PSScriptRoot\..\git\hooks")) {
    New-Item -ItemType Directory -Path "$PSScriptRoot\..\git\hooks" -Force | Out-Null
}

# Crear el hook (script shell que llama a PowerShell)
$HookContent = @"
#!/bin/sh
# Git post-commit hook para Nexxo
# Sincroniza automáticamente cambios relevantes a Pedidos-MG
# made by leavera77

# Ejecutar con PowerShell en Windows
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "`$(git rev-parse --show-toplevel)/scripts/post-commit-sync.ps1"
"@

try {
    Set-Content -Path $HookTarget -Value $HookContent -NoNewline
    Write-Host "✓ Hook instalado correctamente" -ForegroundColor Green
} catch {
    Write-Host "✗ Error al instalar hook: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Configuración ===" -ForegroundColor Cyan
Write-Host "El hook se ejecutará automáticamente después de cada commit en Nexxo."
Write-Host ""
Write-Host "Qué hace:" -ForegroundColor Yellow
Write-Host "  1. Detecta si el commit tocó assets/, api/ o docs/"
Write-Host "  2. Ejecuta sync-assets-to-pedidos-mg.ps1"
Write-Host "  3. Crea commit en Pedidos-MG con el mismo mensaje"
Write-Host "  4. Hace push a GitHub (dispara deploy automático)"
Write-Host ""
Write-Host "Para desactivar:" -ForegroundColor Yellow
Write-Host "  Remove-Item $HookTarget"
Write-Host ""
Write-Host "Para probar:" -ForegroundColor Yellow
Write-Host "  1. Haz un cambio en app/src/main/assets/app.js"
Write-Host "  2. git add . && git commit -m 'test: probar sync automático'"
Write-Host "  3. Observa la salida del hook en la consola"
Write-Host ""
Write-Host "✓ Instalación completa" -ForegroundColor Green
