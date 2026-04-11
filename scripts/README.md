# Scripts de Automatización

Este directorio contiene scripts para automatizar tareas del proyecto GestorNova:

1. **Sync automático** Nexxo → Pedidos-MG (frontend + API)
2. **Migración automática** de base de datos (socios_catalogo)

---

## 🔄 Sync Automático Nexxo → Pedidos-MG

### 🚀 Instalación (Una sola vez)

Ejecuta este comando en PowerShell desde la raíz del proyecto Nexxo:

```powershell
.\scripts\instalar-hook-sync.ps1
```

## ✨ ¿Qué hace el hook?

Después de cada `git commit` en **Nexxo**, el hook automáticamente:

1. **Detecta** si el commit tocó:
   - `app/src/main/assets/` (frontend web)
   - `api/` (backend Node.js)
   - `docs/` (documentación compartida)

2. **Sincroniza** los archivos modificados a **Pedidos-MG**

3. **Crea commit** en Pedidos-MG con el mismo mensaje

4. **Hace push** a `origin main`, disparando:
   - Deploy automático en **GitHub Pages** (frontend)
   - Deploy automático en **Render** (API)

## 📝 Ejemplo de uso

```powershell
# 1. Hacer cambios en Nexxo
cd C:\Users\leave\AndroidStudioProjects\Nexxo
notepad app\src\main\assets\app.js

# 2. Commit normal
git add .
git commit -m "feat: agregar nueva funcionalidad"

# 3. El hook se ejecuta automáticamente
# Verás mensajes como:
# [hook] Cambios detectados, sincronizando a Pedidos-MG...
# [hook] Sync completado
# [hook] Commit creado en Pedidos-MG, haciendo push...
# [hook] Push exitoso. Deploy automático en progreso...

# 4. Push de Nexxo
git push origin main
```

## 🔧 Qué se sincroniza

### Frontend (WebView)
- `index.html`
- `app.js`
- `styles.css`  
- `map.js`
- `map-view.js`
- `offline.js`
- `sw.js`
- `autocompletado-calles.js`

### Backend (API Node.js)
- Todos los archivos de `api/`
- Excepto: `node_modules/`, `.env`, `config.json`, `package-lock.json`

### Documentación
- Archivos en `docs/` marcados como compartidos

## ⚙️ Configuración

El script usa estas rutas por defecto:

```powershell
$NexxoRoot = "C:\Users\leave\AndroidStudioProjects\Nexxo"
$PedidosMgRoot = "C:\Users\leave\AndroidStudioProjects\Pedidos-MG"
```

Si tus repos están en otra ubicación, edita `scripts/post-commit-sync.ps1`.

## 🛑 Desactivar el hook

Para desactivar temporalmente:

```powershell
Remove-Item .git\hooks\post-commit
```

Para reactivar, ejecuta de nuevo `.\scripts\instalar-hook-sync.ps1`.

## 🐛 Troubleshooting

### El hook no se ejecuta

```powershell
# Verificar que existe
Test-Path .git\hooks\post-commit

# Reinstalar
.\scripts\instalar-hook-sync.ps1
```

### Error en el push a Pedidos-MG

El hook no falla tu commit en Nexxo. Si hay error:

1. El commit en Nexxo se completa normalmente
2. Verás un mensaje de advertencia
3. Puedes sincronizar manualmente:

```powershell
.\scripts\sync-assets-to-pedidos-mg.ps1
cd ..\Pedidos-MG
git add .
git commit -m "sync: desde Nexxo

made by leavera77"
git push origin main
```

### Sync falló por conflictos

```powershell
cd C:\Users\leave\AndroidStudioProjects\Pedidos-MG
git status
# Resolver conflictos manualmente
git add .
git commit -m "sync: resolver conflictos"
git push origin main
```

## 📚 Documentación

Ver regla completa: `.cursor/rules/sync-auto-pedidos-mg.mdc`

## 🔒 Seguridad

El hook **NUNCA** sincroniza:
- Archivos `.env` (secretos)
- `config.json` (credenciales)
- `node_modules/` (dependencias)
- Archivos temporales o personales

Los secretos de producción se configuran en:
- **GitHub Pages**: Settings → Secrets → Actions
- **Render**: Dashboard → Environment Variables

---

## 🗄️ Migración Automática de Base de Datos

### Script: `migrar-socios-catalogo.ps1`

Ejecuta la migración para agregar las columnas necesarias en la tabla `socios_catalogo`:
- `latitud`
- `longitud`
- `ubicacion_manual`
- `fecha_actualizacion_coords`

### 🚀 Uso

```powershell
# Desde la raíz del proyecto Nexxo
.\scripts\migrar-socios-catalogo.ps1
```

El script te pedirá:
1. Tu token de administrador
2. Confirmación para ejecutar la migración

### 📋 Obtener Token de Admin

1. Abre https://leavera77.github.io/Pedidos-MG/
2. Login como administrador
3. Presiona `F12` → Console
4. Ejecuta: `localStorage.getItem('token')`
5. Copia el token

### ✨ Características

- ✅ Verifica el estado actual de la tabla
- ✅ Ejecuta la migración solo si es necesaria
- ✅ Crea índices automáticamente
- ✅ Muestra logs detallados del proceso
- ✅ Verifica el resultado final
- ✅ Idempotente (seguro de ejecutar múltiples veces)

### 📚 Documentación Completa

Ver: `docs/MIGRACION_AUTOMATICA_SOCIOS_CATALOGO.md`

---

## 🛠️ Otros Scripts

### `sync-assets-to-pedidos-mg.ps1`
Sincronización manual (sin Git hook) de assets frontend.

### `post-commit-sync.ps1`
Lógica del hook post-commit (no ejecutar manualmente).

### `instalar-hook-sync.ps1`
Instalador del hook de Git.
