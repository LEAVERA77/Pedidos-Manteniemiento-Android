# Script de migración automática para socios_catalogo
# Ejecuta la migración de columnas latitud, longitud, ubicacion_manual
# made by leavera77

param(
    [Parameter(Mandatory=$false)]
    [string]$Token = "",
    
    [Parameter(Mandatory=$false)]
    [string]$ApiUrl = "https://nexxo-api-418k.onrender.com"
)

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  MIGRACIÓN AUTOMÁTICA: socios_catalogo" -ForegroundColor Cyan
Write-Host "  Agrega columnas: latitud, longitud, ubicacion_manual" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Solicitar token si no se proporcionó
if ([string]::IsNullOrWhiteSpace($Token)) {
    Write-Host "📋 Para obtener tu token:" -ForegroundColor Yellow
    Write-Host "   1. Abre https://leavera77.github.io/Pedidos-MG/" -ForegroundColor Gray
    Write-Host "   2. Login como admin" -ForegroundColor Gray
    Write-Host "   3. Presiona F12 → Console" -ForegroundColor Gray
    Write-Host "   4. Ejecuta: localStorage.getItem('token')" -ForegroundColor Gray
    Write-Host "   5. Copia el token" -ForegroundColor Gray
    Write-Host ""
    $Token = Read-Host "🔑 Ingresa tu token de admin"
    
    if ([string]::IsNullOrWhiteSpace($Token)) {
        Write-Host "❌ Token requerido para continuar" -ForegroundColor Red
        exit 1
    }
}

$headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type" = "application/json"
}

Write-Host ""

# 1. Verificar estado actual
Write-Host "1️⃣  Verificando estado actual de la tabla..." -ForegroundColor Cyan
Write-Host ""

try {
    $schemaUrl = "$ApiUrl/api/admin/db/schema/socios_catalogo"
    $schema = Invoke-RestMethod -Uri $schemaUrl -Method Get -Headers $headers
    
    Write-Host "   Tabla: $($schema.table)" -ForegroundColor White
    Write-Host "   Columnas encontradas: $($schema.columns.Count)" -ForegroundColor White
    Write-Host ""
    Write-Host "   Estado de migración:" -ForegroundColor Yellow
    Write-Host "   • latitud:           $($schema.migration_status.latitud)" -ForegroundColor $(if ($schema.migration_status.latitud -like "*existe*") { "Green" } else { "Red" })
    Write-Host "   • longitud:          $($schema.migration_status.longitud)" -ForegroundColor $(if ($schema.migration_status.longitud -like "*existe*") { "Green" } else { "Red" })
    Write-Host "   • ubicacion_manual:  $($schema.migration_status.ubicacion_manual)" -ForegroundColor $(if ($schema.migration_status.ubicacion_manual -like "*existe*") { "Green" } else { "Red" })
    Write-Host ""
    
    if (-not $schema.migration_status.needs_migration) {
        Write-Host "✅ La tabla ya tiene todas las columnas necesarias." -ForegroundColor Green
        Write-Host "   No se requiere migración." -ForegroundColor Green
        Write-Host ""
        Read-Host "Presiona Enter para salir"
        exit 0
    }
    
    Write-Host "⚠️  Se requiere migración" -ForegroundColor Yellow
    Write-Host ""
    
} catch {
    Write-Host "❌ Error al verificar esquema:" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "   💡 Token inválido o expirado. Obtén uno nuevo." -ForegroundColor Yellow
    } elseif ($_.Exception.Response.StatusCode -eq 403) {
        Write-Host "   💡 Necesitas permisos de administrador." -ForegroundColor Yellow
    }
    
    Write-Host ""
    Read-Host "Presiona Enter para salir"
    exit 1
}

# 2. Confirmar ejecución
Write-Host "2️⃣  ¿Deseas ejecutar la migración ahora?" -ForegroundColor Cyan
$confirm = Read-Host "   Escribe 'SI' para continuar"

if ($confirm -ne "SI") {
    Write-Host ""
    Write-Host "⏹️  Migración cancelada por el usuario" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Presiona Enter para salir"
    exit 0
}

Write-Host ""

# 3. Ejecutar migración
Write-Host "3️⃣  Ejecutando migración..." -ForegroundColor Cyan
Write-Host ""

try {
    $migrateUrl = "$ApiUrl/api/admin/db/migrate/socios_catalogo"
    $migrate = Invoke-RestMethod -Uri $migrateUrl -Method Post -Headers $headers
    
    Write-Host "   📝 Log de migración:" -ForegroundColor Yellow
    Write-Host ""
    foreach ($line in $migrate.log) {
        $color = "White"
        if ($line -like "*✓*" -or $line -like "*✅*") {
            $color = "Green"
        } elseif ($line -like "*⚠️*") {
            $color = "Yellow"
        } elseif ($line -like "*❌*") {
            $color = "Red"
        } elseif ($line -like "*🔧*" -or $line -like "*🔍*") {
            $color = "Cyan"
        }
        Write-Host "   $line" -ForegroundColor $color
    }
    
    Write-Host ""
    Write-Host "   Columnas agregadas: $($migrate.migrations_applied -join ', ')" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host "❌ Error al ejecutar migración:" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Read-Host "Presiona Enter para salir"
    exit 1
}

# 4. Verificar resultado
Write-Host "4️⃣  Verificando resultado..." -ForegroundColor Cyan
Write-Host ""

try {
    $schemaUrl = "$ApiUrl/api/admin/db/schema/socios_catalogo"
    $schemaFinal = Invoke-RestMethod -Uri $schemaUrl -Method Get -Headers $headers
    
    Write-Host "   Estado final:" -ForegroundColor Yellow
    Write-Host "   • latitud:           $($schemaFinal.migration_status.latitud)" -ForegroundColor $(if ($schemaFinal.migration_status.latitud -like "*existe*") { "Green" } else { "Red" })
    Write-Host "   • longitud:          $($schemaFinal.migration_status.longitud)" -ForegroundColor $(if ($schemaFinal.migration_status.longitud -like "*existe*") { "Green" } else { "Red" })
    Write-Host "   • ubicacion_manual:  $($schemaFinal.migration_status.ubicacion_manual)" -ForegroundColor $(if ($schemaFinal.migration_status.ubicacion_manual -like "*existe*") { "Green" } else { "Red" })
    Write-Host ""
    
    if (-not $schemaFinal.migration_status.needs_migration) {
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
        Write-Host "  ✅ MIGRACIÓN COMPLETADA EXITOSAMENTE" -ForegroundColor Green
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
        Write-Host ""
        Write-Host "✨ Ahora puedes:" -ForegroundColor Cyan
        Write-Host "   • Usar el botón 'Re-geocodificar' en los pedidos" -ForegroundColor White
        Write-Host "   • Mover pins en el mapa (se guardarán automáticamente)" -ForegroundColor White
        Write-Host "   • Nuevos pedidos usarán coordenadas del catálogo" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host "⚠️  Algunas columnas aún faltan. Revisa los logs arriba." -ForegroundColor Yellow
        Write-Host ""
    }
    
} catch {
    Write-Host "⚠️  No se pudo verificar el resultado final" -ForegroundColor Yellow
    Write-Host "   Pero la migración probablemente se ejecutó correctamente." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host ""
Read-Host "Presiona Enter para salir"
