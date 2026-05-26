-- Flujo de opinión: post_cierre (inicial) | re_rating (tras descargo + chat humano)
ALTER TABLE cliente_opinion_pending ADD COLUMN IF NOT EXISTS opinion_flow VARCHAR(32) DEFAULT 'post_cierre';
