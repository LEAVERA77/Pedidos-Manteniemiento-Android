# Aislamiento por tenant y negocio

Este documento define el modelo operativo multi-tenant con múltiples líneas de negocio por tenant.

## Regla de aislamiento

La unidad de aislamiento es:

- `tenant_id`
- `business_type`

Cada combinación `tenant_id + business_type` ve únicamente sus datos operativos (`pedidos`, `socios_catalogo`, KPIs, estadísticas y usuarios no admin).

## Tablas de control

- `tenant_businesses`: catálogo de negocios habilitados por tenant.
- `tenant_active_business`: negocio activo por tenant para sesión operativa.

Compatibilidad:

- `clientes.active_business_type` se mantiene sincronizado para no romper flujos existentes.

## Endpoints

- `POST /api/setup/wizard`
  - Registra combinación `tenant + business_type` si no existe.
  - Activa ese negocio.
  - Devuelve `datos_existentes` y `total_registros`.
  - **Nueva instancia (2026-04):** si en `clientes.configuracion` ya figura `setup_wizard_completado: true` y el par **(nombre normalizado + `business_type`)** difiere del tenant actual, se crea una **nueva fila `clientes`** (nuevo `tenant_id`), se mueve el **admin autenticado** al nuevo tenant, se devuelve `nueva_instancia: true`, `token` JWT nuevo y `require_logout_reload: true`. La numeración de pedidos por año queda aislada por tenant (tras migración `api/db/migrations/pedido_contador_tenant_id.sql`). Para **solo** cambiar la línea activa sin crear otro tenant, usá `POST /api/tenant/switch-business`.
- `POST /api/tenant/switch-business`
  - Cambia negocio activo sin borrar datos.
  - Requiere que la combinación exista en `tenant_businesses`.
- `GET /api/tenant/businesses`
  - Lista negocios disponibles del tenant autenticado y el activo actual.

## Middleware recomendado

- `businessContextMiddleware`: inyecta `req.activeBusinessType`.
- `tenantBusinessFilter`: versión estricta que valida negocio activo en `tenant_businesses`.

## Notas de implementación

- El admin puede ser global por tenant (`usuarios.business_type IS NULL`).
- Usuarios operativos deben estar asociados al `business_type` correspondiente.
- Nunca se purgan datos al cambiar de negocio con **switch-business**: solo cambia el filtro activo.
- El wizard con **nueva instancia** no borra el tenant anterior: queda en BD con sus datos; el admin que confirmó queda asociado al **nuevo** `clientes.id`.
