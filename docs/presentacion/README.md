# Presentaciones GestorNova (Word)

Documentos para reuniones comerciales y presentación del producto.

| Archivo | Audiencia |
|---------|-----------|
| `GestorNova-Cooperativa-Electrica.docx` | Cooperativas y distribuidoras eléctricas |
| `GestorNova-Municipios.docx` | Municipalidades |

## Contenido

Cada documento incluye:

- Título y resumen ejecutivo
- **Tabla resumen** de funciones (área → detalle)
- Secciones con títulos, párrafos y viñetas
- Tipos de reclamo por rubro
- Anexo técnico `WHAPI_BROADCAST_BLOCK_ON_LOW_RATIO`

## Regenerar

No requiere Microsoft Word (generación Open XML):

```powershell
powershell -ExecutionPolicy Bypass -File docs/scripts/generar-presentaciones-gestornova-word.ps1
```

La primera ejecución reutiliza un `.docx` existente en esta carpeta como plantilla de estilos (`_ooxml-template/`).

Documentación técnica de masivos WhatsApp: `api/docs/WHAPI_BROADCAST_COMPLIANCE.md`

made by leavera77
