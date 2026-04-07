# Derivación de reclamos (cooperativa eléctrica)

En tenants `cooperativa_electrica`, el admin puede guardar contactos para orientar vecinos con reclamos de **agua** u **otra distribuidora eléctrica**, sin mezclar rubros en la operación diaria.

## JSON en `clientes.configuracion`

Clave: `derivacion_reclamos` (objeto). Slots opcionales `empresa_energia` y `cooperativa_agua`, cada uno con `nombre` (máx. 120) y `whatsapp` (internacional con `+`, solo dígitos después, 8–22 dígitos).

```json
"derivacion_reclamos": {
  "empresa_energia": { "nombre": "Distribuidora X", "whatsapp": "+5493415000111" },
  "cooperativa_agua": { "nombre": "Coope agua local", "whatsapp": "+543411223344" }
}
```

La API valida al guardar (`PUT /api/clientes/mi-configuracion`). La UI admin (solo eléctricas) y el bot WhatsApp usan estos datos cuando están configurados.
