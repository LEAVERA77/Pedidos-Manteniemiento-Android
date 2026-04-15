# Presentacion ejecutiva de GestorNova

## Que es GestorNova

GestorNova es una solucion para que una entidad pueda gestionar reclamos y pedidos de principio a fin, con dos versiones conectadas entre si:

- version web para administracion (oficina)
- version Android para cuadrillas tecnicas (calle)

La idea central es simple: ordenar el trabajo diario, responder mas rapido al vecino y tener control real de lo que pasa en cada reclamo.

## Valor para la entidad (en lenguaje no tecnico)

- Mejora la atencion al vecino: cada reclamo tiene seguimiento claro.
- Da orden interno: se reducen mensajes sueltos, planillas separadas y tareas sin responsable.
- Permite priorizar mejor: con mapa y estados en tiempo real.
- Aumenta productividad de cuadrillas: el tecnico recibe y reporta desde el celular.
- Mejora la transparencia: se puede ver que se hizo, cuando y por quien.
- Es escalable: sirve para una entidad chica y tambien para crecer a mayor volumen.

## Fortalezas de la version web (administracion)

- Panel central para ver todos los reclamos.
- Filtros por estado, tipo, zona y prioridad.
- Vista de mapa para decidir asignaciones con mejor criterio.
- Dashboard operativo para seguimiento de la gestion.
- Herramientas de geolocalizacion y correccion manual de ubicacion.
- Gestion de usuarios, configuraciones y parametros de operacion.
- Integracion con API para automatizar procesos y notificaciones.

## Fortalezas de la version Android (cuadrillas)

- Flujo pensado para trabajo en campo.
- Acceso rapido al pedido asignado y sus datos clave.
- Actualizacion de avance y cierre desde el telefono.
- Interfaz integrada con mapa para ubicar y validar tareas.
- Continuidad operativa en escenarios de conectividad variable.
- Misma logica de negocio que la version web (menos errores y menos confusion).

## Comunicacion con vecinos por WhatsApp

El sistema ya integra WhatsApp para mantener informado al vecino en momentos clave:

- alta del reclamo
- cambios de estado
- avance de trabajo
- cierre del pedido

Esto reduce consultas repetidas y mejora la percepcion de servicio.

## Respaldo de base de datos y recuperacion (ya implementado)

El proyecto ya trabaja con una politica de respaldo operativo para asegurar continuidad:

- existen copias de seguridad restaurables de los repositorios en carpeta dedicada de backups
- se generan bundles Git completos para recuperacion de historial
- hay procedimiento de restauracion documentado para volver rapidamente a estado operativo

Esto permite recuperarse ante errores humanos o fallos de equipo con bajo impacto.

## Medidas de seguridad ya implementadas

Sin entrar en tecnicismos, hoy el sistema ya cuenta con controles importantes:

- autenticacion por usuario y token de sesion
- control de permisos por rol (por ejemplo, acciones solo de administrador)
- separacion de datos por tenant/cliente para evitar mezclas entre entidades
- validaciones de entrada en API para reducir errores y usos indebidos
- CORS controlado para limitar origenes permitidos
- limitacion de trafico (rate limiting) en rutas sensibles
- verificacion de webhooks y tokens en integraciones de WhatsApp
- endpoints de salud y monitoreo basico para detectar caidas

En resumen: ya hay una base de seguridad real para operacion productiva.

## Resultado esperado para una entidad

Con GestorNova, la entidad puede pasar de una operacion reactiva y desordenada a una operacion trazable, medible y orientada a servicio.

Beneficios directos:

- mejor tiempo de respuesta
- mejor organizacion de cuadrillas
- menor perdida de informacion
- mayor control de gestion
- mejor imagen institucional frente al vecino

## Cierre

GestorNova no es solo una app: es una herramienta de gestion operativa completa para entidades que necesitan ordenar reclamos, mejorar atencion y tener control diario con evidencia.

made by leavera77
