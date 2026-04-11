# Sync Automático Nexxo → Pedidos-MG

Este directorio contiene el sistema de sincronización automática entre los repositorios Nexxo (Android) y Pedidos-MG (Web/API).

## 🚀 Instalación (Una sola vez)

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
