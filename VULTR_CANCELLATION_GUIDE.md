# Guía: cancelar el VPS Vultr (post-migración Nominatim)

**Cuándo usar:** cuando Oracle + Render + pruebas funcionen y ya no necesites `45.76.3.146`.

## Antes de cancelar

1. **Confirmar** que `NOMINATIM_BASE_URL` en Render apunta a Oracle (`RENDER_ENV_VARS.md`) y que hubo **redeploy** exitoso.
2. **Probar** geocodificación en condiciones reales (panel, bot, pipeline que use Nominatim).
3. **Backup** (si guardabas algo solo en ese VPS): snapshots, volúmenes, `docker export`, dumps — lo que aplique.
4. **Revisar facturación:** período ya pagado, prorrateos, cargos por IP reservada o backups.

## Pasos típicos en Vultr (panel web)

1. Iniciar sesión en [Vultr](https://www.vultr.com/).
2. **Products** → seleccionar la instancia asociada a `45.76.3.146`.
3. **Opciones** → **Server Destroy** / **Delete** (nombre exacto puede variar).
4. Confirmar el nombre del servidor o código que pida el panel.
5. Opcional: eliminar **Floating IP**, **Snapshots** o **Block Storage** vinculados si ya no se usan (evita cargos residuales).

## Advertencias

- **Irreversible:** al destruir la instancia se pierde el disco salvo snapshot previo.
- **DNS / firewall:** si algo externo aún apuntaba a esa IP, dejará de responder; ya debería estar migrado a Oracle.
- **Rollback:** ver `MIGRATION_VULTR_TO_ORACLE.md` — tras borrar Vultr, **no** podrás volver a `45.76.3.146` sin nuevo servidor.

## Después de cancelar

- [ ] Anotar fecha de baja y último cobro en la hoja interna de costos.
- [ ] Archivar esta migración junto con `MIGRATION_VULTR_TO_ORACLE.md`.

---

`made by leavera77`
