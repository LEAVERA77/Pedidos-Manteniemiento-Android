# Solución propuesta: acceso seguro para administradores

## Objetivo y alcance

Reducir el riesgo de que una persona ajena ingrese como administrador con una contraseña robada o desde un equipo no autorizado. Los controles nuevos se aplicarán **solo a administradores**; los técnicos conservarán su modo de trabajo offline actual.

**Estado: solución propuesta, todavía no implementada por completo.** Microsoft Authenticator, Windows Hello, la aprobación de equipos y la recuperación por otro administrador aún no están activos. No debe considerarse que el acceso administrativo ya está protegido por estos mecanismos.

## Cómo funcionará

1. El administrador ingresa su usuario y contraseña con conexión a la API.
2. Confirma un código de seis dígitos generado por **Microsoft Authenticator** u otra aplicación compatible con TOTP. El código es temporal; el servidor debe verificarlo, limitar intentos e impedir su reutilización.
3. En equipos compatibles, se añade **Windows Hello** mediante WebAuthn: Windows solicita el PIN o la biometría localmente. GestorNova no debe pedir, recibir ni almacenar el PIN de Windows. Para Android y otros equipos habrá que definir y probar un mecanismo compatible; no debe existir un cambio silencioso a un método más débil para evitar Hello.
4. El equipo o credencial debe haber sido **aprobado por un administrador ya autorizado**. Una solicitud de alta permanece pendiente hasta que se verifique la identidad por un canal independiente. Deben poder verse y revocarse los equipos aprobados.
5. Solo después de completar las verificaciones, la API emite la sesión. Para que copiar un token no sea suficiente, la sesión deberá vincularse a una clave del cliente y las solicitudes protegidas deberán demostrar su posesión. El servidor debe comprobar la revocación y el estado de la cuenta.

**Diferencia importante:** un código TOTP verifica un segundo factor de la cuenta, pero no identifica por sí solo la computadora. Windows Hello tampoco demuestra automáticamente que una persona pertenece a la empresa; la aprobación, la administración de usuarios y las políticas de acceso siguen siendo necesarias.

## Alta inicial y recuperación

- La primera activación debe hacerse mediante un procedimiento inicial seguro, independiente y verificable; conocer la contraseña por sí solo no debe aprobar automáticamente el primer equipo.
- Si un administrador pierde el autenticador o el equipo, **otro administrador autorizado** deberá verificar su identidad, revocar los factores o equipos anteriores y autorizar una nueva inscripción. La operación debe quedar registrada y cerrar las sesiones afectadas.
- **Pendiente de decisión:** cómo recuperar el acceso si la empresa tiene un solo administrador o ninguno de los demás puede ingresar. No debe habilitarse una opción de emergencia que omita los controles sin una verificación y auditoría adecuadas.
- Durante la inscripción TOTP se muestra un QR solo por un canal seguro; se confirma con un código antes de activar el factor. El secreto se cifra con una clave protegida fuera de la base de datos y no vuelve a mostrarse.

## Funcionamiento sin internet

El administrador deberá iniciar sesión **con conexión**. Los técnicos mantienen el modo offline. Sin conexión, ningún sistema puede comprobar en tiempo real si se revocó un usuario o un equipo.

Como avance parcial, el frontend actual rechaza el ingreso administrativo desde la caché offline, requiere una respuesta de login de la API y no restaura automáticamente una sesión administrativa después de recargar. Esto obliga al administrador a volver a ingresar al recargar y puede requerir un nuevo ingreso cuando expire el token. Al completar un login administrativo online se elimina su entrada de la caché offline de contraseña; pueden quedar entradas antiguas hasta ese momento. La cola offline y el acceso offline de técnicos se conservan.

**Esta comprobación del frontend no es una barrera de seguridad completa:** un cliente antiguo o modificado puede eludirla, y todavía no se exige TOTP ni Windows Hello en el servidor.

## Trabajo necesario antes de activarlo

1. Reemplazar y cerrar las rutas del gateway SQL genérico, aplicar aislamiento de tenants y permisos por rol en el servidor y la base de datos, y eliminar el acceso directo a Neon desde el cliente.
2. Cerrar o rediseñar las rutas de soporte, bootstrap, recuperación y demás vías alternativas que puedan emitir sesiones o modificar credenciales sin los nuevos controles. Revocar sesiones antiguas cuando se aplique la nueva política.
3. Implementar inscripción, verificación TOTP, WebAuthn/Windows Hello, aprobación y revocación de equipos, recuperación por otro administrador y protección contra copia de sesiones. Usar bibliotecas mantenidas y validar desafíos, origen y RP ID; no implementar criptografía propia improvisada.
4. Probar con dos tenants y roles distintos, además de intentos con contraseña correcta pero sin segundo factor, equipo no aprobado, códigos vencidos o repetidos, token copiado, equipo revocado y pérdida del autenticador. Verificar Android y navegadores reales, así como la recuperación inicial.
5. Hacer una transición gradual: enrolar primero, comprobar que existen administradores de recuperación y recién después exigir los factores. Probar el despliegue sin reabrir rutas inseguras.

El servidor también se endureció para rechazar un `JWT_SECRET` ausente, de ejemplo o demasiado corto al arrancar. Antes de desplegar, verificar que el servicio tenga un secreto aleatorio configurado; cambiarlo invalida las sesiones JWT existentes. Esta medida no implementa la autorización de equipos ni el segundo factor.

Para el detalle técnico y el estado del aislamiento de tenants, consultar [DISPOSITIVOS-AUTORIZADOS.md](DISPOSITIVOS-AUTORIZADOS.md) y [PLAN-SEGURIDAD-TENANTS-2FA.md](PLAN-SEGURIDAD-TENANTS-2FA.md).
