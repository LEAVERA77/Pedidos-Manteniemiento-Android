# Ícono launcher (Nexxo / GestorNova)

## Cómo está armado en el repo

| Recurso | Rol |
|---------|-----|
| `AndroidManifest.xml` | `android:icon="@mipmap/ic_launcher"` y `android:roundIcon="@mipmap/ic_launcher_round"` |
| `mipmap-anydpi-v26/ic_launcher.xml` | Ícono **adaptativo** (API 26+): fondo + primer plano |
| `mipmap-anydpi-v26/ic_launcher_round.xml` | Igual para variante redonda |
| `drawable/ic_launcher_background.xml` | Vector de fondo (verde + rejilla de plantilla) |
| `mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/` | `ic_launcher.webp`, `ic_launcher_round.webp`, `ic_launcher_foreground.webp` — **legacy + capas del adaptativo** |
| `drawable/ic_launcher_foreground.xml` | Vector “robot” de plantilla Android; **el adaptativo usa los `.webp` de `mipmap-*`, no este drawable** (salvo que cambies el XML a `@drawable/...`) |

**Capa monochrome (temática Android 13+):** se **omitió** a propósito en los XML adaptativos: el Asset Studio a veces falla con *“Failed to transform monochrome image… trim… parameter image”*. Sin `<monochrome>`, el sistema aplica el estilo con tint sobre el **foreground** (comportamiento documentado por Google).

## Si el Asset Studio (“Image Asset”) falla

1. **Trim:** poné **No** en la capa foreground.
2. Pestaña **Monochrome:** dejala vacía / sin imagen si el asistente lo permite, o desactivá monocromo.
3. Actualizá **Android Studio** (Help → Check for Updates).
4. **Alternativa manual:** exportá PNG/WebP por densidad y reemplazá solo `ic_launcher_foreground.webp` en cada `mipmap-*` (y si querés también `ic_launcher.webp` / `ic_launcher_round.webp`), sin pasar por el asistente.

## Después de cambiar recursos

Build → **Clean Project**, luego **Rebuild**. Instalá de nuevo la app para ver el ícono en el launcher (a veces el launcher cachea).

## Volver a tener monocromo custom (opcional)

1. Creá `drawable/ic_launcher_monochrome.xml` (vector blanco/negro simple, 108dp) **o** generá `ic_launcher_monochrome.webp` por densidad.
2. Volvé a añadir en `ic_launcher.xml` e `ic_launcher_round.xml`:

   `<monochrome android:drawable="@drawable/ic_launcher_monochrome" />`  
   (o `@mipmap/...` si usás webp).
