-- Asocia el "Phone number ID" de Meta (WhatsApp Cloud API) al cliente/tenant en Neon.
-- Lo ves en Meta Developers → WhatsApp → API Setup (Phone number ID).
-- El webhook envía este valor en cada mensaje (metadata.phone_number_id).

-- Ejemplo: cooperativa / municipio con clientes.id = 1
UPDATE clientes
SET configuracion = COALESCE(configuracion, '{}'::jsonb)
  || jsonb_build_object('meta_phone_id', 'REEMPLAZAR_PHONE_NUMBER_ID_DE_META')
WHERE id = 1;

-- Repetir por cada tenant con su propio número de WhatsApp Business distinto.
