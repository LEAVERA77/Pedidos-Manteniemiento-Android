# Manual de usuario — GestorNova

## Cooperativa eléctrica y municipio

**Guía paso a paso · Lenguaje sencillo · Todas las opciones principales**

*Versión para operadores, despacho y cuadrillas. Ajustá la URL de acceso según lo que le haya dado tu organización (por ejemplo la web publicada o la app Android instalada en el celular).*

---

## Índice

1. [Qué es GestorNova](#1-qué-es-gestornova)
2. [Cómo entrar al sistema](#2-cómo-entrar-al-sistema)
3. [Roles: quién puede hacer qué](#3-roles-quién-puede-hacer-qué)
4. [Conceptos que vas a ver en pantalla](#4-conceptos-que-vas-a-ver-en-pantalla)
5. [Pantalla principal: mapa y lista de pedidos](#5-pantalla-principal-mapa-y-lista-de-pedidos)
6. [Detalle de un pedido (modal)](#6-detalle-de-un-pedido-modal)
7. [Crear un pedido desde oficina](#7-crear-un-pedido-desde-oficina)
8. [Asignar, desasignar y notificar al técnico](#8-asignar-desasignar-y-notificar-al-técnico)
9. [Trabajo en campo: avance, fotos, materiales y cierre](#9-trabajo-en-campo-avance-fotos-materiales-y-cierre)
10. [Coordinación en campo: geocerca, chat y fotos antes/después](#10-coordinación-en-campo-geocerca-chat-y-fotos-antesdespués)
11. [Incidencias (varios reclamos, un mismo evento)](#11-incidencias-varios-reclamos-un-mismo-evento)
12. [Derivaciones a terceros](#12-derivaciones-a-terceros)
13. [WhatsApp con el vecino o socio](#13-whatsapp-con-el-vecino-o-socio)
14. [Panel de administración](#14-panel-de-administración)
15. [App Android para cuadrillas](#15-app-android-para-cuadrillas)
16. [Inteligencia artificial (ayudas)](#16-inteligencia-artificial-ayudas)
17. [Anexo A — Cooperativa eléctrica](#anexo-a--cooperativa-eléctrica)
18. [Anexo B — Municipio](#anexo-b--municipio)
19. [Tabla comparativa rápida](#tabla-comparativa-rápida)
20. [Problemas frecuentes y qué hacer](#20-problemas-frecuentes-y-qué-hacer)

---

## 1. Qué es GestorNova

GestorNova es un programa para **ordenar los reclamos** de punta a punta:

1. El **vecino o socio** avisa (por WhatsApp o por oficina).
2. **Despacho** ve todo en un **mapa y una lista**, asigna cuadrillas y hace seguimiento.
3. El **técnico** trabaja en la calle con el **celular** (fotos, avance, cierre).
4. El sistema puede **avisar al vecino por WhatsApp** y guardar **evidencia** de cada paso.

Hay **dos “tipos de negocio”** en el mismo programa (no se mezclan los datos):

| Tipo de negocio | Quién lo usa | Ejemplos de reclamos |
|-----------------|--------------|----------------------|
| **Cooperativa eléctrica** | Cooperativas y distribuidoras de energía | Cortes, cables caídos, tensión, postes, fraude, red y trafos |
| **Municipio** | Municipalidades | Alumbrado, bacheo, cloacas, tránsito, poda, espacios verdes, animales |

Tu organización usa **uno** de esos perfiles (o más de uno en cuentas separadas). Los menús y textos se adaptan automáticamente.

---

## 2. Cómo entrar al sistema

### 2.1 Administración (oficina, PC o tablet)

1. Abrí el **navegador** (Chrome, Edge, etc.).
2. Entrá a la dirección web que te dio tu entidad (en muchos casos es la versión publicada del panel administrativo).
3. Escribí tu **usuario** y **contraseña**.
4. Pulsá **Iniciar sesión**.
5. Si es la **primera vez** de la entidad, puede aparecer un **asistente de configuración**: completá los datos obligatorios de empresa y seguí los pasos en pantalla.

### 2.2 Cuadrillas (celular Android)

1. Abrí la app **GestorNova / Nexxo** instalada en el dispositivo.
2. Iniciá sesión con el usuario que te asignó despacho (rol **técnico** o **supervisor**).
3. Aceptá los permisos de **ubicación** y **notificaciones** si el sistema los pide (sirven para el mapa, la geocerca y los avisos de pedidos nuevos).

### 2.3 Cerrar sesión

1. Tocá el ícono de **usuario** (arriba en la pantalla).
2. Elegí **Cerrar sesión**.
3. En PCs compartidas, hacelo siempre al terminar el turno.

---

## 3. Roles: quién puede hacer qué

| Acción | Administrador | Técnico | Supervisor |
|--------|:-------------:|:-------:|:----------:|
| Ver todos los pedidos del tenant | Sí | No (solo asignados)* | Sí (con opción “ver todos”) |
| Panel Admin (configuración, estadísticas) | Sí | No | No |
| Asignar técnico | Sí | No | No |
| Desestimar pedido | Sí | No | No |
| Crear pedido, avanzar, fotos, cerrar | Sí | Sí (asignados) | Sí |
| Avisos masivos WhatsApp | Sí | No | No |
| Chat humano WhatsApp con vecino | Sí | No | No |
| Solicitar derivación a tercero | No | Sí | Sí |
| Incidencias (agrupar / cerrar grupo) | Sí | Sí (con límites) | Sí |

\* El técnico solo ve los pedidos que le asignaron, salvo que la entidad active otra política.

---

## 4. Conceptos que vas a ver en pantalla

### 4.1 Pedido (reclamo)

Unidad principal del sistema. Tiene:

- **Número de pedido** (visible en lista y detalle).
- **Estado:** Pendiente → Asignado → En ejecución → Cerrado (y casos especiales: desestimado, derivado fuera).
- **Avance** en porcentaje (cuando está en curso).
- **Tipo de trabajo** (según rubro: eléctrico o municipal).
- **Prioridad:** Baja, Media, Alta, Crítica (a veces se sugiere sola según el tipo).
- **Datos de contacto**, **dirección**, **ubicación en mapa**.
- **Fotos**, **materiales**, **observaciones**, **firma** (si aplica).

### 4.2 Mapa y lista

- **Mapa:** puntos de cada pedido; podés acercar, mover y centrar.
- **Panel “Pedidos”** (lista a un costado): pestañas por estado, búsqueda y filtros.

### 4.3 Vecino / socio / catálogo

- En **municipio** se habla de **vecinos** (catálogo de vecinos).
- En **cooperativa eléctrica** de **socios** con **NIS** y **medidor**.
- Sirve para cargar reclamos rápido y buscar historial.

---

## 5. Pantalla principal: mapa y lista de pedidos

### 5.1 Ver la lista de pedidos

1. Después de entrar, asegurate de estar en la vista **Mapa** (no en login ni en panel admin).
2. A la derecha (o abajo en celular) está el panel **Pedidos**.
3. Usá las **pestañas** del panel: suelen ser **Pendientes**, **Asignados**, **En ejecución**, **Cerrados** (los nombres pueden variar levemente).
4. Tocá una fila para abrir el **detalle** del pedido.

### 5.2 Filtrar pedidos en el mapa (panel “Filtros”)

1. En el mapa, buscá la pestaña o botón **Filtros** (panel flotante que se puede mover).
2. Marcá o desmarcá según necesites:
   - **Desestimados** (solo administrador en muchas instalaciones).
   - **Prioridad**, **tipo de trabajo**, **zona**, **técnico asignado**.
3. Los cambios actualizan **mapa y lista**.

### 5.3 Filtrar por tipo de reclamo (panel “Tipo”)

1. Abrí el panel **Tipo** en el mapa.
2. Elegí uno o varios tipos de trabajo.
3. Confirmá que el mapa muestra solo lo que te interesa.

### 5.4 Colores en el mapa (prioridad)

1. Abrí el panel **Colores**.
2. Revisá la leyenda: cada color suele representar una **prioridad** (Crítica, Alta, etc.).
3. Usalo para decidir qué atender primero.

### 5.5 Opciones extra en la lista (administrador)

En la barra del panel Pedidos pueden aparecer (según configuración):

1. **Derivados fuera** — muestra reclamos derivados a terceros.
2. **Desestimados** — incluye o filtra reclamos desestimados.
3. **Solo agrupados** — solo pedidos que están en una **incidencia**.

*Solo una de estas opciones especiales suele estar activa a la vez en la pestaña Cerrados.*

### 5.6 Supervisor / técnico: “Ver todos”

1. Si sos **supervisor**, puede aparecer **Ver todos los pedidos**.
2. Activá la casilla para ver el tenant completo; desactivá para ver solo lo tuyo.

### 5.7 Ocultar o mostrar el panel Pedidos

1. Tocá el ícono del **ojo** en la barra del panel para **ocultarlo** y ganar espacio en el mapa.
2. Tocá el botón flotante **Pedidos** para **volver a mostrarlo**.

### 5.8 Mover paneles del mapa (filtros, dashboard, etc.)

1. Arrastrá desde la **barra superior** del panel (ícono de agarre).
2. Para **ocultar** un panel, usá el ícono del ojo en su barra.
3. Para **volver a mostrarlo**, usá las pestañas laterales: **Filtros**, **Tipo**, **Colores**, **Dash**, etc.

### 5.9 Dashboard en el mapa (administrador)

1. Tocá la pestaña **Dash** si está disponible.
2. Revisá indicadores resumidos de la operación (cantidades, tendencias según configuración).

### 5.10 Dashboard de gerencia (administrador)

1. Tocá el ícono de **tablero / tachómetro** en la barra superior.
2. Se abre un panel de **seguimiento en tiempo casi real** (arrastrable y cerrable).

### 5.11 Ir a “mi ubicación” en el mapa (técnico / admin)

1. Tocá el botón verde de **ubicación / GPS** en el mapa.
2. El mapa centra tu posición actual (útil en campo).

### 5.12 Crear pedido desde el mapa

1. Tocá **Nuevo** o **Nuevo desde GPS** (según botones visibles en tu pantalla).
2. Seguí el flujo del [apartado 7](#7-crear-un-pedido-desde-oficina).

### 5.13 Exportar pedidos a Excel (administrador)

1. Desde las herramientas de listado o estadísticas (según menú de tu versión), elegí **Exportar Excel**.
2. Guardá el archivo en tu PC para reportes o reuniones.

---

## 6. Detalle de un pedido (modal)

Al abrir un pedido se muestra una ventana grande (**detalle**) con muchas secciones. Recorrido recomendado:

### 6.1 Abrir el detalle

1. En la **lista**, tocá el pedido.
2. O en el **mapa**, tocá el marcador y elegí ver detalle.

### 6.2 Leer datos principales

1. Anotá el **número de pedido**, **estado**, **tipo**, **prioridad**, **dirección** y **teléfono**.
2. Revisá si hay **foto del reclamo** inicial; tocá para **ampliar**, **girar** o **descargar** (según permisos).

### 6.3 Corregir ubicación en el mapa (administrador)

1. Si el pin está mal, usá la opción de **corregir ubicación** / geocodificar.
2. Mové el punto en el mapa o editá dirección y guardá.
3. Volvé a centrar el pedido para verificar.

### 6.4 Imprimir o generar PDF del pedido

1. Buscá el botón **Imprimir** o **Informe** en el detalle.
2. Seguí las indicaciones del navegador para imprimir o guardar PDF.

### 6.5 Valoración del cliente por WhatsApp (si existe)

1. Si el pedido está **cerrado** y el vecino valoró por WhatsApp, verás **estrellas** y comentario.
2. En **cooperativa eléctrica**, si la valoración es **baja**, el administrador puede cargar un **descargo de la empresa** y **reabrir** el pedido (ver [13.6](#136-valoración-baja-y-descargo-cooperativa-eléctrica)).

### 6.6 Desplegar secciones del detalle

Muchas secciones son **plegables** (flecha o “summary”). Tocalas para abrir:

- Materiales  
- Coordinación en campo (geocerca, chat)  
- Derivaciones  
- Incidencia vinculada  
- Historial / auditoría  

---

## 7. Crear un pedido desde oficina

### 7.1 Pasos generales

1. En el mapa, iniciá **Nuevo pedido** (botón correspondiente).
2. Completá **tipo de trabajo** (lista según rubro — ver anexos A y B).
3. Completá **prioridad** (o aceptá la sugerida).
4. Buscá al **socio/vecino** en el catálogo **o** cargá nombre, teléfono y dirección manualmente.
5. Confirmá la **ubicación** en el mapa (arrastrá el pin si hace falta).
6. Agregá **descripción** y, si querés, **foto**.
7. Pulsá **Guardar**.

### 7.2 Usar el catálogo (socio o vecino)

1. En el formulario, escribí en el buscador: **NIS**, **medidor**, **apellido** o **dirección** (según rubro).
2. Elegí el resultado correcto de la lista.
3. El sistema completa datos conocidos (domicilio, teléfono, etc.).

### 7.3 Cooperativa eléctrica: distribuidor y red

1. Si tu entidad usa **Red Eléctrica**, elegí el **distribuidor** en el selector correspondiente.
2. Si el pedido lleva **trafo**, verificá que figure en el detalle tras guardar (según datos de red).

### 7.4 Municipio: barrio o zona

1. Elegí **barrio** o zona si el formulario lo muestra (catálogo importado desde administración).
2. Esto ayuda en estadísticas por barrio.

### 7.5 Sugerencia de tipo con IA (opcional)

1. Escribí una descripción clara del problema.
2. Si hay botón **Sugerir con IA**, usalo para proponer tipo de reclamo.
3. Revisá siempre antes de guardar; la decisión final es humana.

---

## 8. Asignar, desasignar y notificar al técnico

### 8.1 Asignar un técnico (administrador)

1. Abrí el pedido en estado **Pendiente** (o el que permita asignación).
2. Tocá **Asignar técnico** (o ícono similar).
3. Elegí el **técnico** en la lista.
4. Opcional: editá el texto de la **notificación** que recibirá.
5. Confirmá con **Asignar y notificar**.
6. El pedido pasa a **Asignado**; el técnico recibe aviso en el celular.

### 8.2 Cambiar de técnico (reasignar)

1. Abrí el detalle del pedido asignado.
2. Volvé a **Asignar técnico**.
3. Elegí otro técnico y confirmá.
4. Ambos pueden recibir notificación según configuración.

### 8.3 Desasignar (dejar sin técnico)

1. En el mismo modal de asignación, tocá **Desasignar**.
2. Confirmá.
3. El pedido vuelve a quedar **Pendiente** (o el estado que use tu entidad).

### 8.4 Volver un pedido a Pendiente (administrador)

1. Si el flujo lo permite, usá **Volver a pendiente** en el detalle.
2. Confirmá el motivo si te lo pide la pantalla.
3. Útil cuando hay que reasignar masivamente o corregir un error de estado.

### 8.5 Desestimar un pedido (administrador)

1. Abrí el pedido.
2. Elegí **Desestimar** (o equivalente).
3. Indicá el **motivo** de desestimación.
4. Guardá. El pedido deja de seguir el flujo normal de trabajo en campo.

---

## 9. Trabajo en campo: avance, fotos, materiales y cierre

### 9.1 Pasar a “En ejecución”

1. Abrí el pedido **asignado** a vos (o como admin).
2. Tocá **Iniciar** / **En ejecución**.
3. Si la **geocerca** está activa ([apartado 10](#10-coordinación-en-campo-geocerca-chat-y-fotos-antesdespués)), el sistema pide **GPS** y verifica que estés cerca del reclamo.
4. Si estás lejos, no deja iniciar (o avisa); acercate al lugar e intentá de nuevo.

### 9.2 Cargar porcentaje de avance

1. En el detalle, tocá **Avance** o el porcentaje actual.
2. Elegí el nuevo valor (el sistema puede impedir **bajar** el avance sin permiso).
3. Guardá.
4. El vecino puede recibir **WhatsApp** de avance si el teléfono está bien cargado.

### 9.3 Subir fotos del trabajo

1. Tocá **Fotos** o **Agregar foto**.
2. Sacá foto con la cámara o elegí de galería.
3. Repetí si necesitás más evidencia.
4. En algunos flujos hay fotos **antes** y **después** ([apartado 10.3](#103-fotos-antes-y-después)).

### 9.4 Registrar materiales

1. Abrí la sección **Materiales** en el detalle.
2. Agregá ítems (descripción, cantidad según formulario).
3. Guardá.

### 9.5 Cerrar el pedido

1. Cuando el trabajo esté terminado, tocá **Cerrar** (o **Finalizar**).
2. Completá **trabajo realizado** (texto obligatorio en la mayoría de los casos).
3. Marcá el **checklist de seguridad** (ítems distintos en eléctrica y municipio — ver anexos).
4. Subí **foto de cierre** si lo exige tu entidad.
5. Registrá **firma del vecino/socio** si corresponde.
6. Confirmá el cierre.
7. El estado pasa a **Cerrado**; el vecino puede recibir WhatsApp de cierre y luego la **encuesta de satisfacción**.

### 9.6 Checklist de seguridad al cerrar

**Cooperativa eléctrica** (típico):

1. EPPS / protección verificados.  
2. Corte o seccionamiento de energía verificado.  
3. Señalización del lugar de trabajo.  

**Municipio** (típico):

1. Conos / vallas / señalización vial.  
2. Corte de calle / desvío de tránsito.  
3. Señalización del lugar de trabajo.  

Marcá cada ítem antes de confirmar el cierre.

---

## 10. Coordinación en campo: geocerca, chat y fotos antes/después

*Disponible para cooperativas (eléctrica y agua) y configurable por entidad.*

### 10.1 Geocerca (configuración — administrador)

1. Entrá al **Panel Admin** → pestaña **Empresa**.
2. Buscá la sección **Geocerca**.
3. Activá o desactivá la geocerca.
4. Definí el **radio en metros** (ejemplo: 100 m).
5. Guardá los cambios.

### 10.2 Geocerca (uso — técnico)

1. Al poner el pedido **En ejecución**, permití el acceso al **GPS**.
2. Si estás dentro del radio, el sistema **permite** continuar.
3. Si no, verás un mensaje con la distancia aproximada; el intento queda **registrado**.
4. El administrador puede ver el **historial de intentos** en el detalle del pedido (sección Coordinación en campo).

### 10.3 Chat interno del pedido

**Quién puede escribir:** administradores y técnicos con permiso sobre ese pedido.

**En el detalle del pedido:**

1. Abrí la sección **Coordinación en campo** (o **Chat interno**).
2. Leé los mensajes anteriores.
3. Escribí en el cuadro de texto.
4. Pulsá **Enviar**.

**Notificaciones:**

- Si escribe el **admin**, el **técnico asignado** recibe aviso en el celular.
- Si escribe el **técnico**, los **administradores** reciben aviso.

**Administrador — aviso clicable:**

1. Cuando llega un mensaje del técnico, aparece un **cartel azul** (“Mensaje en reclamo…”).
2. **Tocá el cartel**.
3. Se abre el **detalle del pedido** con el chat listo para responder.

**Técnico en Android — panel flotante:**

1. Al recibir mensaje o al enviar uno, puede abrirse un **panel de chat** sobre el mapa.
2. Arrastrá el panel desde la barra superior.
3. Ocultá con el ícono del **ojo**; volvé a mostrarlo con la pestaña **Chat**.
4. Cerrá con la **X** cuando termines.

### 10.4 Fotos antes y después

1. En Coordinación en campo o sección de fotos clasificadas, elegí **Antes** o **Después**.
2. Subí una o más imágenes.
3. Guardá.
4. Quedan ordenadas para informes y auditoría.

---

## 11. Incidencias (varios reclamos, un mismo evento)

Sirve cuando muchos vecinos reportan el **mismo apagón, inundación, evento de tránsito**, etc.

### 11.1 Crear una incidencia (administrador)

1. En la lista de pedidos, marcá con la **casilla** al menos **dos** pedidos **no cerrados**.
2. Tocá el botón flotante **Asociar reclamos**.
3. Elegí el **criterio** (misma calle, mismo trafo, etc.) y el **valor**.
4. Opcional: poné un **nombre** a la incidencia.
5. Confirmá.

### 11.2 Ver una incidencia

1. En un pedido agrupado, tocá el enlace **Incidencia #N**.
2. Revisá la lista de pedidos del grupo y el estado general.

### 11.3 Asignar técnico a toda la incidencia (administrador)

1. Dentro de la vista de incidencia, elegí **Asignar técnico a la incidencia**.
2. Seleccioná el técnico.
3. El sistema asigna a **todos los pedidos abiertos** del grupo (los cerrados no se modifican).

### 11.4 Cerrar todos los pedidos de una incidencia

1. En la vista de incidencia, tocá **Cerrar todos**.
2. Completá **trabajo realizado**, **foto** y **materiales** según el asistente.
3. Confirmá: la información se replica en **cada pedido** del grupo según las reglas del sistema.

### 11.5 Desasociar un pedido (administrador)

1. En la vista de incidencia, elegí **Desasociar** en el pedido que no corresponda al evento.
2. El pedido sigue existiendo, pero sale del grupo.

### 11.6 Técnico: reglas importantes

1. Solo podés agrupar pedidos **asignados a vos** en estado **Asignado** o **En ejecución**.
2. **No** podés agrupar pendientes sin asignar ni cerrados.
3. **No** podés desasignar ni asignar técnico a toda la incidencia (solo administración).

---

## 12. Derivaciones a terceros

### 12.1 Configurar contactos de derivación (administrador)

En **Panel Admin → Empresa**:

**Municipio y cooperativa de agua — derivaciones generales:**

1. Activá **Empresa de energía** y/o **Cooperativa de agua** si querés mostrar enlaces WhatsApp a otros organismos.
2. Cargá **nombre visible** y **WhatsApp internacional** (con código de país, ej. +549…).
3. Guardá.

**Municipio — Policía (orden público):**

1. Activá **Policía**.
2. Cargá nombre (ej. Comisaría) y WhatsApp.
3. Guardá.

**Cooperativa eléctrica — derivación por tipo de reclamo:**

1. Configurá contactos en **derivacion_reclamos** (agua / otra energía) cuando el reclamo no es de electricidad pero el vecino llamó a la cooperativa.

### 12.2 Derivar desde el detalle (administrador)

1. Abrí el pedido.
2. En **Derivación a terceros**, revisá los contactos configurados.
3. Tocá **Abrir WhatsApp** junto al contacto adecuado para orientar al vecino.
4. O usá el flujo de **derivación operativa** para marcar el pedido como derivado fuera.

### 12.3 Solicitar derivación (técnico)

1. En el detalle, si el tipo de trabajo lo permite, tocá **Solicitar derivación**.
2. Escribí el **motivo**.
3. Enviá.
4. Despacho recibe **notificación** y revisa en el panel.

### 12.4 Revisar solicitudes pendientes (administrador)

1. Mirá el **banner** o el botón con badge de **derivaciones pendientes**.
2. Tocá para ir al primer pedido pendiente de revisión.
3. Aprobá, rechazá o gestioná según tu procedimiento interno.

---

## 13. WhatsApp con el vecino o socio

*Requiere que la entidad tenga el canal WhatsApp (Meta) configurado en el servidor.*

### 13.1 Qué hace el vecino por WhatsApp

1. Escribe al número de la entidad.
2. Recibe un **menú numerado** con tipos de reclamo (lista según rubro — anexos A y B).
3. Elige un número o escribe **0** para **Mis reclamos**.
4. Sigue las preguntas (datos, ubicación, foto opcional).
5. Recibe confirmación con el **número de pedido**.

### 13.2 Comandos útiles para el vecino

| Comando | Acción |
|---------|--------|
| **menú** | Vuelve al menú principal |
| **0** | Ver mis reclamos abiertos |
| **STOP** | No recibir más avisos masivos (opt-out) |
| **ALTA** | Volver a aceptar avisos masivos |

### 13.3 Avisos automáticos (reclamo normal)

El sistema puede enviar solo, sin que operador escriba cada vez:

1. Al pasar a **En ejecución**.  
2. Al **cambiar el avance**.  
3. Al **cerrar** el pedido.  

*Hace falta teléfono de contacto válido en el pedido.*

### 13.4 Tipo “Otros” — chat con operador humano

1. El vecino elige **Otros** en el menú.
2. Puede pedir hablar con un **representante**.
3. En oficina aparece aviso; el **administrador** abre **Chat WhatsApp** / cola de sesiones humanas.
4. Responde desde el panel; el mensaje llega al vecino por WhatsApp.

### 13.5 Avisos masivos y cortes programados (administrador)

1. Tocá el botón flotante de **avisos masivos** (ícono de megáfono / comunidad).
2. Elegí **Aviso general** o **Corte programado** (corte programado no aplica a algunos rubros).
3. Escribí título y mensaje (podés usar variables como ciudad o fecha si están disponibles).
4. Marcá **Confirmar envío**.
5. El envío se hace en segundo plano con ritmo controlado; revisá el resultado en auditoría.

### 13.6 Valoración baja y descargo (cooperativa eléctrica)

1. Tras el cierre, el socio recibe encuesta **1 a 5 estrellas**.
2. Si la nota es **baja**, en administración aparece alerta de **valoración baja**.
3. El admin puede escribir un **descargo de la empresa** (respuesta oficial).
4. Al guardar, el pedido puede volver a **Pendiente** para **reasignar técnico** y resolver de nuevo.
5. Tras un nuevo cierre, el socio puede **volver a valorar**; el ciclo se repite si sigue insatisfecho.

### 13.7 Denuncia de fraude anónima (solo cooperativa eléctrica)

1. El socio elige **Denuncia de fraude (anónima)** en el menú.
2. No se exige nombre ni NIS.
3. Puede enviar ubicación y foto opcional.
4. Oficina gestiona el caso con la confidencialidad que defina la cooperativa.

---

## 14. Panel de administración

Solo **administradores**. Se abre con el ícono de **engranaje / Admin** en la barra superior.

### 14.1 Pestaña Empresa

1. Editá nombre, datos de contacto y configuración general del tenant.
2. Configurá **derivaciones** (energía, agua, policía en municipio).
3. Configurá **geocerca** (activar y metros).
4. Opcional: **Ocultar módulos de red** si no usás catálogos eléctricos legacy.
5. Guardá cambios.

### 14.2 Pestaña Usuarios

1. Listá usuarios del sistema.
2. Para **alta**: cargá nombre, email, rol (admin, técnico, supervisor), teléfono WhatsApp si aplica.
3. Para **baja lógica**: desactivá usuario (no borra historial).
4. Podés enviar **clave provisoria** según herramientas de tu versión.

### 14.3 Pestaña Distribuidores / Barrios / Ramales

*Visible según rubro:*

- **Municipio / agua:** catálogo de **barrios** o **ramales** (import Excel).
- **Cooperativa eléctrica:** esta pestaña legacy suele estar **oculta**; usá **Red Eléctrica**.

Pasos típicos de importación:

1. Descargá la **plantilla Excel** si está disponible.
2. Completá columnas: código, nombre, tensión, localidad (según ayuda en pantalla).
3. Subí el archivo.
4. Revisá resumen de filas agregadas/actualizadas.

### 14.4 Pestaña Red Eléctrica (solo cooperativa eléctrica)

1. Importá el Excel de **red** (distribuidores, kV, trafos, KVA, clientes).
2. Revisá que los datos figuren en listados y selectores de pedidos nuevos.
3. Esta es la **fuente principal** para operación y SAIDI en eléctrico.

### 14.5 Pestaña Socios / NIS (cooperativa) o Vecinos (municipio)

1. Buscá socios/vecinos por identificador, apellido o dirección.
2. **Importá Excel** masivo con plantilla del rubro.
3. **Agregá manualmente** un registro si hace falta.
4. Exportá catálogo si necesitás copia en Excel.
5. Revisá **historial de pedidos** de una persona desde su ficha.

### 14.6 Pestaña Estadísticas

1. Elegí **rango de fechas** y filtros.
2. Revisá gráficos: pedidos por estado, tipo, tiempos de cierre, etc.
3. En **cooperativa eléctrica**, revisá gráficos **SAIDI / SAIFI** si hay red cargada.
4. En **municipio**, revisá tiempos por **barrio** y motivos de **desestimación**.
5. Descargá gráficos o exportá informes según botones disponibles.

### 14.7 Pestaña KPI piloto

1. Revisá indicadores clave configurados para tu entidad.
2. Usá **sugerir KPIs con IA** si está habilitado (solo admin).

### 14.8 Pestaña Ubicaciones

1. Mirá últimas posiciones reportadas de técnicos en mapa/lista (según permisos y política de privacidad).

### 14.9 Pestaña Históricos

1. Consultá pedidos **archivados** o fuera del panel activo según política de vaciado quincenal u otra regla de tu entidad.

### 14.10 Pestaña Contraseña

1. Ingresá contraseña actual y la nueva dos veces.
2. Guardá.
3. Técnicos y supervisores también usan esta pestaña en la web si entran desde navegador.

---

## 15. App Android para cuadrillas

### 15.1 Primer uso

1. Instalá la app que entregó tu organización.
2. Iniciá sesión.
3. Aceptá permisos de **ubicación**, **cámara** y **notificaciones**.

### 15.2 Día a día — pasos habituales

1. Abrí la app y esperá que cargue la **lista** de pedidos.
2. Tocá un pedido para ver el **detalle**.
3. Andá al lugar; usá **ir al mapa / GPS**.
4. **Iniciá ejecución** (respetando geocerca si está activa).
5. Cargá **avances**, **fotos** y **materiales**.
6. Chateá con oficina por el **panel de chat** o por la sección en el detalle si hace falta.
7. **Cerrá** con checklist, trabajo realizado y foto de cierre.
8. Si no hay señal, los cambios se guardan **offline** y suben al recuperar datos.

### 15.3 Notificaciones en el celular

1. Al **asignarte** un pedido, puede aparecer notificación del sistema.
2. Al **mensaje de chat interno**, también.
3. Tocá la notificación para abrir el pedido o el chat (según tipo de aviso).

### 15.4 Modo sin internet

1. Si no hay datos, seguí trabajando: muchas acciones se **encolan**.
2. Cuando vuelva la señal, la app **sincroniza**.
3. Revisá si quedó algún pendiente de subir (badge o mensaje de offline).

### 15.5 Paneles movibles en el mapa (Android)

1. Los paneles de filtros y el **chat flotante** se arrastran desde la barra.
2. Ocultalos con el **ojo** para ver mejor el mapa.
3. Mostralos otra vez con las pestañas **Filtros**, **Chat**, etc.

---

## 16. Inteligencia artificial (ayudas)

*Todas las sugerencias de IA deben ser revisadas por una persona.*

| Herramienta | Quién | Para qué |
|-------------|-------|----------|
| Sugerir tipo de reclamo | Admin, técnico | Al cargar pedido nuevo |
| Priorización sugerida | Admin | Ordenar lista de pendientes |
| Detectar duplicados | Admin | Evitar dos pedidos del mismo caso |
| Analizar reclamos | Admin | Informe sobre volumen, zonas, tipos |
| KPIs sugeridos | Admin | Indicadores recomendados |
| Informe unificado | Admin | Texto resumen para gerencia |
| Borrador en chat humano WA | Admin | Redactar respuesta al vecino |

Pasos genéricos:

1. Buscá el botón con ícono de **varita / IA** en la pantalla correspondiente.
2. Esperá la respuesta (puede tardar unos segundos).
3. **Leé y corregí** antes de aplicar o enviar.

---

## Anexo A — Cooperativa eléctrica

### A.1 Tipos de reclamo en menú WhatsApp y en oficina

1. Corte de Energía  
2. Cables Caídos/Peligro  
3. Problemas de Tensión  
4. Poste Inclinado/Dañado  
5. Consumo elevado  
6. Alumbrado Público (Mantenimiento)  
7. Riesgo en la vía pública  
8. Corrimiento de poste/columna  
9. Pedido de factibilidad (nuevo servicio)  
10. Denuncia de fraude (anónima)  
11. Otros  

### A.2 Prioridades automáticas (ejemplos)

| Tipo | Prioridad sugerida |
|------|-------------------|
| Cables Caídos/Peligro | Crítica |
| Poste Inclinado/Dañado | Crítica |
| Riesgo en la vía pública | Crítica |
| Corrimiento de poste/columna | Crítica |
| Corte de Energía | Alta |
| Problemas de Tensión | Alta |
| Denuncia de fraude (anónima) | Alta |

### A.3 Solo en cooperativa eléctrica

1. **Catálogo de socios** con **NIS** y **medidor** separados.  
2. **Red Eléctrica** (import Excel) y selector de **distribuidor**.  
3. **Trafo** en pedido cuando aplica.  
4. **SAIDI / SAIFI** en estadísticas.  
5. **Denuncia de fraude anónima** por WhatsApp.  
6. **Descargo** y **reapertura** por valoración baja del socio.  
7. **Derivación** a cooperativa de agua u otra energía cuando el tipo no es eléctrico.  
8. Sugerencia de **distribuidor/trafo por proximidad** en reclamos anónimos con ubicación.  

### A.4 Pestañas de admin que NO usa el eléctrico (por defecto)

- Catálogo legacy **Distribuidores** (tabla vieja) — oculto.  
- **Métricas SAIDI/SAIFI** por Excel legacy — oculto.  
- En su lugar: pestaña **Red Eléctrica** activa.  

---

## Anexo B — Municipio

### B.1 Tipos de reclamo en menú WhatsApp y en oficina

1. Alumbrado Público  
2. Bacheo y Pavimento  
3. Recolección/Poda  
4. Espacios Verdes  
5. Alcantarillas tapadas  
6. Recolección (otros)  
7. Obstrucción de Cloaca  
8. Limpieza de Zanjas  
9. Rotura de Caño de cloacas  
10. Tránsito (incluye señalización y semáforos)  
11. Ruidos molestos / Perturbación  
12. Animales sueltos / Mascotas  
13. Otros  

### B.2 Prioridades automáticas (ejemplos)

| Tipo | Prioridad sugerida |
|------|-------------------|
| Obstrucción de Cloaca | Crítica |
| Rotura de Caño de cloacas | Crítica |
| Alumbrado Público | Alta |
| Bacheo y Pavimento | Alta |
| Alcantarillas tapadas | Alta |
| Espacios Verdes | Baja |
| Ruidos molestos / Perturbación | Baja |
| Animales sueltos / Mascotas | Baja |

### B.3 WhatsApp — submenús especiales (municipio)

Cuando el vecino elige tipos relacionados con **Tránsito** u **Orden público**, el bot puede mostrar **submenús** con opciones más finas (semáforos, señalización, vehículo mal estacionado, etc.). Seguí las instrucciones numeradas que aparezcan en el chat.

### B.4 Solo en municipio (o muy usado en municipio)

1. **Catálogo de vecinos** (no NIS eléctrico).  
2. **Barrios / zonas** en import Excel y estadísticas por barrio.  
3. **Derivación a Policía** configurable en Empresa.  
4. **Derivación** a empresa de energía y cooperativa de agua desde el detalle.  
5. Gráfico de **tiempo de cierre por barrio**.  
6. **Motivos de desestimación** en estadísticas.  
7. **Corte programado** en avisos masivos (junto con aviso general).  

### B.5 Pestañas de admin en municipio

- **Distribuidores / Barrios:** visible para cargar zonas del municipio.  
- **Clientes afectados** (infra eléctrica por trafo): suele estar **oculta** en municipio.  
- **Red Eléctrica** (pestaña eléctrica): **no** es la operativa principal en municipio.  

---

## Tabla comparativa rápida

| Función | Cooperativa eléctrica | Municipio |
|---------|:--------------------:|:---------:|
| Menú WhatsApp propio del rubro | Sí (11 tipos) | Sí (13 tipos) |
| Catálogo NIS / medidor | Sí | No (vecinos) |
| Catálogo barrios | No principal | Sí |
| Red Eléctrica + SAIDI/SAIFI | Sí | No |
| Fraude anónimo WA | Sí | No |
| Descargo por mala valoración | Sí | Según config. |
| Derivación Policía | No típico | Sí (config.) |
| Derivación energía/agua | Sí (saliente) | Sí (entrante) |
| Submenú Tránsito WA | No | Sí |
| Geocerca + chat + fotos antes/después | Sí | Sí |
| Incidencias | Sí | Sí |
| App Android | Sí | Sí |
| Avisos masivos WA | Sí | Sí |
| Corte programado masivo | Sí | Sí |

---

## 20. Problemas frecuentes y qué hacer

| Problema | Qué hacer |
|----------|-----------|
| No puedo iniciar sesión | Verificá usuario activo y contraseña; pedí reset al admin. |
| No veo pedidos (técnico) | Confirmá que te **asignaron**; revisá filtros y pestaña correcta. |
| No llega WhatsApp al vecino | Revisá teléfono con código país (549…); confirmá que el servidor WA esté activo. |
| Geocerca no me deja iniciar | Acercate al pin del reclamo; revisá GPS activo en el celular. |
| El mapa no muestra un pedido nuevo | Recargá la página o sincronizá; revisá filtros y pestaña de estado. |
| No aparece pestaña Red Eléctrica | Tu tenant puede ser **municipio**; en eléctrico debe estar configurado el rubro. |
| Chat interno no notifica | Revisá que la API esté en línea; en Android revisá permisos de notificaciones. |
| Cambios offline no suben | Volvé a tener datos; abrí la app y esperá sincronización. |

---

## Cierre — mensaje para promoción

**GestorNova** permite a una **cooperativa eléctrica** o a un **municipio** atender reclamos con el mismo nivel de orden que una empresa grande: un solo mapa, cuadrillas conectadas, el vecino informado por WhatsApp y evidencia de cada cierre. Este manual recorre **todas las opciones principales** paso a paso; tu implementación puede ocultar algún módulo según contrato — en duda, consultá con el administrador del sistema en tu organización.

---

*Documento de usuario · GestorNova · Cooperativa eléctrica y municipio · made by leavera77*
