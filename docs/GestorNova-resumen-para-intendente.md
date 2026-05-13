# GestorNova — Resumen para la gestión municipal

**Documento orientado a intendencia y equipo político.** Lenguaje simple, sin jerga innecesaria.  
*Última actualización: mayo 2026.*

---

## 1. ¿Qué es GestorNova en una frase?

Es un **sistema integral para registrar, organizar, asignar y cerrar reclamos** (luminarias, baches, poda, alumbrado, etc.), con **panel de gestión en la oficina** (navegador / computadora), **app para cuadrillas en la calle** (Android) y **comunicación automática con el vecino por WhatsApp** cuando corresponde.

Todo queda **centralizado, trazable y con respaldo** en la nube: no depende de un solo Excel ni de grupos de WhatsApp sueltos para saber “en qué estado está” cada pedido.

---

## 2. Dos “mundos” que trabajan juntos

| Quién lo usa | Para qué sirve |
|--------------|----------------|
| **Oficina / administración** | Carga y gestiona reclamos, ve mapa, asigna cuadrillas, estadísticas, catálogo de vecinos/socios, configuración. |
| **Cuadrillas / técnicos (Android)** | Reciben lo asignado, van al lugar, cargan fotos, avances y cierre; no tienen que “llevar el papel”. |

La misma información vive en un solo sistema: lo que define la oficina **se ve en campo**; lo que hace el técnico **se refleja en la oficina** al instante.

---

## 3. Funciones principales (versión web — oficina)

- **Listado y mapa de pedidos**: ver reclamos por estado (pendiente, asignado, cerrado), filtrar, exportar a Excel cuando hace falta informar o auditar.
- **Detalle de cada reclamo**: datos del vecino, ubicación, tipo de trabajo, historial de avances, fotos, materiales, firma si aplica.
- **Asignación a cuadrillas**: el administrador asigna el trabajo; el técnico puede recibir **aviso en el celular** cuando le toca algo nuevo.
- **Catálogo de vecinos / socios** (según el tipo de entidad): importación desde planillas, columnas configurables, coordenadas cuando existen, útil para cruzar domicilio y datos de contacto.
- **Incidencias agrupadas**: cuando varios reclamos corresponden a un mismo hecho (por ejemplo una zona afectada), se pueden **agrupar** para gestionarlos en conjunto.
- **Derivaciones**: si un reclamo debe pasar a un tercero (otro área, cooperativa, etc.), el flujo está pensado para **documentar y dar seguimiento** sin perder el hilo.
- **Históricos y reportes**: consultar pedidos cerrados o desestimados sin mezclarlos con la operación del día a día.
- **Multi-entidad (multi-tenant)**: si en el futuro hubiera más de un “negocio” o línea bajo el mismo sistema, los datos quedan **separados** para no mezclar información entre organizaciones.

---

## 4. Funciones principales (app Android — cuadrillas)

La app está pensada para **trabajo en la calle**, con pantalla táctil y conectividad variable:

- **Lista de pedidos** asignados y estados claros.
- **Mapa y GPS**: ubicar el reclamo y, cuando aplica, registrar posición.
- **Fotos y evidencias** desde el dispositivo.
- **Avances y cierre** del reclamo desde el mismo lugar.
- **Materiales, firma del vecino** y otros datos de cierre según el tipo de trabajo.
- **Notificaciones**: avisos cuando el administrador asigna o actualiza algo relevante.
- La interfaz puede cargar la misma lógica que la web **embebida** en la app (navegador interno controlado), de modo que **oficina y campo** ven pantallas coherentes.

*Nota operativa:* en muchos despliegues la oficina usa la **web** y las cuadrillas la **app**; un responsable también puede usar la app si hace falta.

---

## 5. WhatsApp integrado (vecino)

No es “un chat aparte” suelto: el **servidor** envía mensajes al vecino en momentos definidos del flujo (por ejemplo cuando el pedido pasa a **en ejecución**, hay **avance** o se **cierra**), si el reclamo vino por ese canal y hay teléfono válido.

**Ventajas para la gestión:**

- El vecino **sabe qué pasa** con su reclamo sin llamar todo el tiempo a la municipalidad.
- Se **reduce la carga** de llamadas y mensajes manuales repetitivos.
- La comunicación queda **alineada al estado real** del pedido en el sistema.

El canal técnico (Meta / proveedor de WhatsApp Business) se configura en el **servidor**; no depende de que cada técnico “use el WhatsApp personal” para el trámite oficial.

---

## 6. Inteligencia artificial (IA) — ¿para qué sirve?

La IA **no reemplaza** a la administración ni a las cuadrillas: **ayuda a ordenar y a decidir más rápido** dentro de lo que ya está cargado en el sistema. Ejemplos de uso típico:

- **Priorización de la lista de pedidos** (por ejemplo en el panel lateral): sugerir orden de atención según urgencia, texto del reclamo y contexto.
- **Análisis de pedidos visibles**: resumir o detectar patrones en un conjunto de reclamos que el operador está mirando (útil en reuniones o picos de demanda).
- **Sugerencias en altas o textos** (según módulos activos): ayudar a clasificar o redactar de forma más homogénea.
- **Informes o KPIs con apoyo de IA** (donde esté habilitado): acelerar la lectura de grandes volúmenes para informar a jefatura o al Concejo.

**Importante:** la decisión final sigue siendo **humana**; la IA acelera lectura y ordenamiento. Los datos sensibles deben manejarse con las mismas buenas prácticas que cualquier sistema municipal (usuarios, roles, respaldos).

---

## 7. Ventajas del programa (gestión)

1. **Un solo lugar** para el estado de cada reclamo (no “versiones” dispersas).
2. **Trazabilidad**: quién hizo qué y cuándo (mejora transparencia y respuesta a pedidos de información pública).
3. **Mejor uso del tiempo** de oficina y de cuadrillas (menos idas y vueltas y menos reprocesos).
4. **Mapa y territorio**: decisiones más claras por zona, especialmente en municipios grandes o con varias cuadrillas.
5. **Comunicación con el vecino** más ordenada por WhatsApp donde esté integrado.
6. **Escalabilidad**: si crece el volumen de reclamos, el esquema sigue sosteniendo listados, filtros y asignaciones.

---

## 8. Ventajas de la tecnología (sin complicar)

- **En la nube (hosted)**: acceso desde la oficina o desde dispositivos autorizados; respaldos y recuperación según lo desplegado en cada entorno.
- **API propia**: el “cerebro” que conecta la web, la app Android y WhatsApp; permite evolucionar sin rehacer todo desde cero.
- **Separación de roles**: administrador vs técnico; permisos acotados reducen errores y riesgos.
- **Actualización de la app Android** mediante los mecanismos habituales de distribución (tienda interna o APK según política de la entidad).
- **PWA / web moderna**: la versión de oficina puede usarse como sitio web progresivo en el navegador, con buenas prácticas de actualización (incl. avisos de nueva versión cuando aplique).

---

## 9. Qué puede esperar el ciudadano

- Canales claros para el reclamo (web, WhatsApp u otros que la municipalidad defina).
- **Seguimiento** sin depender solo del “me dijeron que lo anotaron”.
- Cuando el flujo está bien configurado, **mensajes automáticos** en hitos clave del trabajo.

---

## 10. Mensaje corto para cerrar (elevator pitch)

**GestorNova** es la herramienta con la que la municipalidad **ordena los reclamos del vecino**, **asigna cuadrillas con mapa y estados**, **documenta el trabajo en campo con la app Android** y **mantiene informado al ciudadano por WhatsApp** cuando corresponde — todo **en un solo sistema trazable**, con posibilidad de **apoyo de IA** para priorizar y analizar, sin sustituir el criterio de la gestión.

---

*Documento elaborado para uso interno / presentación a intendencia. Para detalle técnico de despliegue, seguridad y APIs, existe documentación complementaria en la carpeta `docs/` del proyecto.*
