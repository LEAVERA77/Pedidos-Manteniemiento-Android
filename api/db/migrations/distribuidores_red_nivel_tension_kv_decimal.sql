-- TRUE cuando nivel_tension guarda décimas de kV (Excel con decimal: 13,2 → 132).
-- FALSE = kV enteros tal cual (33, 132).
-- made by leavera77

ALTER TABLE distribuidores_red
  ADD COLUMN IF NOT EXISTS nivel_tension_kv_decimal BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN distribuidores_red.nivel_tension_kv_decimal IS
  'Si TRUE, nivel_tension está en décimas de kV (solo si el Excel traía punto/coma decimal).';
