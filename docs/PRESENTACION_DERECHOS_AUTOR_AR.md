# Presentacion para Derechos de Autor (Argentina)

Autor: Leandro Vera  
DNI: 25.993.390  
Domicilio: Diagonal Comercio 247, Cerrito, Entre Rios

Fecha: ____ / ____ / ______

---

## 1. Objeto de la presentacion

Se presenta la obra de software denominada **Nexxo**, desarrollada por el autor arriba identificado, a los fines de su registro de derechos de autor en la Republica Argentina.

Descripcion breve de la obra:

- Aplicacion Android con WebView para gestion de pedidos de mantenimiento.
- Backend de datos sobre PostgreSQL (Neon).
- Funcionalidades de autenticacion, geolocalizacion, notificaciones, reportes y exportacion.

---

## 2. Documentacion recomendada para presentar

Armar una carpeta de presentacion con estos elementos:

1) **Formulario del tramite** (el que solicita Mi Argentina / DNDA al momento de iniciar).  
2) **Datos del autor y titularidad** (este documento firmado).  
3) **Memoria descriptiva funcional** (2-5 paginas):
- objetivo del sistema,
- modulos principales,
- tecnologias usadas,
- fecha aproximada de finalizacion/version.
4) **Copia de codigo fuente** (muestra representativa):
- archivos principales de logica,
- estructura de carpetas del proyecto,
- opcionalmente hash/identificador de version (commit).
5) **Evidencia de autoria y version**:
- repositorio Git (historial),
- capturas de app,
- APK firmado de referencia (opcional).
6) **Declaracion de originalidad** (texto simple firmado por el autor).

Nota: los requisitos exactos pueden variar segun el tipo de tramite vigente en Mi Argentina/DNDA. Confirmar en el formulario actual antes de subir.

---

## 3. Que NO conviene presentar (importante)

No incluir en la documentacion publica o del expediente:

- Credenciales reales (tokens, claves API, passwords, connection strings).
- Secrets de GitHub Actions (`ADMIN_RECOVERY_KEY`, claves EmailJS, etc.).
- Keystore de firma (`.jks`) ni contrasenas de firma.
- Datos personales de terceros (usuarios reales, mails, telefonos, ubicaciones).
- Base de datos productiva completa o backups con datos sensibles.

Si un archivo contiene secretos, generar una version "sanitizada" para presentacion.

---

## 4. Ofuscar o no ofuscar para el tramite

### Recomendacion practica

- **Para el deposito/registro de autoria:** **NO ofuscar** el material principal que se presenta como prueba de creacion.  
- **Si hay secretos:** no ofuscar; **reemplazar secretos por placeholders** (ejemplo: `YOUR_API_KEY`), manteniendo la logica legible.

### Por que

- La finalidad del registro es acreditar autoria/fecha de la obra.
- Un material excesivamente ofuscado puede dificultar identificar la originalidad tecnica.

---

## 5. Checklist final antes de presentar

- [ ] El paquete de presentacion no contiene credenciales ni secretos.
- [ ] Se incluye identificacion completa del autor.
- [ ] Se adjunta memoria descriptiva y muestra de codigo.
- [ ] Se conserva copia privada con evidencia completa (repo, commits, APK).
- [ ] Se revisa el formulario vigente del tramite en Mi Argentina/DNDA.

---

## 6. Declaracion sugerida (modelo corto)

"Yo, Leandro Vera, DNI 25.993.390, con domicilio en Diagonal Comercio 247, Cerrito, Entre Rios, declaro ser autor de la obra de software 'Nexxo' y presento la documentacion adjunta a efectos del registro de derechos de autor."

Firma: ______________________  
Aclaracion: Leandro Vera  
DNI: 25.993.390

---

## 7. Anexo recomendado (opcional)

Adjuntar una hoja con:

- Nombre del proyecto: Nexxo
- Version presentada: __________
- Fecha de corte del codigo: __________
- URL del repositorio (si corresponde): __________
- Hash de commit de referencia: __________

---

Este documento es una guia practica de preparacion documental y no reemplaza asesoramiento legal profesional.
