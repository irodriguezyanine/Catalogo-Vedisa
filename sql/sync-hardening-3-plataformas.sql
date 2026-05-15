-- Hardening de sincronizacion bidireccional
-- Tasaciones <-> Subastas <-> Catalogo (base compartida Supabase)
--
-- Ejecutar en la misma base usada por los 3 proyectos.

BEGIN;

-- 1) Columnas base en remates para clasificar remate/venta_directa y ventana temporal.
ALTER TABLE public.remates
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'remate';

ALTER TABLE public.remates
  ADD COLUMN IF NOT EXISTS fecha_hora_inicio TIMESTAMPTZ;

ALTER TABLE public.remates
  ADD COLUMN IF NOT EXISTS fecha_hora_cierre TIMESTAMPTZ;

ALTER TABLE public.remates
  DROP CONSTRAINT IF EXISTS remates_tipo_check;

ALTER TABLE public.remates
  ADD CONSTRAINT remates_tipo_check
  CHECK (tipo IN ('remate', 'venta_directa'));

-- 2) Asegura unicidad funcional en items para evitar duplicados cruzados.
CREATE UNIQUE INDEX IF NOT EXISTS idx_remates_items_remate_patente_doc
  ON public.remates_items (remate_id, patente, tipo_documento);

-- 3) Asegura integridad entre remates y remates_items.
DO $$
DECLARE
  fk_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'remates_items'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND tc.constraint_name = 'remates_items_remate_id_fkey'
  ) INTO fk_exists;

  IF NOT fk_exists THEN
    ALTER TABLE public.remates_items
      ADD CONSTRAINT remates_items_remate_id_fkey
      FOREIGN KEY (remate_id)
      REFERENCES public.remates(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 4) Vista de salud para revisión operativa rápida.
CREATE OR REPLACE VIEW public.sync_3_plataformas_health AS
SELECT
  (SELECT count(*) FROM public.remates) AS remates_total,
  (SELECT count(*) FROM public.remates WHERE estado = 'abierto') AS remates_abiertos,
  (SELECT count(*) FROM public.remates WHERE tipo = 'venta_directa') AS remates_venta_directa,
  (SELECT count(*) FROM public.remates_items) AS remates_items_total,
  (SELECT count(*) FROM public.inventario WHERE estado_retiro = 'en_bodega_a_remate') AS inventario_en_remate,
  (SELECT count(*) FROM public.inventario WHERE estado_retiro = 'en_bodega_a_venta_directa') AS inventario_en_venta_directa;

COMMIT;
