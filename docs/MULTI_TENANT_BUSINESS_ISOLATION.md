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
- Nunca se purgan datos al cambiar de negocio: solo cambia el filtro activo.
