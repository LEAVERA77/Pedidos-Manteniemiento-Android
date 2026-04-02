# Respaldo de configuracion y estado de Cursor (Windows)
# Uso: PowerShell → .\scripts\Respaldo-Cursor-estado.ps1
# Cierra Cursor antes si quieres una copia consistente de workspaceStorage.

$cursorUser = Join-Path $env:APPDATA "Cursor\User"
$destRoot = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "CursorBackups"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dest = Join-Path $destRoot "Cursor-User-$stamp"

if (-not (Test-Path $cursorUser)) {
    Write-Error "No existe la carpeta de Cursor: $cursorUser"
    exit 1
}

New-Item -ItemType Directory -Force -Path $dest | Out-Null

# Archivos pequenos imprescindibles
Copy-Item -Force (Join-Path $cursorUser "settings.json") $dest -ErrorAction SilentlyContinue
Copy-Item -Force (Join-Path $cursorUser "keybindings.json") $dest -ErrorAction SilentlyContinue

# Estado por workspace (incluye state.vscdb con mucho del UI + historial asociado al workspace)
Copy-Item -Recurse -Force (Join-Path $cursorUser "workspaceStorage") (Join-Path $dest "workspaceStorage")

# Almacenamiento global (extensiones, algun estado de Cursor)
Copy-Item -Recurse -Force (Join-Path $cursorUser "globalStorage") (Join-Path $dest "globalStorage")

# Transcripts del agente (historial de chats por UUID)
$projCursor = Join-Path $env:USERPROFILE ".cursor\projects\c-Users-leave-AndroidStudioProjects-Nexxo"
$transcripts = Join-Path $projCursor "agent-transcripts"
if (Test-Path $transcripts) {
    Copy-Item -Recurse -Force $transcripts (Join-Path $dest "agent-transcripts-Nexxo")
}

Write-Host "Respaldo guardado en: $dest"
Write-Host "Para restaurar: cerrar Cursor, copiar carpetas/archivos de vuelta a $cursorUser"
