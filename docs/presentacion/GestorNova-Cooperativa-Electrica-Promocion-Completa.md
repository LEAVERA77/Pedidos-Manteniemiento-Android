# GestorNova para Cooperativas Eléctricas

**Guía completa en lenguaje sencillo** · Para promoción comercial y presentaciones · Mayo 2026

---

## ¿Qué es GestorNova?

**GestorNova** es un sistema pensado para que una **cooperativa eléctrica** (o distribuidora de energía) organice **todos los reclamos del socio** en un solo lugar: desde que el vecino avisa por **WhatsApp** o llama a oficina, hasta que la **cuadrilla cierra el trabajo** en la calle con **fotos y evidencias**.

No reemplaza la pasión del trabajo en campo: **ordena** la operación, **avisa** al socio en los momentos importantes y deja **trazabilidad** para gerencia, regulación y mejora del servicio.

### Tres piezas que trabajan juntas

| Pieza | Quién la usa | Para qué sirve |
|--------|----------------|----------------|
| **Panel web (administración)** | Despacho, gerencia, administración | Ver el mapa, asignar cuadrillas, estadísticas, red eléctrica, socios, WhatsApp masivo, derivaciones. |
| **App Android** | Técnicos y cuadrillas en la calle | Lista y mapa, GPS, fotos, materiales, firma, cierre, chat con oficina, modo sin internet. |
| **Servidor (API + base de datos)** | Automático | Guarda todo, envía WhatsApp al socio, notificaciones push, geocerca, encuestas de satisfacción. |

El administrador puede entrar también desde la app Android si hace falta; la lógica es la misma.

---

## 1. Reclamos de punta a punta (ciclo de vida)

### 1.1 Estados del pedido

Cada reclamo pasa por etapas claras que todo el equipo entiende:

- **Pendiente:** ingresó el reclamo, aún no tiene técnico asignado.
- **Asignado:** ya tiene cuadrilla responsable.
- **En ejecución:** el técnico está trabajando en el lugar (o en gestión activa).
- **Cerrado:** trabajo terminado, con descripción, fotos y cierre formal.

Además el sistema maneja casos especiales: **desestimados**, **derivados a terceros** (fuera de la operativa habitual) y pedidos ligados a una **incidencia** (varios reclamos por un mismo evento, por ejemplo un trafo o una zona).

### 1.2 Panel de pedidos y mapa

- **Lista** con filtros por estado (pendientes, asignados, en ejecución, cerrados).
- **Mapa** con todos los reclamos geolocalizados para decidir prioridades por zona.
- Filtros por **tipo de trabajo**, **prioridad**, **zona**, y opciones como “solo agrupados en incidencia”, “desestimados” o “derivados fuera”.
- Al hacer clic en un reclamo se abre el **detalle completo** en un modal: datos del socio, dirección, tipo, avance, fotos, materiales, historial y acciones.

### 1.3 Alta de reclamos desde oficina

- El administrador puede **cargar un reclamo nuevo** desde el panel (con mapa, búsqueda en padrón de socios, tipo de trabajo, prioridad).
- Vinculación con **NIS** y **medidor** del catálogo de socios.
- Selección de **distribuidor** y datos de **red** (trafo, etc.) cuando corresponde.
- Corrección manual de **ubicación en mapa** si la geocodificación no fue exacta.
- Herramientas de **re-geocodificación** para mejorar direcciones automáticamente.

### 1.4 Asignación y reasignación

- Desde el detalle se **asigna o cambia el técnico** responsable.
- El técnico recibe **notificación en el celular** (cola en base de datos + aviso push cuando está configurado).
- Se puede **desasignar** o **volver el pedido a pendiente** según la operación de la cooperativa.
- **Notificación a oficina** cuando el técnico pide derivar el caso a un tercero.

### 1.5 Avance, materiales y cierre

- Porcentaje de **avance** durante la ejecución (con reglas para no “bajar” el avance por error).
- Carga de **materiales** usados en el trabajo.
- **Trabajo realizado** y observaciones al cerrar.
- **Foto de cierre** y galería de fotos del reclamo.
- **Firma del socio** cuando la operación lo requiere.
- **Checklist de seguridad** al cerrar (adaptado a electricidad): EPPS verificados, corte o seccionamiento de energía, señalización del lugar.

### 1.6 Exportación e informes

- **Exportación a Excel** de pedidos para análisis externo o reportes.
- **Informes y estadísticas** imprimibles o en PDF desde el panel.
- **Dashboard de gerencia** para seguimiento en tiempo casi real.

---

## 2. Tipos de reclamo (cooperativa eléctrica)

El catálogo incluye los motivos habituales de una cooperativa. El vecino los elige por **menú numerado en WhatsApp**; en oficina y en la app aparecen los mismos tipos:

| # | Tipo de reclamo | Prioridad sugerida |
|---|-----------------|-------------------|
| 1 | Corte de Energía | Alta |
| 2 | Cables Caídos/Peligro | Crítica |
| 3 | Problemas de Tensión | (según reglas del sistema) |
| 4 | Poste Inclinado/Dañado | |
| 5 | Consumo elevado | |
| 6 | Alumbrado Público (Mantenimiento) | |
| 7 | Riesgo en la vía pública | |
| 8 | Corrimiento de poste/columna | |
| 9 | Pedido de factibilidad (nuevo servicio) | |
| 10 | Denuncia de fraude (anónima) | |
| 11 | Otros | |

**Opción 0 — Mis reclamos:** el socio consulta por WhatsApp sus pedidos abiertos sin hablar con un operador.

**Prioridad automática:** para varios tipos el sistema propone prioridad (por ejemplo **Crítica** en cables caídos, **Alta** en corte de energía) para que despacho ordene mejor la cola.

---

## 3. Catálogo de socios (NIS y medidor)

- Base de **socios/usuarios** con **NIS**, **medidor**, apellido, dirección y datos del padrón.
- **Importación masiva desde Excel** con plantilla acorde al rubro eléctrico.
- Búsqueda rápida por **NIS**, **medidor**, **apellido** o **dirección** al cargar un reclamo.
- Historial de pedidos del socio desde administración.
- En reclamos por WhatsApp, si el socio tiene **NIS en padrón**, se enriquece el pedido; si no, se puede trabajar con dirección y teléfono.

### Avisos masivos y consentimiento (WhatsApp)

- Comandos **STOP** y **ALTA** para que el socio gestione si quiere recibir **comunicaciones masivas** de la cooperativa.
- Respeta buenas prácticas de mensajería y auditoría de envíos.

---

## 4. Red eléctrica, distribuidores y trafos

### 4.1 Red eléctrica (fuente principal en cooperativas)

- Importación desde **Excel de Red Eléctrica**: distribuidores, **nivel de tensión (kV)**, **transformadores**, **KVA**, cantidad de **clientes** por tramo.
- Los datos viven en la tabla operativa **`distribuidores_red`** (no mezclados con módulos viejos de “distribuidores” que en eléctrico suelen estar ocultos).
- Al crear un pedido, el operador elige **distribuidor** desde esa red.
- En el detalle del pedido se muestra el **trafo** asociado cuando está cargado.

### 4.2 Asignación inteligente en reclamos anónimos (WhatsApp)

- Si el vecino hace un reclamo **sin NIS** (por ejemplo fraude anónimo o solo con ubicación), el sistema puede **sugerir distribuidor y trafo** según la **ubicación más cercana** en el catálogo de socios (cálculo por proximidad). Así oficina no empieza de cero.

### 4.3 SAIDI y SAIFI

- Indicadores de **continuidad del servicio** (**SAIDI** y **SAIFI**) calculados con datos de la red importada.
- Gráficos y vistas en el panel de **Estadísticas** para gerencia y cumplimiento normativo.
- Base única: red + reclamos + tiempos, en lugar de planillas sueltas.

---

## 5. WhatsApp con el socio

### 5.1 Bot de reclamos (menú guiado)

- El socio escribe al número de la cooperativa y recibe un **menú con tipos de reclamo**.
- Flujo paso a paso: tipo → datos → ubicación (o NIS) → confirmación.
- Puede enviar **una foto** del problema (galería o cámara).
- Mensaje de **número de pedido** cuando queda registrado.
- Comando **menú** para volver al inicio.

### 5.2 Denuncia de fraude anónima

- Tipo dedicado **sin obligar nombre ni NIS**.
- Fotos opcionales.
- Útil para línea de ética o fraudes de medición sin exponer al denunciante.

### 5.3 “Otros” y chat con representante humano

- Si el socio elige **Otros**, puede pasar a **hablar con un representante** por el mismo WhatsApp.
- En oficina aparece aviso y **ventana de chat operador** (mensajes guardados en base de datos).
- El administrador responde desde el panel; el mensaje sale por la API hacia Meta/WhatsApp.

### 5.4 Avisos automáticos al socio (reclamos normales)

Cuando el reclamo tiene teléfono válido y el flujo está activo, el sistema avisa al socio en momentos clave **sin que un operador escriba a mano cada vez**:

- Al pasar el pedido a **en ejecución** (cuadrilla en camino o trabajando).
- Al **cambiar el avance** (mientras está asignado o en ejecución).
- Al **cerrar** el reclamo.

Así bajan las llamadas de “¿ya vienen?” y mejora la imagen de la cooperativa.

### 5.5 Encuesta de satisfacción después del cierre

- Tras cerrar, el socio recibe por WhatsApp pedido de **valoración de 1 a 5 estrellas** y comentario opcional.
- La respuesta queda guardada en el pedido (visible en administración).
- Si la valoración es **baja**, oficina puede registrar un **descargo de la empresa**, **reabrir el pedido** a pendiente, **reasignar técnico** y repetir el ciclo hasta resolver la insatisfacción.
- Tras un nuevo cierre, el socio puede **volver a puntuar**; si vuelve a puntuar mal, se reactiva el flujo de descargo.

### 5.6 Avisos masivos a la comunidad

- Desde el panel (botón de avisos, solo administrador):
  - **Aviso general** a muchos socios (texto con placeholders: ciudad, fecha, dirección, teléfono de contacto, etc.).
  - **Corte programado** (zona, motivo, fecha/hora inicio y fin).
- Envío controlado en segundo plano con **límite de ritmo** para no bloquear la línea de WhatsApp.
- Registro de envíos para auditoría.
- Alertas si el **ratio de respuestas** de masivos es bajo (cuidado operativo).

### 5.7 Derivación a otras entidades (agua, otra energía)

- En configuración de empresa la cooperativa carga contactos WhatsApp de, por ejemplo, **cooperativa de agua** u **otra distribuidora eléctrica**.
- Si el reclamo es de electricidad pero el **tipo sugiere agua u otro rubro**, el panel muestra **derivación orientativa** para que el operador indique al socio a quién llamar.
- No mezcla rubros en la misma operativa diaria: cada entidad sigue en su tenant.

---

## 6. Coordinación en campo (geocerca, chat, fotos)

Funciones pensadas para **cooperativas de electricidad y agua** (Top 3 operativo):

### 6.1 Geocerca (estar en el lugar)

- La cooperativa define si la geocerca está **activa** y el **radio en metros** (por ejemplo 100 m).
- Cuando el técnico quiere poner el pedido **en ejecución**, la app pide **GPS** y verifica que esté cerca del punto del reclamo.
- Si está lejos, **no deja iniciar** (o muestra advertencia clara) y queda **registro del intento** para auditoría.
- El administrador ve el **historial de intentos** (distancia, si permitió o no, usuario y fecha).

### 6.2 Chat interno por pedido (oficina ↔ cuadrilla)

- Hilo de mensajes **dentro de cada reclamo**: administradores y técnicos escriben sin WhatsApp personal.
- Historial guardado en base de datos (trazabilidad).
- Si escribe el **admin**, el **técnico asignado** recibe notificación en el celular; si escribe el **técnico**, avisan los **administradores** del tenant (y el técnico asignado si es otro).
- En **Android**, el técnico tiene un **panel flotante** en el mapa (se arrastra, se oculta y se vuelve a abrir) para chatear sin salir del mapa.
- El **administrador** recibe un **aviso clicable** (“Mensaje en reclamo…”): al tocarlo se abre el **detalle del pedido** con la sección de chat lista para responder.

### 6.3 Fotos clasificadas (antes / después)

- Además de las fotos clásicas del pedido, se pueden subir fotos etiquetadas como **antes**, **después** u **otras**.
- Orden y tipo explícitos para informes y reclamos regulatorios.
- Almacenamiento en la nube (Cloudinary) vía API.

---

## 7. Incidencias (un evento, varios reclamos)

Cuando **varios socios reportan lo mismo** (mismo trafo, misma calle, mismo apagón):

1. El administrador **marca varios pedidos abiertos** y los **agrupa en una incidencia**.
2. Ve el progreso conjunto y puede **asignar un técnico a todos los pedidos abiertos** de la incidencia de una vez.
3. Puede **cerrar todos** con un asistente que replica trabajo realizado, foto y materiales en cada pedido (según reglas).
4. Los técnicos pueden **proponer agrupación** en pedidos que tengan asignados y en estado compatible.
5. Reglas específicas para **cooperativa eléctrica** en la UI de incidencias.

Resultado: un solo seguimiento para el apagón de la zona, no diez pantallas sueltas.

---

## 8. Derivación a terceros y trabajo externo

- **Solicitud del técnico en campo:** pide derivar el reclamo a un tercero (empresa externa, otro organismo) con motivo; avisa a administración.
- **Derivación operativa desde oficina:** el admin gestiona el caso derivado (visible en listados con filtro “derivados fuera”).
- Tipos de trabajo que **permiten solicitud de derivación** alineados entre panel y API (incluye tipos de la cooperativa eléctrica).
- Integración con **chat humano WhatsApp** en flujos de derivación cuando aplica.

---

## 9. App Android para cuadrillas

### 9.1 Uso diario

- Lista de pedidos asignados y **mapa** con ubicación del técnico.
- Detalle del reclamo con los mismos datos que ve oficina (adaptado a pantalla chica).
- Botones de **ir al GPS**, **zoom en mapa**, fotos desde cámara.
- Actualización de **estado y avance**, **materiales**, **cierre** y **firma**.

### 9.2 Sin internet (modo offline)

- Trabajo en zonas con mala señal: los cambios se **encolan** y **sincronizan** al recuperar conexión.
- Badge de pendientes offline para que el técnico sepa qué falta subir.

### 9.3 Notificaciones

- Aviso cuando **asignan** un pedido nuevo.
- Aviso de **mensaje en el chat interno** del reclamo.
- Integración con notificaciones locales en Android.

### 9.4 Rendimiento en gama media

- Interfaz optimizada para celulares tipo **Samsung A16** y similares: modales livianos, mapa que no se traba con el detalle abierto, paneles que se pueden mover y ocultar.

---

## 10. Inteligencia artificial (apoyo a despacho)

- **Priorización sugerida** de reclamos en el listado (qué atender antes).
- **Detección de posibles duplicados** (mismo socio, misma zona, tipo parecido).
- **Análisis de reclamos** con enfoque en socios, red y tipos de trabajo (pestaña de estadísticas en eléctrico).
- **KPIs sugeridos** según el rubro.
- **Informe unificado** asistido para gerencia.
- **Borrador de texto con IA** en el chat humano de WhatsApp (el operador revisa antes de enviar).
- **Sugerencia de tipo de reclamo** al cargar pedidos.

La IA **ayuda a decidir**; la cooperativa sigue teniendo el control operativo.

---

## 11. Administración, usuarios y seguridad

### 11.1 Roles

| Rol | En general puede |
|-----|------------------|
| **Administrador** | Todo: configuración, usuarios, masivos WhatsApp, estadísticas SAIDI, geocerca, cerrar y reabrir, incidencias. |
| **Técnico / cuadrilla** | Sus pedidos asignados, avances, fotos, cierre, chat, geocerca al iniciar. |
| **Supervisor** | Según permisos configurados (cercano al técnico o con más visibilidad). |

### 11.2 Configuración de empresa

- Datos de la cooperativa, rubro **cooperativa eléctrica**, logo y textos.
- WhatsApp (Meta / canal configurado en servidor).
- Geocerca: activar/desactivar y metros.
- Derivaciones a otras entidades.
- Wizard de **primer ingreso** y credenciales.

### 11.3 Multitenant (varias cooperativas en una plataforma)

- Cada cooperativa tiene sus datos **aislados** (pedidos, socios, usuarios, red).
- Un mismo despliegue puede servir **varios clientes** sin mezclar información.

### 11.4 Seguridad (resumen no técnico)

- Entrada con **usuario y contraseña**; sesión con token.
- Permisos por rol; acciones sensibles solo para admin.
- Límites de uso en API; verificación de webhooks de WhatsApp.
- Copias de respaldo y procedimientos de recuperación documentados para el equipo técnico.

---

## 12. Estadísticas, calidad y mejora continua

- Gráficos de pedidos por estado, tipo, zona y período.
- **SAIDI / SAIFI** ligados a la red eléctrica importada.
- Valoraciones **WhatsApp post-cierre** visibles en el detalle (estrellas y comentario).
- Banner en administración cuando hay **valoración baja** pendiente de gestión.
- Exportaciones para reuniones de directorio o entes reguladores.

---

## 13. Valor para promocionar la cooperativa

### Para el socio (usuario de la línea)

- Reclama **fácil por WhatsApp**, con menú claro.
- Recibe **avisos** cuando la cuadrilla trabaja y cuando termina.
- Puede **valorar** el servicio; si algo salió mal, la cooperativa tiene un **proceso de respuesta** (descargo y nueva atención).

### Para despacho y gerencia

- **Un solo tablero** y mapa en lugar de planillas y grupos de WhatsApp desordenados.
- **Asignación con criterio** (prioridad, zona, IA, incidencias).
- **Red eléctrica y SAIDI** en el mismo sistema que los reclamos.
- **Evidencia** de cierre: fotos, checklist de seguridad, firma, chat interno archivado.

### Para las cuadrillas

- Todo en el **celular**: menos idas y vueltas a oficina.
- **Geocerca** que respalda que estuvieron en el lugar.
- **Chat con oficina** sin mezclar vida personal.
- **Offline** en zona rural.

### Para directorio y regulación

- Trazabilidad de **quién hizo qué y cuándo**.
- Indicadores **SAIDI/SAIFI** y volumen de reclamos por tipo.
- Historial de **comunicaciones masivas** y encuestas de satisfacción.

---

## 14. Resumen de funciones (checklist promocional)

Use esta lista en folletos o demos; cada ítem está implementado en GestorNova para el rubro **cooperativa eléctrica**:

- [ ] Panel web + mapa + filtros avanzados  
- [ ] Alta y edición de pedidos desde oficina  
- [ ] Asignación / reasignación / volver a pendiente  
- [ ] Estados, avance %, materiales, cierre, firma  
- [ ] Checklist de seguridad eléctrica al cerrar  
- [ ] Catálogo de socios (NIS, medidor) + import Excel  
- [ ] Red eléctrica (Excel) + selector de distribuidor y trafo  
- [ ] SAIDI / SAIFI en estadísticas  
- [ ] Bot WhatsApp con menú de tipos de reclamo eléctrico  
- [ ] Mis reclamos, foto en reclamo, fraude anónimo  
- [ ] Chat humano para tipo “Otros”  
- [ ] Avisos automáticos al socio (ejecución, avance, cierre)  
- [ ] Encuesta 1–5 post-cierre + descargo y reapertura si insatisfacción  
- [ ] Avisos masivos y cortes programados por WhatsApp  
- [ ] STOP / ALTA para consentimiento de masivos  
- [ ] Geocerca al iniciar ejecución + historial admin  
- [ ] Chat interno pedido + panel flotante Android + toast admin clicable  
- [ ] Fotos clasificadas antes / después  
- [ ] Incidencias (agrupar, asignar todos, cerrar todos)  
- [ ] Derivación a terceros (técnico y admin)  
- [ ] Derivación informativa a agua / otra energía  
- [ ] App Android + notificaciones + modo offline  
- [ ] IA: priorización, duplicados, análisis, KPIs, informes  
- [ ] Export Excel, informes PDF, dashboard gerencia  
- [ ] Multitenant, roles, auditoría básica en pedido  

---

## 15. Cómo se despliega (una frase para el cliente)

La cooperativa usa el **panel en el navegador** (también instalable como PWA); las cuadrillas instalan la **app Android**; el **servidor en la nube** conecta WhatsApp, guarda datos y envía notificaciones. La implementación concreta (dominio, número de WhatsApp, capacitación) se acuerda en el proyecto de adopción.

---

*Documento de promoción basado en el producto GestorNova / Nexxo y documentación operativa del repositorio. Ajustar nombre comercial, URLs y alcance del contrato según cada cooperativa.*

*made by leavera77*
