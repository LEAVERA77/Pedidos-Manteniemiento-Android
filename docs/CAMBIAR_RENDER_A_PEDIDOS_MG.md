# Guía: Cambiar Render para usar el Repo Pedidos-MG

## 🎯 Objetivo

Configurar Render para que la API despliegue desde `https://github.com/LEAVERA77/Pedidos-MG` en lugar de `Pedidos-Manteniemiento-Android`.

## ✅ Estado Actual del Código

- ✅ Carpeta `api/` **100% sincronizada** entre ambos repos
- ✅ Endpoint `/api/pedidos/:id/regeocodificar` presente
- ✅ Todos los servicios de geocodificación incluidos
- ✅ Migración SQL ejecutada en Neon (columnas `latitud`, `longitud` creadas)

**Commit más reciente en Pedidos-MG:**
```
b152e92 - sync: sincronizar API completa desde Nexxo con todas las correcciones
```

## 📝 Pasos en Render Dashboard

### 1. Acceder a la Configuración

1. Ve a https://dashboard.render.com/
2. Click en tu servicio de API (`nexxo-api` o como se llame)
3. Click en **"Settings"** (menú lateral izquierdo)

### 2. Autorizar Acceso al Repo Pedidos-MG

En la sección **"Repository"**:

1. Click en el botón **"Update Repository"** o **"Connect Repository"**
2. En el diálogo que se abre, haz click en **"Configure account"** (arriba a la derecha)
3. Se abrirá **GitHub** → **"Repository access"**
4. Selecciona **"All repositories"** O **"Only select repositories"**
   - Si eliges "Only select", busca y marca: `Pedidos-MG`
5. Click en **"Save"** o **"Update access"**
6. Vuelve a la pestaña de Render y refresca

### 3. Cambiar el Repositorio

1. En **"Update Repository"**, ahora deberías ver: `LEAVERA77/Pedidos-MG`
2. Click en **"Connect"** junto a `Pedidos-MG`
3. Confirma el cambio

### 4. Configurar el Root Directory

**MUY IMPORTANTE:** 

En **Settings** → **Build & Deploy**:

1. Busca **"Root Directory"**
2. Cambia a: `api`
3. **Build Command**: `npm install` (o `npm ci`)
4. **Start Command**: `npm start` (o `node server.js`)

### 5. Verificar Variables de Entorno

En **Settings** → **Environment**:

Asegúrate de que estén definidas:
- `DATABASE_URL` o `NEON_CONNECTION_STRING`
- `META_ACCESS_TOKEN`
- `META_PHONE_NUMBER_ID`
- `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`
- Todas las demás variables que usa la API

### 6. Forzar Redeploy

1. Click en **"Manual Deploy"** (en la parte superior)
2. Selecciona **"Clear build cache & deploy"**
3. **Espera** 2-5 minutos a que el deploy termine
4. Verifica que el status sea **"Live"** (verde)

---

## 🧪 Verificar el Deploy

Después del deploy, verifica:

### 1. Health Check
```
https://nexxo-api-418k.onrender.com/health
```
Debería devolver: `{"status":"ok"}`

### 2. Logs de Startup
En **Logs** (Render Dashboard), busca:
```json
{
  "level": "info",
  "msg": "api_listening",
  "port": 3000,
  "service": "pedidosmg-api",
  "version": "2.0.1-coords-migration"
}
```

### 3. Endpoint Regeocodificar
Desde PowerShell:
```powershell
$response = Invoke-WebRequest -Uri "https://nexxo-api-418k.onrender.com/api/pedidos/1/regeocodificar" -Method Options -UseBasicParsing
Write-Host $response.StatusCode  # Debería ser 204
```

### 4. Probar en la App Web
1. Ve a `https://leavera77.github.io/Pedidos-MG/`
2. Login
3. Abre un pedido
4. Click en "Re-geocodificar"
5. ✅ Debería funcionar sin errores

---

## 🔄 De Ahora en Adelante

Con esta configuración:
- **Push a `Pedidos-MG`** → Render despliega automáticamente ✅
- **Push a `Nexxo`** → Solo actualiza el repo Android (APK)

Si quieres mantener ambos repos sincronizados:
- Usa el hook de Git que creé (`scripts/post-commit-sync.ps1`)
- O sincroniza manualmente con `.\scripts\sync-assets-to-pedidos-mg.ps1`

---

## 📋 Resumen

**Paso crítico:** Necesitas **autorizar manualmente** el acceso de Render al repo `Pedidos-MG` en GitHub. No puedo hacer esto automáticamente porque requiere tu autenticación en GitHub.

**Después de cambiar el repo en Render, todo funcionará correctamente.**

¿Necesitas ayuda con algún paso específico?
