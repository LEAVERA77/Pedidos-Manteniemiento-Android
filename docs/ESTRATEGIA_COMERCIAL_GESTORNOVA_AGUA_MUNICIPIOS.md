# Estrategia comercial — GestorNova (cooperativas y municipios / agua y saneamiento)

Documento operativo para contactar cooperativas de agua potable y operadores municipales en Argentina y la región. **Alcance de producto:** panel web, app Android (offline), bot WhatsApp, multitenant (Neon, Render, Cloudinary).

---

## 1. KPIs de venta clave (5 indicadores)

| KPI | Mejora que aporta GestorNova (una línea) |
|-----|------------------------------------------|
| **Tiempo medio de resolución de reclamos críticos** (fugas / sin servicio) | Centraliza el pedido, asigna al técnico con mapa y avisos; se pasa de tiempos “en días” a **horas medibles** (objetivo típico piloto: bajar de 48 h a &lt;12 h en casos prioritarios). |
| **Tasa de reclamos cerrados en primera visita** | Ficha completa en campo (fotos, materiales, firma), menos idas y vueltas; **más cierres en un solo turno**. |
| **Tiempo de respuesta al socio** (primer contacto) | WhatsApp + registro automático + plantillas; el vecino **deja de esperar “a que alguien vea el papel”**. |
| **Visibilidad de inventario / costo por orden** (eficiencia operativa) | Materiales y avances asociados al pedido; base para **control de costos y auditoría** sin Excel paralelo. |
| **Cumplimiento de SLA interno** (% pedidos dentro de plazo) | Tablero y listas por estado; el directorio ve **semáforos reales**, no estimaciones. |

*Nota municipios:* mismos KPIs sustituyendo “socio” por “vecino/contribuyente” donde corresponda.

---

## 2. Estrategia de prueba piloto (3 cooperativas en Argentina)

**Perfil objetivo**

- **Pequeña** (ej. &lt;3.000 conexiones): dolor fuerte en “no sabemos dónde está el problema” y registro en papel/WhatsApp suelto.
- **Mediana** (3.000–15.000): ya usan Excel o un sistema viejo; necesitan **trazabilidad** y campo móvil.
- **Grande** (&gt;15.000): exigen **escala**, roles, reportes y continuidad del servicio; el piloto se enfoca en **un barrio o una cuadrilla**.

**Proceso para conseguirlas**

1. **Lista corta** (10–15) por red de ingenieros sanitarios, cámaras sectoriales y municipios asociados.
2. **Oferta piloto** clara: 30 días, un tenant, capacitación incluida, éxito medido con 3–5 métricas acordadas.
3. **Campeón interno** en cada cooperativa (jefe de operaciones o mantenimiento) que use la app a diario.
4. **Reunión semanal** de 30 minutos: revisar números y ajustar flujos (prioridades, tipos de reclamo).

**Métricas de éxito a 30 días (ROI narrativo)**

- **Reducción del tiempo medio** de “reclamo ingresado → técnico en sitio” (meta: −30% vs. línea base estimada).
- **% reclamos con foto y cierre documentado** (meta: &gt;70% de los cerrados en piloto).
- **Reclamos duplicados evitados** (mismo NIS/dirección en &lt;48 h): contar casos detectados en sistema.
- **Satisfacción interna** (encuesta 5 preguntas a operadores y 1 reunión con directorio): “¿Volverían a usarlo?”.

---

## 3. Elevator pitch (~30 segundos) — presidente / gerente

> “Hoy los reclamos se pierden entre WhatsApp, llamadas y planillas: ustedes no saben cuánto tardan en llegar al técnico ni cuánto cuesta cada salida. **GestorNova** junta al vecino por **WhatsApp**, al **admin en el mapa** y al **técnico en la calle con la app**, incluso **sin señal**. Eso significa **menos agua perdida por demoras**, **menos reprocesos** y **mejor respuesta al socio**. Es multitenant, liviano en costo de infraestructura y en un piloto de 30 días pueden ver números concretos de tiempo y cierres.”

---

## 4. Tres objeciones frecuentes (Argentina) y respuestas

| Objeción | Respuesta estratégica |
|----------|------------------------|
| **“Es caro / no tenemos presupuesto.”** | Se propone **piloto acotado** (un sector, una cuadrilla) con costo fijo simbólico o bonificado; el argumento es **evitar costo oculto** de agua no facturada, repeticiones de cuadrilla y tiempo de oficina en Excel. |
| **“Nuestros técnicos no usan el celular.”** | La app está pensada para **pocos toques**, **offline** y **fotos** como ya hacen por WhatsApp; el cambio es **ordenar** lo que ya hacen. Capacitación en **una hora** + un **referente** en taller. |
| **“Ya tenemos Excel / un sistema viejo.”** | No piden reemplazo el día uno: **conviven** importando socios y usando GestorNova para **nuevos reclamos y campo**; el valor inmediato es **mapa + WhatsApp + cierre con evidencia**. |

---

## 5. Onboarding técnico simplificado (&lt;48 h)

1. **Tenant y usuarios** (30–60 min): alta del cooperativa/municipio en multitenant, roles admin / técnico, prueba de login web y APK.
2. **Carga de socios** (2–4 h según volumen): Excel → import a **`socios_catalogo`** (NIS, nombre, dirección, teléfono); validación de duplicados.
3. **WhatsApp** (1–2 h): número Meta, verificación, webhook a la API en Render, plantilla de bienvenida y flujo mínimo de “reclamo + ubicación”.
4. **Mapa** (1–2 h): punto central de la localidad, primeros pedidos de prueba con **georreferencia** (click en mapa o dirección aproximada); **sin polígonos** en el arranque.
5. **Tipos de reclamo y prioridades** (30 min): fugas, falta de presión, medidor, cloacas — alineados al lenguaje de la cooperativa.
6. **Go-live asistido** (día 2): una cuadrilla en campo + admin en web monitoreando el tablero.

---

## 6. Expansión regional (orden sugerido)

1. **Uruguay** — Primero: marco cooperativo y municipal **muy parecido** a Argentina, mismo idioma y cultura de factura/servicios; adaptación mínima (moneda, legal menor).
2. **Paraguay** — Segundo: fuerte presencia de **cooperativas** y saneamiento comunitario; la venta es por **confianza local** y referidos, similar a interior argentino.
3. **Chile** — Tercero: mercado más **formalizado y licitado**; ciclos de venta más largos; conviene entrar con **casos argentinos/uruguayos** y partners locales.
4. **Bolivia** — Cuarto: heterogeneidad institucional (EPSA, cooperativas, municipal); requiere **pilotos muy acotados** y posible ajuste de integraciones/pagos.

**Resumen:** el camino más parecido a Argentina es **Uruguay** (idioma, tipo de operador, dinámica cooperativa/municipal); el más distinto en proceso de compra suele ser **Chile** (mayor exigencia de licitación y documentación).

---

## Neon / SQL

**No se requieren tablas nuevas** para ejecutar esta estrategia comercial: el producto ya usa `pedidos`, `socios_catalogo`, usuarios, notificaciones, ubicaciones, etc.

Si en el futuro quisieran **KPIs persistidos en base** (metas por cooperativa, snapshots mensuales), se podría diseñar algo como `kpi_snapshots (tenant_id, periodo, metrica, valor)` — opcional, no incluido en este documento.

---

*Última actualización: documento vivo para uso interno y comercial GestorNova.*
