# Recuperación de contraseña administrativa por correo

> Esta es una mitigación parcial de la recuperación existente, **no** el mecanismo futuro de recuperación supervisada ni MFA. El gateway SQL heredado y las demás vías alternativas deben migrarse o desactivarse para que no puedan eludir los controles de acceso. Los clientes o APK antiguos pueden conservar el flujo inseguro: planificar su actualización y la retirada de credenciales directas a la base.

## Configuración del servidor

1. Configurar en Render (u otro servidor) `EMAILJS_PUBLIC_KEY`, `EMAILJS_SERVICE_ID` y `EMAILJS_TEMPLATE_ID_RESET` (o `EMAILJS_TEMPLATE_ID`); configurar `EMAILJS_PRIVATE_KEY` si el proveedor lo exige. No publicar ni compartir secretos. El servidor debe tener un `JWT_SECRET` aleatorio y seguro.
2. Configurar previamente un correo de contacto confiable de la entidad en `clientes.configuracion`, o un correo válido de la cuenta administrativa. Verificar con una persona autorizada que ese correo es controlado por la entidad. No usar una casilla compartida sin controles.
3. En EmailJS, la plantilla debe utilizar `{{email_subject}}`, `{{{email_body}}}` y como destinatario `{{to_email}}`. Verificar que la plantilla no reenvíe el código a terceros. Probar con una cuenta autorizada y un buzón de prueba.
4. La web y Android deben tener configurada la URL de API. El correo y las plantillas suministrados por el cliente no se usan como configuración del servidor.

## Cómo funciona

- El solicitante indica el usuario. El servidor busca la cuenta activa, comprueba que sea administradora y obtiene su entidad de la base. El código se envía exclusivamente al correo de contacto configurado para esa entidad; si falta, al correo válido de esa cuenta. No se puede introducir un destino alternativo desde el modal.
- El código de seis dígitos vence a los 30 minutos, se almacena como HMAC y se consume de forma atómica al cambiar la contraseña. Tras el despliegue o la rotación del secreto JWT, los códigos anteriores dejan de servir: hay que solicitar uno nuevo.
- La confirmación necesita el identificador devuelto por la solicitud inicial; las versiones recientes del modal ya lo envían. Si el correo falla, se intenta invalidar el desafío correspondiente.
- Se exige conexión y API. Ya no se genera ni muestra un código local en Android ni se modifica la contraseña por SQL desde el cliente. Si el servicio de correo no está configurado, el mecanismo falla cerrado y habrá que contactar al administrador o soporte autorizado.
- Los técnicos solicitan una clave provisional a un administrador, conforme al flujo de usuarios. Este cambio no modifica su cola offline.
- El módulo legado alternativo `recuperar-contrasena-mail.js`, que no se encontró conectado al flujo principal revisado, también queda limitado a la API: no genera códigos ni cambia contraseñas por SQL desde el cliente.
- Tras confirmar un cambio de contraseña, las interfaces intentan borrar la credencial biométrica guardada en **ese dispositivo**. Esto no revoca credenciales en otros equipos ni corrige el almacenamiento local sin cifrado propio.

## Límites y comprobaciones antes de producción

- Actualizar API y cliente de manera coordinada. Verificar el correo y EmailJS en el servidor **antes** de publicar, o la recuperación por correo quedará temporalmente inutilizable. No usar como prueba cuentas ni direcciones de terceros.
- Los límites existentes son por IP y en memoria de cada instancia; no son protección distribuida ni reemplazan un límite por cuenta. Los usuarios y el correo pueden ser identificables por la respuesta de esta ruta. Las contraseñas aceptadas siguen la política anterior y las sesiones previas no se revocan automáticamente al cambiar la contraseña.
- La recuperación por correo no equivale a TOTP, passkey, aprobación de equipos ni recuperación supervisada. Mientras el SQL genérico, un cliente viejo o acceso directo a la base sigan disponibles, no se garantiza que no haya formas de eludir esta ruta.
- El código no demuestra que Render o EmailJS estén configurados en la instalación real. Verificar pruebas y restauración de respaldos antes de cualquier cambio de credenciales o esquema.
