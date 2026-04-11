# Solución al Error "column latitud does not exist"

## 🔴 Problema

El endpoint `/api/pedidos/:id/regeocodificar` falla con:
```
Error: column "latitud" does not exist
```

**Causa:** La tabla `socios_catalogo` en Neon no tiene las columnas necesarias (`latitud`, `longitud`, `ubicacion_manual`, `fecha_actualizacion_coords`).

---

## ✅ Solución: Migración Automática

He creado endpoints administrativos que ejecutan la migración **automáticamente** desde la API.

### 1. Verificar el Estado Actual

**Endpoint:** `GET /api/admin/db/schema/socios_catalogo`

**Desde PowerShell:**
```powershell
$token = "TU_TOKEN_ADMIN"  # Obtenerlo desde el login en la app
$response = Invoke-RestMethod -Uri "https://nexxo-api-418k.onrender.com/api/admin/db/schema/socios_catalogo" -Method Get -Headers @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}
$response | ConvertTo-Json -Depth 10
```

**Resultado esperado:**
```json
{
  "status": "ok",
  "table": "socios_catalogo",
  "columns": [ ... ],
  "migration_status": {
    "latitud": "❌ falta",
    "longitud": "❌ falta",
    "ubicacion_manual": "❌ falta",
    "needs_migration": true
  }
}
```

---

### 2. Ejecutar la Migración

**Endpoint:** `POST /api/admin/db/migrate/socios_catalogo`

**Desde PowerShell:**
```powershell
$token = "TU_TOKEN_ADMIN"
$response = Invoke-RestMethod -Uri "https://nexxo-api-418k.onrender.com/api/admin/db/migrate/socios_catalogo" -Method Post -Headers @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}
$response | ConvertTo-Json -Depth 10
```

**Resultado esperado:**
```json
{
  "status": "ok",
  "message": "Migración ejecutada exitosamente",
  "migrations_applied": ["latitud", "longitud", "ubicacion_manual", "fecha_actualizacion_coords"],
  "log": [
    "🔧 Iniciando migración de socios_catalogo...",
    "📊 Columnas existentes: ",
    "  ✓ Columna 'latitud' agregada",
    "  ✓ Columna 'longitud' agregada",
    "  ✓ Columna 'ubicacion_manual' agregada",
    "  ✓ Columna 'fecha_actualizacion_coords' agregada",
    "🔍 Creando índices...",
    "  ✓ Índice idx_socios_catalogo_coords creado",
    "  ✓ Índice idx_socios_catalogo_ubicacion_manual creado",
    "✅ Migración completada exitosamente"
  ]
}
```

---

### 3. Verificar que Funcionó

**Endpoint:** `GET /api/admin/db/schema/socios_catalogo` (de nuevo)

**Resultado esperado:**
```json
{
  "migration_status": {
    "latitud": "✅ existe",
    "longitud": "✅ existe",
    "ubicacion_manual": "✅ existe",
    "needs_migration": false
  }
}
```

---

### 4. Probar Re-geocodificar

Ahora el botón **"Re-geocodificar"** debería funcionar sin errores.

**Desde la app:**
1. Login como admin
2. Abrir un pedido
3. Click en "Re-geocodificar"
4. ✅ Debería ver los logs de diagnóstico sin error

---

## 🔐 Obtener el Token de Admin

### Opción A: Desde la Consola del Navegador

1. Abre https://leavera77.github.io/Pedidos-MG/
2. Login como admin
3. Abre la consola del navegador (F12 → Console)
4. Ejecuta:
```javascript
localStorage.getItem('token')
```
5. Copia el token

### Opción B: Desde el Código

1. En `app.js`, busca la función `getApiToken()`
2. El token se guarda en `localStorage.getItem('token')`

---

## 🚀 Flujo Completo (Copy-Paste)

```powershell
# 1. Obtener token (desde la app web, login como admin, console: localStorage.getItem('token'))
$token = "PEGAR_TOKEN_AQUI"

# 2. Verificar estado
Write-Host "1️⃣ Verificando estado actual..." -ForegroundColor Yellow
$schema = Invoke-RestMethod -Uri "https://nexxo-api-418k.onrender.com/api/admin/db/schema/socios_catalogo" -Method Get -Headers @{
    "Authorization" = "Bearer $token"
}
$schema.migration_status | ConvertTo-Json

# 3. Ejecutar migración
Write-Host "`n2️⃣ Ejecutando migración..." -ForegroundColor Yellow
$migrate = Invoke-RestMethod -Uri "https://nexxo-api-418k.onrender.com/api/admin/db/migrate/socios_catalogo" -Method Post -Headers @{
    "Authorization" = "Bearer $token"
}
$migrate.log | ForEach-Object { Write-Host $_ }

# 4. Verificar resultado
Write-Host "`n3️⃣ Verificando resultado..." -ForegroundColor Yellow
$schemaFinal = Invoke-RestMethod -Uri "https://nexxo-api-418k.onrender.com/api/admin/db/schema/socios_catalogo" -Method Get -Headers @{
    "Authorization" = "Bearer $token"
}
$schemaFinal.migration_status | ConvertTo-Json

Write-Host "`n✅ Migración completada. Prueba el botón Re-geocodificar en la app." -ForegroundColor Green
```

---

## ⚠️ Troubleshooting

### Error: "401 Unauthorized"
**Causa:** Token inválido o expirado.
**Solución:** Vuelve a loguearte en la app y obtén un nuevo token.

### Error: "403 Forbidden"
**Causa:** El usuario no es admin.
**Solución:** Asegúrate de estar logueado como administrador.

### Error: "column already exists"
**Causa:** Las columnas ya fueron agregadas.
**Solución:** No hacer nada, la migración ya está completa. Verifica con el endpoint GET.

### Error: "timeout"
**Causa:** Render está desplegando o la base de datos está ocupada.
**Solución:** Espera 1-2 minutos y reintenta.

---

## 📝 Notas

- **Idempotencia:** El endpoint de migración es seguro de ejecutar múltiples veces. Si las columnas ya existen, las ignora.
- **Índices:** Se crean automáticamente para optimizar las búsquedas por coordenadas.
- **Logs:** Todos los pasos se registran en el response del endpoint.
- **Seguridad:** Solo usuarios con rol `admin` pueden ejecutar estos endpoints.

---

## 🎯 Después de la Migración

Una vez completada la migración:

1. ✅ El botón "Re-geocodificar" funcionará correctamente
2. ✅ Las coordenadas manuales del admin se guardarán en `socios_catalogo`
3. ✅ Los nuevos pedidos por WhatsApp priorizarán las coords del catálogo
4. ✅ El sistema de 5 capas de geocodificación estará 100% operacional

---

*made by leavera77*
