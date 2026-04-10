#Requires -Version 5.1
<#
  Registra ThrottleStop para que arranque al iniciar sesión (Task Scheduler),
  siguiendo la idea de la guía UltrabookReview + guía paso a paso de Kevin Glynn (UncleWebb):
  - Foro habitual: https://www.techpowerup.com/forums/threads/throttlestop-auto-start-on-boot.334256/
  - Guía UltrabookReview: https://www.ultrabookreview.com/31385-the-throttlestop-guide/

  Ajustá $ThrottleStopRoot si tu carpeta no es C:\ThrottleStop_9.7.3

  Si ya usás NSSM (ThrottleStopService), desactivá ese servicio o esta tarea para no abrir TS dos veces.

  made by leavera77
#>

[CmdletBinding()]
param(
    [string] $ThrottleStopRoot = 'C:\ThrottleStop_9.7.3',
    [string] $TaskName = 'ThrottleStop',
    [string] $LogonDelay = 'PT45S',
    # Kevin Glynn / guías suelen marcar "Run with highest privileges"; en muchos PCs hace falta consola elevada.
    [switch] $RunHighest
)

$ErrorActionPreference = 'Stop'
$exe = Join-Path $ThrottleStopRoot 'ThrottleStop.exe'
if (-not (Test-Path -LiteralPath $exe)) {
    Write-Error "No existe ThrottleStop.exe en: $exe"
}

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$Action = New-ScheduledTaskAction -Execute $exe -WorkingDirectory $ThrottleStopRoot

$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Trigger.Delay = $LogonDelay

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

# Sin límite de tiempo de ejecución (equivalente a "no detener" en la guía)
try {
    $Settings.ExecutionTimeLimit = 'PT0S'
} catch { }

$runLevel = if ($RunHighest) { 'Highest' } else { 'Limited' }
$Principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel $runLevel

$Description = @'
ThrottleStop al iniciar sesión. Ver guía Kevin Glynn (Task Scheduler) y UltrabookReview ThrottleStop Guide. made by leavera77
'@

try {
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $Action `
        -Trigger $Trigger `
        -Settings $Settings `
        -Principal $Principal `
        -Description $Description.Trim() | Out-Null
} catch {
    if ($_.Exception.Message -match 'denegado|denied|0x80070005') {
        Write-Warning "Acceso denegado al registrar la tarea. Abrí PowerShell como administrador y ejecutá de nuevo este script."
        Write-Host "Alternativa: Programador de tareas → Crear tarea → importá scripts\ThrottleStop-ScheduledTask-template.xml (editá YOUR_USERNAME antes)."
        if ($RunHighest) {
            Write-Warning "Con -RunHighest siempre hace falta consola elevada."
        }
    }
    throw
}

Write-Host "Tarea registrada: $TaskName"
Write-Host "  Ejecutable: $exe"
Write-Host "  Directorio: $ThrottleStopRoot"
Write-Host "  Retraso tras logon: $LogonDelay"
Write-Host "  RunLevel: $runLevel"
if (-not $RunHighest) {
    Write-Host "  (Para 'Run with highest privileges' como en la guía: PowerShell admin + -RunHighest)"
}
Write-Host "Probar: Start-ScheduledTask -TaskName '$TaskName'"
