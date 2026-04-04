# Mantener la interfaz: Agent + Ask (Gemini 3 Flash)

## Lo que ya quedó en tu Cursor (usuario)

En `%APPDATA%\Cursor\User\settings.json`:

| Ajuste | Para qué sirve |
|--------|----------------|
| `window.restoreWindows`: `all` | Vuelve a abrir **las mismas ventanas y carpeta** (Nexxo). |
| `workbench.sideBar.location`: `right` | El **Explorador de archivos** queda a la **derecha**, como en tu captura. |
| `workbench.secondarySideBar.defaultVisibility`: `visibleInWorkspace` | La **barra lateral secundaria** (donde suele ir **Chat / Agent** en muchos layouts) se muestra al abrir un **workspace/carpeta**. |

Si tu versión de Cursor no reconoce alguna clave, puede ignorarla sin romper nada.

## Gemini 3 Flash en Ask (no hay clave oficial estable)

Cursor **guarda el modelo elegido** en el estado del workspace (base interna), no siempre expone en `settings.json` un valor tipo “default Ask model = Gemini 3 Flash”.

**Qué hacer una vez (y se mantiene con la restauración de ventanas):**

1. Abrí el panel **Ask** (centro / pestaña que usás).
2. En el desplegable del modelo, elegí **Gemini 3 Flash**.
3. Cerrá Cursor con **Archivo → Salir** (o cierra la ventana de ese proyecto) para que guarde el layout.

**Si algún día se “pierde” el modelo:** volvé a elegir Gemini 3 Flash en Ask; suele pasar si abrís otra carpeta (otro `workspaceStorage`) o tras actualizar Cursor.

Más contexto en la documentación de Cursor: [Models and usage](https://cursor.com/docs) / preferencias en la app (**Cursor Settings**).

## Agent siempre a la vista

- Dejá **Agent** abierto en el lateral que prefieras antes de cerrar.
- Con **`restoreWindows`: `all`**, al reabrir debería volver ese layout.
- Si **Agent** no está en la barra secundaria, usá el menú **Vista** / íconos de paneles de Cursor para colocarlo como lo tenés ahora y cerrá de nuevo para fijarlo.

## Respaldo del estado (por si Cursor “resetea” el layout)

Podés usar el script del repo:

`Nexxo/scripts/Respaldo-Cursor-estado.ps1`

Copia `workspaceStorage` (donde vive mucho del UI + historial del workspace).

---

**Resumen:** el layout (carpeta + barras) lo maximizamos con ajustes + **salir bien** de Cursor. **Gemini 3 Flash en Ask** se fija desde el desplegable del chat y se conserva con la misma carpeta y restauración de ventanas; no hay garantía 100% solo con JSON hasta que Cursor publique un ajuste oficial.
