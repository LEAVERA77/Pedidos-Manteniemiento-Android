# Fija la ubicacion GPS del emulador Android (AVD) para GestorNova / mapa del pedido.
# Requisitos: emulador ya iniciado; adb en PATH (Android SDK platform-tools).
#
# Sintaxis oficial: geo fix <longitud> <latitud> (grados decimales WGS84).
# Por defecto: zona aprox. Santa Fe (~ -31, -59). El emulador NO usa la ubicacion del notebook;
# hay que fijarla asi o en Extended controls (…) → Location del AVD.
#
# Uso (PowerShell):
#   cd ...\Nexxo\scripts
#   .\set-emulator-location.ps1
#
# O Maria Grande aprox.:
#   .\set-emulator-location.ps1 -Longitude -60.02 -Latitude -31.505

param(
    [double] $Longitude = -59.0,
    [double] $Latitude = -31.0
)

$ErrorActionPreference = "Stop"
adb emu geo fix $Longitude $Latitude
if ($LASTEXITCODE -ne 0) {
    Write-Host "Fallo adb. Asegurate de que el AVD este corriendo y que 'adb devices' liste el emulador." -ForegroundColor Yellow
    exit $LASTEXITCODE
}
Write-Host "Ubicacion enviada al emulador: lat=$Latitude lon=$Longitude" -ForegroundColor Green
