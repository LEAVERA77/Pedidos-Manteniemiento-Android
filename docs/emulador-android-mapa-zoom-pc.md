# Zoom al mapa en el emulador (solo controles de PC)

Guía breve para probar el mapa (p. ej. Leaflet en el panel web dentro del WebView) **sin añadir botones ni controles extra** en la pantalla del dispositivo o del emulador.

## Simular el gesto de pellizco (pinch)

En el **emulador de Android Studio** el zoom táctil se puede imitar con ratón y teclado:

| Sistema | Acción |
|--------|--------|
| **Windows / Linux** | Mantener **Ctrl**, pulsar **clic izquierdo** y **arrastrar** (como si separaras o juntaras dos dedos). |
| **macOS** | Suele usarse **⌘ (Cmd)** con clic y arrastre. Si no responde, probar **Ctrl** con el mismo gesto. |

Ese atajo envía al sistema algo equivalente a un pinch; es lo más parecido al zoom con dos dedos en un móvil.

## Rueda del ratón (Ctrl + rueda)

A veces se usa **Ctrl + rueda** para acercar/alejar. **No está garantizado**: depende de la versión del emulador, del foco y de cómo el **WebView** entrega eventos al mapa. Si no hace nada, no es obligatoriamente un fallo tuyo: el gesto tipo **pinch simulado** (Ctrl/Cmd + arrastrar) suele ser más fiable para mapas pensados para táctil.

## Emulador embebido en Android Studio

Si el AVD corre **dentro de la ventana del IDE** (“tool window”), el pinch simulado **a veces falla o se comporta mal**. Conviene:

- Abrir el emulador en **ventana independiente**, o
- Revisar en ajustes del emulador la opción relacionada con **Launch in a tool window** y desactivarla si querés ventana suelta.

Después de eso, volver a probar **Ctrl (o Cmd) + clic + arrastrar**.

## Dónde ver los atajos del emulador

- Menú del emulador → **Extended controls** (tres puntos **⋯**) → ayuda o lista de atajos.
- En muchas versiones, con el foco en el emulador: **F1** abre la ayuda de atajos (en macOS puede variar; revisar la ayuda del panel).

Ahí aparecen los gestos multitáctiles soportados por vuestra build del emulador.

## Si el mapa sigue sin hacer zoom

Puede ser **limitación de eventos** en la cadena **WebView → página (Leaflet) → capas**, no solo del emulador: por ejemplo, la rueda o ciertos gestos no se propagan igual que en Chrome de escritorio. En ese caso conviene contrastar el mismo flujo en **navegador de escritorio** y en **dispositivo físico** para saber si el problema es del emulador o del entorno web embebido.

---

*Documento operativo para el equipo GestorNova / Nexxo.*
