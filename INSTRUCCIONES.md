# Instrucciones — compilar y probar en Android Studio (Nexxo)

Proyecto local habitual: `C:\Users\leave\AndroidStudioProjects\Nexxo`  
Repositorio remoto: **Pedidos-Manteniemiento-Android** (`main`).

## 1. Abrir el proyecto

1. Abrí **Android Studio**.
2. **File → Open** y elegí la carpeta **Nexxo** (la que contiene `app/`, `build.gradle`, etc.).
3. Esperá a que termine **Gradle Sync** (barra de progreso; si falla, revisá JDK y conexión).

## 2. Dispositivo o emulador

- **Dispositivo físico:** activá **Opciones de desarrollador** y **Depuración USB**; conectá el cable USB.
- **Emulador:** **Tools → Device Manager** → **Create Device** → elegí una imagen API reciente → **Run** el AVD.

## 3. Compilar y ejecutar

1. Elegí el módulo **app** y el dispositivo en la barra superior.
2. **Run → Run 'app'** o **Shift+F10**.
3. La app carga la UI web desde `app/src/main/assets/` (WebView).

## 4. Probar las correcciones de interfaz

- **Panel Pedidos:** deslizá la lista verticalmente; no debe quedar el scroll bloqueado.
- **Botones redondos del mapa** (GPS / centrar): deben verse circulares, sin texto cortado.
- **Mapa y barra superior:** compará con el navegador (GitHub Pages o `index.html` local) si necesitás paridad visual.

Si no ves cambios en assets: **Build → Clean Project** y volvé a **Run**.

## 5. Generar APK (opcional)

**Build → Build Bundle(s) / APK(s) → Build APK(s)**. El APK generado aparece en la notificación “locate”.

---

made by leavera77
