# Migración de WebView a app nativa (Android)

## ¿Se puede hacer “automáticamente”?

**No de forma fiable ni completa.** Una app que carga casi toda la experiencia en un único HTML/JS (miles de líneas, mapas, formularios, panel de administración, materiales, fotos, etc.) no tiene un conversor que genere pantallas nativas equivalentes. Lo que implica un paso a nativo es, en la práctica, **volver a implementar** la interfaz y parte de la lógica en Kotlin (o Java) con **Jetpack Compose** o **Views**, más capas de red, estado y navegación.

Ese trabajo es del orden de **semanas o meses**, según paridad de funciones con la web y con [Pedidos-MG](https://github.com/LEAVERA77/Pedidos-MG) (GitHub Pages).

## Qué hay hoy en este proyecto

| Componente | Rol |
|--------------|-----|
| `MainActivity` + `WebView` | Contenedor principal de la UI |
| `app/src/main/assets/index.html` | Aplicación “SPA” embebida (tamaño elevado) |
| Puentes JS (`AndroidPrint`, `AndroidLocalNotify`, `AndroidConfig`, `AndroidSession`, `AndroidDevice`) | Integración sistema: impresión, notificaciones, config, sesión, dispositivo |
| `PedidoPollingScheduler` / workers | Pedidos en segundo plano |
| `UbicacionPollingScheduler` / `UbicacionWorker` | Ubicación |
| `NetworkWatchdogService` | Vigilancia de red |
| `AppUpdateChecker` | Comprobación de actualizaciones |

La API en `api/` puede seguir siendo el backend; la migración nativa consume los mismos endpoints (u otros definidos explícitamente), en lugar de depender del JS del WebView.

## Enfoque recomendado: migración por fases

1. **Inventario funcional**  
   Listar pantallas y flujos (login, mapa, pedidos, administración, materiales, cierre, exportaciones, etc.) y mapearlos a llamadas HTTP / Neon ya usadas por el front actual.

2. **Capa de datos en Android**  
   Cliente HTTP (Retrofit u OkHttp), modelos, repositorios, manejo de errores y autenticación (tokens igual que hoy, si aplica).

3. **Shell nativo + una primera pantalla**  
   Por ejemplo: login nativo o lista de pedidos; el resto puede seguir en WebView dentro de un `Fragment` opcional hasta completar la paridad.

4. **Sustituir pantalla a pantalla**  
   Mapa con **Maps SDK for Android** (o Compose Maps), formularios con Compose, listas con `LazyColumn`, etc.

5. **Puente gradual**  
   Retirar interfaces JS conforme cada función exista en Kotlin.

6. **Coherencia con la web**  
   Si [Pedidos-MG](https://leavera77.github.io/Pedidos-MG) sigue siendo la fuente del HTML, definir si el Android nativo es **solo** cliente de API (recomendado) o si habrá dos frontends que mantener alineados a mano.

## Criterio de “terminado”

Definir explícitamente: misma paridad que la PWA actual, o un **MVP nativo** (por ejemplo mapa + pedidos sin panel admin completo).

## Referencia del repositorio

Código y issues: [LEAVERA77/Pedidos-Manteniemiento-Android](https://github.com/LEAVERA77/Pedidos-Manteniemiento-Android).
