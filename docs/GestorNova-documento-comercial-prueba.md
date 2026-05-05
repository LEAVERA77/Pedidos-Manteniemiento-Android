# GestorNova — Documento para conocer el programa (prueba piloto / decisión)

*Texto pensado para equipos directivos y operativos que quieren **entender qué hace el sistema** sin jargon técnico. Sirve como base para una **prueba controlada** en la entidad.*

---

## En una frase

**GestorNova** centraliza los reclamos y el trabajo de campo: la **oficina** coordina todo desde una aplicación web y las **cuadrillas** actualizan cada pedido desde el celular, con el vecino informado por **WhatsApp** cuando corresponde.

---

## El problema que resuelve

Muchas entidades conviven hoy con mensajes sueltos (WhatsApp interno, llamadas, planillas), pedidos sin dueño y poca visibilidad de **qué pasó, cuándo y quién lo hizo**. GestorNova ordena el flujo en **un solo lugar**, con **historial** y **mapa**, para priorizar mejor y dar respuesta más rápida al usuario final.

---

## Dos pantallas, misma información

| Quién | Dónde trabaja | Para qué |
|--------|----------------|----------|
| **Administración / despacho** | Navegador (PC o tablet), como una web moderna | Ver el tablero de pedidos, asignar cuadrillas, comunicar, auditar cierres |
| **Técnicos / cuadrillas** | App **Android** | Recibir asignaciones, cargar avances, fotos, materiales y cierre en campo |

La lógica de negocio es **la misma** en ambos lados: menos errores y menos “versiones distintas” del proceso.

---

## Características destacadas (lenguaje simple)

### 1. Tablero de pedidos con vida propia

Cada reclamo es un **pedido** con estado (pendiente, asignado, en ejecución, cerrado, etc.), **porcentaje de avance** y datos del cliente y la ubicación. Se puede **filtrar** por estado, tipo de trabajo, zona y prioridad para trabajar lo urgente primero.

### 2. Mapa para decidir con el territorio

Hay **vista de mapa** para ver dónde están los reclamos, **asignar con criterio geográfico** y **corregir** una ubicación si hace falta. La geocodificación está pensada para direcciones reales (calle, ciudad, país), con mecanismos de respaldo si algo no resuelve a la primera.

### 3. WhatsApp al vecino (no solo “interno”)

Si el reclamo entra por el canal de WhatsApp o está cargado con teléfono válido, el sistema puede **avisar automáticamente** en momentos clave: cuando el pedido entra en ejecución, cuando hay **avance** y cuando se **cierra**. Eso baja la cantidad de llamadas del tipo *“¿Ya vinieron?”* y mejora la **percepción de servicio**.

**Extra para la entidad:** herramientas de **difusión** (por ejemplo avisos generales o cortes programados, según configuración y rubro), siempre con controles y límites de envío para no saturar el canal.

### 4. Bot de WhatsApp para cargar reclamos

Los vecinos pueden iniciar un reclamo **conversando con un bot** (flujo guiado), que deja el pedido registrado en el mismo sistema que usa la oficina. Menos pasamanos y menos pérdida de datos.

### 5. App Android pensada para la calle

Los técnicos ven sus pedidos, actualizan estado y avance, pueden cargar **fotos** (incluida **foto de cierre**), **materiales utilizados**, **observaciones del trabajo realizado** y, cuando aplica, **firma del cliente**. Reciben **notificaciones** cuando el despacho les asigna una tarea.

### 6. Varias “líneas de negocio” en la misma entidad

El sistema está preparado para contextos como **cooperativa eléctrica**, **agua** o **municipio**: catálogos y operación pueden **separarse por tipo de negocio** sin mezclar reclamos de un rubro con otro. Cambiar de vista **no borra** datos históricos.

### 7. Incidencias: varios pedidos, un mismo evento

Cuando hay **varios reclamos del mismo origen** (misma calle, mismo transformador, misma zona, etc.), la oficina puede **agruparlos en una incidencia** para seguimiento conjunto. El administrador puede **cerrar todos los pedidos de una vez** cargando **una sola vez** foto de cierre, materiales y observaciones, que quedan **registradas en cada pedido** para auditoría.

### 8. Derivación y trabajo con terceros

Hay flujo para **solicitar o registrar derivación** a terceros cuando el tipo de trabajo lo permite (normas alineadas entre pantalla y servidor), sin hardcodear solo un rubro: está pensado para **todos los tenants**.

### 9. Socios / suministros (NIS, medidor, catálogo)

La entidad puede mantener un **catálogo de socios** con datos operativos (por ejemplo **NIS** y **medidor** donde aplique), útil para cruzar información con lo que reporta el vecino y para **mejorar la calidad** de los datos en el tiempo.

### 10. Estadísticas y paneles

Hay **indicadores y reportes** orientados a gestión (volumen de trabajo, cierres, métricas configurables según el despliegue). Sirven para reuniones de seguimiento y para mostrar resultados con números, no solo con impresiones.

### 11. Seguridad y multi-entidad (multi-tenant)

Cada **cliente/entidad** tiene sus datos **aislados**. Hay **usuarios y roles** (por ejemplo acciones reservadas al administrador), sesión con token, validaciones en servidor y límites de uso en rutas sensibles. Las integraciones de WhatsApp usan **webhooks verificados**.

### 12. Continuidad y respaldo

El proyecto contempla **política de respaldo** y procedimientos de recuperación para no quedar detenidos ante un fallo humano o de equipo (detalle operativo en documentación técnica).

---

## Qué puede esperar una entidad en una **prueba piloto**

1. **Alta de usuarios** (administradores y técnicos) y configuración acorde al rubro.  
2. Uso real de **pedidos** durante un período acotado (por ejemplo 2–4 semanas).  
3. Medición simple: tiempo de respuesta, pedidos cerrados con evidencia (foto/materiales), reclamos ingresados por WhatsApp vs otros canales.  
4. Revisión conjunta: qué funcionó, qué habría que ajustar en catálogos o comunicación al vecino.

---

## Qué necesitan saber quienes evalúan compra

- **No es solo una app:** es **web + Android + servidor + base de datos**, integrados.  
- **El WhatsApp** cumple políticas del proveedor (Meta u otros según despliegue); los números y plantillas deben estar **habilitados** según reglas vigentes.  
- **La dirección y el mapa** mejoran mucho si los datos de calle/localidad están cargados con criterio; el sistema ayuda con geocodificación y corrección manual.

---

## Cierre

GestorNova apunta a una gestión **ordenada, trazable y medible** de reclamos y trabajos en campo, con **comunicación clara al ciudadano** y **control para la entidad**. Este documento resume lo esencial para **poner el programa a prueba** con expectativas alineadas entre dirección, despacho y cuadrillas.

---

*¿Querés una versión en PDF o un folleto de una página? Se puede derivar de este mismo contenido.*

made by leavera77
