# Manual de uso — GestorNova

**Administración (navegador)** y **técnicos / cuadrillas (app Android)**

*Versión orientada a operadores. No sustituye la documentación técnica de despliegue.*

---

## 1. Qué es GestorNova

**GestorNova** es el sistema que centraliza **reclamos** (pedidos), la **coordinación desde oficina** y el **trabajo en campo**. La oficina usa una **aplicación web**; las cuadrillas usan la **app Android (Nexxo)**. La información vive en un solo lugar: estados, historial, mapa y, cuando corresponde, avisos al vecino por **WhatsApp**.

---

## 2. Dónde entrar

- **Administración / despacho:** Navegador (PC o tablet). Dirección típica de la versión pública: **https://leavera77.github.io/Pedidos-MG/** (tu entidad puede usar otro dominio si lo configuraron).
- **Técnicos / cuadrillas:** App **Android** instalada en el dispositivo de trabajo (proyecto **Nexxo**). La pantalla es la misma lógica que la web, adaptada al celular.

**Inicio de sesión:** usuario y contraseña que te asignó el administrador del sistema. Si no podés entrar, pedí que verifiquen que tu usuario esté **activo** y con el **rol** correcto (administrador vs técnico).

---

## 3. Conceptos básicos

### 3.1 Pedido (reclamo)

Cada reclamo es un **pedido** con:

- **Número** de pedido visible en listas y detalle.
- **Estado** (resumen): suele pasar por *Pendiente* → *Asignado* → *En ejecución* → *Cerrado* (puede haber otros según el tipo de negocio).
- **Avance** en porcentaje cuando el trabajo está en curso.
- Datos del **cliente / ubicación**, tipo de trabajo, prioridad, etc.

### 3.2 Mapa

Podés ver los pedidos en un **mapa** para priorizar por zona y, según permisos, corregir ubicaciones si hace falta.

### 3.3 WhatsApp al vecino

Si el reclamo tiene **teléfono de contacto** válido y el flujo está habilitado, el sistema puede **avisar al vecino** en momentos clave (por ejemplo al pasar a ejecución, con avances y al cerrar). Eso depende de la **configuración** de la entidad y del canal WhatsApp.

---

## 4. Manual del administrador (web)

### 4.1 Tablero de pedidos

- Al ingresar ves la **lista** de pedidos.
- Usá **filtros** (estado, tipo de trabajo, zona, prioridad, etc.) para acotar lo que necesitás ver.
- Abrí un pedido tocando o haciendo clic en la fila para ver el **detalle**.

### 4.2 Asignar trabajo a un técnico

Desde el **detalle** del pedido, cuando el estado lo permite, podés **asignar** el reclamo a un técnico o cuadrilla. El técnico verá ese pedido en su app y puede recibir **notificación** según la configuración.

### 4.3 Seguimiento y cierre desde oficina

El administrador puede cargar **avances**, **fotos**, **materiales** y **cierre** igual que un técnico cuando la operación lo permite, según el flujo de la entidad.

### 4.4 Incidencias (varios pedidos, un mismo evento)

Sirve cuando **varios reclamos** corresponden al **mismo hecho** (misma calle, mismo transformador, misma zona, etc.): los agrupás en una **incidencia** para seguimiento conjunto.

**Crear una incidencia (administrador):**

1. En la lista de pedidos, marcá con la casilla los pedidos que querés agrupar (**al menos dos**).
2. Solo se pueden marcar pedidos **no cerrados** (los cerrados no entran en la agrupación nueva).
3. Tocá el botón flotante **Asociar reclamos** (o el equivalente en tu pantalla).
4. Elegí **criterio de agrupación** y **valor** (ej.: misma calle, mismo transformador).
5. Opcional: nombre de la incidencia. Confirmá para crearla.

**Ver una incidencia:**

- En cada pedido que pertenezca a una incidencia verás un enlace o insignia del tipo **Incidencia #N**. Tocándolo se abre la **vista de la incidencia** con el listado de pedidos y el progreso.

**Desde la vista de incidencia (solo administrador):**

- **Desasociar** un pedido: lo saca de esa incidencia (no borra el pedido).
- **Asignar técnico a la incidencia:** elegís un técnico y el sistema **asigna ese técnico a todos los pedidos abiertos** de la incidencia (los ya cerrados no se modifican).
- **Cerrar todos los pedidos:** abre un asistente para cargar **trabajo realizado** (obligatorio), **foto de cierre** y **materiales** si aplica; esa información queda registrada en **cada** pedido y la incidencia puede quedar cerrada según el flujo.

---

## 5. Manual del técnico (app Android)

### 5.1 Qué ves al entrar

- Los pedidos que te **asignaron** aparecen en tu lista según filtros y estado.
- Desde cada ítem podés abrir el **detalle** del pedido.

### 5.2 En campo: avances, fotos, materiales, cierre

- Actualizá **estado** y **porcentaje de avance** según corresponda.
- Cargá **fotos** del trabajo (incluida foto de **cierre** si lo pide la operación).
- Registrá **materiales** utilizados si el tipo de trabajo lo contempla.
- Completá **observaciones** o **trabajo realizado** al cerrar.
- Si aplica en tu entidad, podés registrar **firma del cliente**.

### 5.3 Notificaciones

Podés recibir **avisos** cuando el despacho te **asigna** un pedido (según configuración del teléfono y de la entidad).

### 5.4 Incidencias (técnico)

- Podés **marcar** pedidos para asociarlos a una **nueva incidencia** solo si el pedido está **Asignado** o **En ejecución** y **asignado a vos**.
- **No** podés usar esas casillas en pedidos **Pendientes** (sin asignar), **Cerrados** ni en estados que la entidad excluya del flujo (por ejemplo derivación externa, si aplica).
- En la **vista de una incidencia**, podés ver el conjunto y usar **Cerrar todos** solo sobre los pedidos **abiertos que te corresponden** según esas mismas reglas; **no** podés desasociar pedidos ni asignar técnico a toda la incidencia (eso es solo administración).

---

## 6. Buenas prácticas

1. **Cerrá sesión** si usás una PC compartida.
2. **Verificá el número de teléfono** del reclamo antes de asumir que el vecino recibirá WhatsApp.
3. En **incidencias**, creá el grupo cuando estés seguro de que los pedidos son del **mismo evento**; así el seguimiento y el cierre masivo reflejan la realidad operativa.
4. Si algo no se actualiza en pantalla, probá **recargar la página** (en la web) o volver a la lista (en la app).

---

## 7. Cuándo pedir ayuda a soporte / administrador

- No podés **iniciar sesión** (usuario inactivo, contraseña errada, bloqueo).
- Error al **guardar** o mensaje de “sin permiso”.
- La **ubicación** en mapa no coincide con la calle real tras corregir datos.
- **WhatsApp** no llega al vecino (verificar número, prefijo país y configuración del servidor).

---

## 8. Referencias técnicas (no usuario final)

Para instalación, API, Render, GitHub Pages y sincronización de repos, el equipo técnico puede usar el **README** del proyecto Android y los documentos en la carpeta `docs/` del repositorio (por ejemplo runbook de operación).

---

*Documento generado para uso interno de la entidad. Ajustá URLs y nombres comerciales según tu despliegue.*

made by leavera77
