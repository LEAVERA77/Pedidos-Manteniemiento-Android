# Derivaciones desde el detalle del pedido

1. **Municipio y cooperativa de agua:** en el detalle del pedido, admin y supervisor ven el bloque **«Derivación a terceros»** con enlaces WhatsApp (`wa.me`) cuando en **Admin → Empresa** están activos `configuracion.derivaciones.energia` y/o `.agua` con número válido. Esos números son **contactos externos** para orientar al vecino; **no** son el número Meta del bot.

2. **Cooperativa eléctrica:** si el **tipo de reclamo** sugiere tema de agua u obra municipal, se muestra otro bloque que usa **`derivacion_reclamos`** (campos `cfg-drv-*` en Empresa). Ahí van los mismos contactos pero en formato internacional con `+`, pensados para **derivar el caso** cuando el reclamo no es de electricidad.

3. **No duplicar:** en rubro eléctrico no se repite el bloque de `derivaciones` JSON genérico; solo el aviso condicionado por tipo + `derivacion_reclamos`, más la config habitual de infra cuando corresponde.

4. **Bitácora en detalle:** la sección «Últimos cambios y auditoría» resume fechas (alta, asignación, avance, cierre) y usuarios ya guardados en el pedido (`usuario_creador`, técnico que inició/cerró, etc.). No añade tabla nueva en Neon; un historial evento a evento requeriría migración aparte.
