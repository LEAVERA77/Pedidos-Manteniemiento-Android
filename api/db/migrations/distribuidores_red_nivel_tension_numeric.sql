-- nivel_tension: kV tal como en Excel (13.2, 33, 132) — no dividir por 10 al mostrar.
-- made by leavera77

ALTER TABLE distribuidores_red
  ALTER COLUMN nivel_tension TYPE NUMERIC(10, 2)
  USING nivel_tension::numeric;

COMMENT ON COLUMN distribuidores_red.nivel_tension IS 'Nivel de tensión en kV (entero o decimal según Excel; ej. 13.2, 33, 132).';
