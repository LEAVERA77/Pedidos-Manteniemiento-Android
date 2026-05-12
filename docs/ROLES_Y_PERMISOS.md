# Roles y Permisos — GestorNova

Documento generado a partir de auditoría del código (mayo 2026).

## Roles del sistema

| Rol | Descripción | Plataforma principal |
|-----|-------------|---------------------|
| **admin** / **administrador** | Gestión completa del tenant: pedidos, usuarios, KPIs, configuración, WhatsApp, estadísticas | Web (PC) / también puede usar la APK |
| **tecnico** | Trabajo de campo: pedidos asignados, avances, fotos, cierre, GPS | Android (APK) |
| **supervisor** | Igual que técnico pero puede ver todos los pedidos del tenant | Android (APK) |

---

## Tabla de permisos

| Funcionalidad | Admin | Técnico | Supervisor | Protección API | Protección Frontend |
|---------------|:-----:|:-------:|:----------:|----------------|---------------------|
| **Pedidos** |
| Ver todos los pedidos | ✅ | ❌ (solo asignados) | ✅ (toggle) | tenant_id scope | `cargarPedidos()` filtra por usuario |
| Crear pedido (mapa/formulario) | ✅ | ✅ | ✅ | `authWithTenantHost` | Sin restricción visual |
| Editar pedido (estado, avance, cierre) | ✅ | ✅ (solo asignados) | ✅ | `PUT /api/pedidos/:id` - auth | Lógica en `detalle()` |
| Asignar técnico a pedido | ✅ | ❌ | ❌ | `adminOnly` | Botón oculto |
| Desestimar pedido | ✅ | ❌ | ❌ | Verificación de rol en ruta | Visible solo admin |
| Derivar a tercero (admin) | ✅ | ❌ | ❌ | `adminOnly` | Visible solo admin |
| Solicitar derivación (técnico) | ❌ | ✅ | ✅ | `authWithTenantHost` | Visible solo técnico |
| Rechazar solicitud derivación | ✅ | ❌ | ❌ | `adminOnly` | Visible solo admin |
| Corregir coordenadas (geocode manual) | ✅ | ❌ | ❌ | `adminOnly` | Visible solo admin |
| Imprimir pedido | ✅ | ✅ | ✅ | N/A (local) | Sin restricción |
| Cargar avance con foto | ✅ | ✅ | ✅ | `PUT /api/pedidos/:id` | Sin restricción visual |
| Cerrar pedido | ✅ | ✅ | ✅ | `PUT /api/pedidos/:id` | Sin restricción visual |
| **Panel Administración** |
| Abrir panel admin | ✅ | ❌ | ❌ | N/A (JS local) | `#btn-admin` oculto para no-admin |
| Gestionar usuarios | ✅ | ❌ | ❌ | `adminOnly` (todas las rutas `/api/usuarios`) | Pestaña Usuarios en panel admin |
| Ver/editar configuración tenant | ✅ | ❌ | ❌ | `adminOnly` | Pestaña Empresa en panel admin |
| Ver estadísticas | ✅ | ❌ | ❌ | `adminOnly` (`/api/estadisticas`) | Pestaña Estadísticas |
| Ver KPIs | ✅ | ❌ | ❌ | N/A (Neon directo) | Pestaña KPI piloto |
| Gestionar socios/catálogo (import, export) | ✅ | ❌ | ❌ | `adminOnly` (`/api/socios/exportar`) | Pestaña Vecinos |
| Ver barrios/zonas | ✅ | ❌ | ❌ | `adminOnly` (infraAfectados CRUD) | Pestaña Barrios/Zonas |
| Cambiar contraseña propia | ✅ | ✅ | ✅ | `authWithTenantHost` | Pestaña Contraseña (visible para todos) |
| **WhatsApp / Comunicaciones** |
| Enviar aviso masivo (broadcast) | ✅ | ❌ | ❌ | `adminOnly` (`/api/whatsapp/broadcast/*`) | Modal desde panel admin |
| Generar mensaje con IA (avisos) | ✅ | ❌ | ❌ | `adminOnly` (`/api/ia/generar-aviso`) | Botón IA en modal broadcast |
| Chat humano con cliente | ✅ | ❌ | ❌ | `adminOnly` (`/api/whatsapp-human-chat`) | Solo admin |
| Notificar al cliente por WhatsApp | ✅ | ✅ | ✅ | `authWithTenantHost` | Botón en detalle pedido |
| **IA / Análisis** |
| Sugerir clasificación (nuevo pedido) | ✅ | ✅ | ✅ | `authWithTenantHost` (`/api/ia/clasificar-reclamo`) | Botón en formulario |
| Analizar reclamos con IA | ✅ | ❌ | ❌ | `adminOnly` (`/api/ia/analizar-reclamos`) | Botón visible solo admin |
| Sugerir KPIs con IA | ✅ | ❌ | ❌ | `adminOnly` (`/api/ia/sugerir-kpis`) | Botón visible solo admin |
| **Dashboard / Mapa** |
| Ver mapa con pedidos | ✅ | ✅ | ✅ | `authWithTenantHost` | Sin restricción |
| Dashboard gerencia | ✅ | ❌ | ❌ | N/A (frontend) | `#btn-dashboard-gerencia` oculto |
| Filtros avanzados (derivados, desestimados) | ✅ | ❌ | ❌ | N/A (frontend) | Checkboxes ocultos |
| Toggle "Ver todos los pedidos" | ❌ | ✅ | ✅ | N/A (frontend) | `#wrap-toggle-ver-todos` |
| **Wizard / Setup** |
| Crear nuevo tenant | ❌ | ✅ (con clave) | ✅ (con clave) | `adminOrTechnicianWizardKey` | Wizard con validación de clave |
| **Incidencias** |
| Crear/cerrar grupo de incidencia | ✅ | ✅ | ✅ | `adminOrTecnicoIncidencias` | Sin restricción visual |
| **Android nativo** |
| Tracking GPS en background | N/A | ✅ | ✅ | UbicacionWorker filtra por rol | Solo técnico/supervisor |
| Descargar/compartir imagen | ✅ | ✅ | ✅ | N/A (bridge nativo) | Sin restricción |
| Notificaciones push | ✅ | ✅ | ✅ | FCM | Sin restricción |

---

## Middlewares de autorización (API)

| Middleware | Archivo | Roles permitidos |
|------------|---------|------------------|
| `adminOnly` | `api/middleware/auth.js` | admin, administrador |
| `adminOrTechnicianWizardKey` | `api/middleware/auth.js` | admin + (técnico/supervisor con `GESTORNOVA_TECHNICIAN_TENANT_KEY`) |
| `adminOrTecnicoIncidencias` | `api/middleware/auth.js` | admin, técnico, supervisor |
| `authWithTenantHost` | `api/middleware/auth.js` | Cualquier usuario autenticado y activo |

---

## Hallazgos de la auditoría (mayo 2026)

### Corregidos

| Ruta | Antes | Después | Riesgo |
|------|-------|---------|--------|
| `POST /api/ia/generar-aviso` | `authWithTenantHost` | `authWithTenantHost, adminOnly` | Bajo (broadcast sí estaba protegido) |
| `POST /api/ia/analizar-reclamos` | `authWithTenantHost` | `authWithTenantHost, adminOnly` | Bajo (frontend ya ocultaba) |
| `POST /api/ia/sugerir-kpis` | `authWithTenantHost` | `authWithTenantHost, adminOnly` | Bajo (frontend ya ocultaba) |

### Sin problemas

- Panel admin (`#btn-admin`): correctamente oculto para técnicos via `esAdmin()`.
- Rutas de usuarios, estadísticas, broadcast, admin DB: todas protegidas con `adminOnly`.
- Android WebView: usa el mismo JS → mismas restricciones visuales.
- No se encontraron fugas críticas de permisos.

---

## Paridad Web / Android

El WebView de Android carga **exactamente el mismo** `app.js` e `index.html` que la versión web (GitHub Pages). La lógica de `esAdmin()` / `esTecnicoOSupervisor()` es idéntica en ambas plataformas. La única diferencia nativa es:

- **UbicacionWorker** (GPS background): solo se activa si el rol guardado en SharedPreferences es `tecnico` o `supervisor`.
- **AndroidSession bridge**: guarda userId + rol para que el Worker nativo sepa quién es el usuario.

No hay permisos adicionales a nivel Kotlin que contradigan la lógica web.

---

*Documento generado automáticamente. Última revisión: mayo 2026.*
