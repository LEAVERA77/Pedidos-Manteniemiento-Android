# Abre Cursor en la carpeta de trabajo habitual (GestorNova / Nexxo).
# Uso: doble clic o acceso directo con destino:
#   powershell.exe -ExecutionPolicy Bypass -File "C:\Users\leave\AndroidStudioProjects\Nexxo\scripts\Abrir-Cursor-Nexxo.ps1"

$repo = "C:\Users\leave\AndroidStudioProjects\Nexxo"
$candidates = @(
    Join-Path $env:LOCALAPPDATA "Programs\cursor\Cursor.exe",
    Join-Path ${env:ProgramFiles} "Cursor\Cursor.exe"
)
$exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) {
    Write-Error "No se encontro Cursor.exe. Instala Cursor o edita las rutas en este script."
    exit 1
}
Start-Process -FilePath $exe -ArgumentList "`"$repo`""
