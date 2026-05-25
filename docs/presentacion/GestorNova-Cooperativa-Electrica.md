# GestorNova — Cooperativa eléctrica

**Presentación de producto** · Mayo 2026

---

## Resumen ejecutivo

GestorNova centraliza el ciclo completo del reclamo: ingreso (web, WhatsApp o app), asignación en mapa, trabajo de cuadrilla en Android, cierre con evidencias y comunicación al socio.

| Área / función | Qué incluye |
|----------------|-------------|
| **Panel web — Pedidos** | Listado, mapa Leaflet, filtros por estado/tipo/prioridad/zona, detalle con avances, fotos, materiales, firma y cierre. |
| **Asignación e IA** | Asignación a cuadrillas, notificación push, priorización sugerida por IA, detección de duplicados, exportación Excel. |
| **Red eléctrica** | Importación Excel de red (distribuidores, nivel tensión kV, trafos, KVA, clientes). Select Dist. en pedido nuevo. |
| **SAIDI / SAIFI** | Indicadores de continuidad y estadísticas operativas desde el panel. |
| **Catálogo socios** | NIS, medidor, importación masiva Excel, búsqueda por NIS, apellido y dirección. |
| **Derivación** | Derivación operativa a terceros; solicitud desde técnico en campo. |
| **Incidencias** | Agrupación de reclamos relacionados y clientes afectados. |
| **WhatsApp** | Bot de reclamos, avisos automáticos (ejecución, avance, cierre), masivos comunidad, chat humano, STOP/ALTA. |
| **App Android** | Cuadrillas: GPS, fotos, avances, materiales, firma, cierre; modo offline. |

---

## 1. Público objetivo

Cooperativas y distribuidoras eléctricas: cortes, tensión, postes, cables, alumbrado, fraude, vínculo con red y métricas **SAIDI/SAIFI**.

## 2. Canales de ingreso

- Panel web del administrador (GitHub Pages / PWA).
- WhatsApp con menú guiado para el socio.
- App Android para cuadrillas técnicas.
- Catálogo de socios con NIS y medidor.

## 3. Panel web — Gestión de pedidos

- Listado y mapa con filtros por estado, tipo de trabajo, prioridad y zona.
- Detalle del pedido: avances, fotos, materiales, firma del socio y cierre.
- Asignación a cuadrillas con notificación push al técnico.
- Priorización sugerida por inteligencia artificial.
- Detección de pedidos duplicados.
- Exportación a Excel y corrección manual de geocodificación.

### 3.1 Red eléctrica e indicadores

- Importación Excel **Red Eléctrica**: distribuidores, nivel de tensión (kV), transformadores, KVA y clientes.
- Selector de distribuidor en pedido nuevo desde tabla `distribuidores_red`.
- Estadísticas **SAIDI** y **SAIFI** en el panel de informes.

### 3.2 Catálogo de socios

- Importación masiva desde Excel con plantilla por rubro.
- Búsqueda por NIS, medidor, apellido y dirección en padrón.
- Opt-in de avisos masivos: comandos **STOP** y **ALTA** por WhatsApp.

### 3.3 Derivación e incidencias

- Derivación operativa a terceros desde oficina.
- Solicitud de derivación desde la app del técnico.
- Incidencias agrupadas y registro de clientes afectados.

### 3.4 WhatsApp

- Bot: alta de reclamos, consulta *mis reclamos*, denuncia de fraude anónima.
- Avisos automáticos al socio en ejecución, cambio de avance y cierre.
- Avisos masivos a la comunidad y cortes programados.
- Chat humano para operador y borrador de texto con IA.

### 3.5 Administración

- Usuarios: administrador, técnico y supervisor.
- Configuración de empresa y multitenant aislado por cliente.
- Estadísticas, KPIs e informes exportables.

## 4. App Android para cuadrillas

- Lista y mapa con ubicación GPS del técnico.
- Carga de fotos, avances y materiales en campo.
- Firma del socio y cierre del reclamo.
- Operación offline con sincronización al recuperar red.

## 5. Tipos de reclamo (cooperativa eléctrica)

- Corte de energía; cables caídos o peligro; problemas de tensión.
- Poste inclinado o dañado; consumo elevado; alumbrado público.
- Riesgo en vía pública; corrimiento de poste; factibilidad de servicio.
- Denuncia de fraude anónima; otros.

## 6. Inteligencia artificial

- Clasificación y priorización de reclamos.
- Análisis de reclamos (socios, red, tipos de trabajo).
- KPIs sugeridos y asistencia en redacción.

## 7. Valor para la cooperativa

- Trazabilidad completa y evidencia de cierre.
- Mejor atención al socio con avisos por WhatsApp.
- Base única para red eléctrica y cálculo SAIDI/SAIFI.

---

## Anexo: WHAPI_BROADCAST_BLOCK_ON_LOW_RATIO

- **Por defecto:** DESACTIVADA (variable `0` o ausente en Render).
- **Con valor `1`:** bloquea nuevos envíos masivos solo si hay alerta de ratio bajo sostenido.
- **Criterio de alerta:** ratio de respuestas menor al 20 % durante 3 días seguidos en ventana de 7 días.

*made by leavera77*
