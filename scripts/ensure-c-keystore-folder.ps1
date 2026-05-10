<#
.SYNOPSIS
  Crea C:\Keystore y otorga permisos de modificación al usuario actual (lectura/escritura del keystore y copias).

.DESCRIPTION
  Crear carpetas bajo C:\ suele requerir **PowerShell → Ejecutar como administrador** la primera vez.
  Después copiá el archivo del store a `C:\Keystore\` (p. ej. `keystore` sin extensión o `release.jks`)
  y en `keystore.properties` usá `storeFilePath=C:/Keystore/<nombre>`.

.EXAMPLE
  # Clic derecho en PowerShell → Ejecutar como administrador:
  cd C:\Users\leave\AndroidStudioProjects\Nexxo
  .\scripts\ensure-c-keystore-folder.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$dir = 'C:\Keystore'

if (-not (Test-Path -LiteralPath $dir)) {
    try {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    } catch {
        Write-Error @"
No se pudo crear $dir.
Ejecutá PowerShell como Administrador y volvé a ejecutar este script.
"@
    }
}

$u = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
# (OI)(CI) = object inherit + container inherit; M = Modify (incluye lectura del keystore)
& icacls.exe $dir /inheritance:e | Out-Null
& icacls.exe $dir /grant:r "${u}:(OI)(CI)M" | Out-Host

Write-Host ""
Write-Host "Carpeta lista: $dir" -ForegroundColor Green
Write-Host "Copiá el archivo del keystore aquí y en keystore.properties usá storeFilePath=C:/Keystore/<nombreDelArchivo>"
