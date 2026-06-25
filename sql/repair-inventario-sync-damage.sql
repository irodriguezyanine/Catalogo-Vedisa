-- Reparación post-sync: placeholders "Sin Modelo", glo3d_id corrupto, caché editor.
-- Ejecutar en Supabase SQL Editor (base compartida Tasaciones + Catálogo).
-- Recomendado: revisar SELECTs antes de cada UPDATE. Hacer backup o correr en transacción.

-- =============================================================================
-- 0) DIAGNÓSTICO RÁPIDO
-- =============================================================================

-- Filas con identidad corrupta por sync
SELECT id, patente, marca, modelo, glo3d_id,
       array_length(imagenes, 1) AS n_imagenes,
       aws_campos->>'marca' AS aws_marca,
       aws_campos->>'modelo' AS aws_modelo
FROM public.inventario
WHERE lower(trim(coalesce(modelo, ''))) IN ('sin modelo', 'no informado', '')
   OR lower(trim(coalesce(marca, ''))) IN ('sin marca', 'no informado', '')
ORDER BY patente;

-- glo3d_id con comillas u otros caracteres corruptos
SELECT id, patente, glo3d_id
FROM public.inventario
WHERE glo3d_id IS NOT NULL
  AND (
    glo3d_id ~ '[\"''\\]'
    OR glo3d_id <> trim(both E' \t"''' from replace(replace(glo3d_id, E'\\"', ''), '"', ''))
  )
ORDER BY patente;

-- Inventario con glo3d_id pero sin URL Glo3D en imagenes
SELECT i.patente, i.glo3d_id, i.imagenes[1:3] AS primeras_imgs
FROM public.inventario i
WHERE i.glo3d_id IS NOT NULL
  AND trim(i.glo3d_id) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM unnest(coalesce(i.imagenes, ARRAY[]::text[])) u
    WHERE u ~* 'glo3d|firebasestorage|storage\.googleapis|googleusercontent'
  )
ORDER BY i.patente
LIMIT 100;


-- =============================================================================
-- 1) LIMPIAR glo3d_id CORRUPTO (comillas al final, etc.)
-- =============================================================================

BEGIN;

UPDATE public.inventario
SET glo3d_id = trim(both E' \t"''' from replace(replace(glo3d_id, E'\\"', ''), '"', ''))
WHERE glo3d_id IS NOT NULL
  AND glo3d_id ~ '[\"''\\]';

-- Ver cuántas filas quedaron vacías tras limpiar
SELECT count(*) AS glo3d_id_vacio_tras_limpieza
FROM public.inventario
WHERE glo3d_id IS NOT NULL AND trim(glo3d_id) = '';


-- =============================================================================
-- 2) RESTAURAR marca / modelo desde aws_campos (Autored)
--    Solo donde quedó placeholder por sync incorrecto
-- =============================================================================

UPDATE public.inventario i
SET
  marca = COALESCE(
    NULLIF(trim(i.aws_campos->>'marca'), ''),
    NULLIF(trim(i.aws_campos->>'brand'), ''),
    NULLIF(trim(i.aws_campos->>'make'), ''),
    i.marca
  ),
  modelo = COALESCE(
    NULLIF(trim(i.aws_campos->>'modelo'), ''),
    NULLIF(trim(i.aws_campos->>'model'), ''),
    NULLIF(trim(i.aws_campos->>'model2'), ''),
    i.modelo
  )
WHERE i.aws_campos IS NOT NULL
  AND (
    lower(trim(coalesce(i.modelo, ''))) IN ('sin modelo', 'no informado')
    OR lower(trim(coalesce(i.marca, ''))) IN ('sin marca', 'no informado')
  )
  AND (
    coalesce(trim(i.aws_campos->>'marca'), trim(i.aws_campos->>'brand'), trim(i.aws_campos->>'make'), '') <> ''
    OR coalesce(trim(i.aws_campos->>'modelo'), trim(i.aws_campos->>'model'), trim(i.aws_campos->>'model2'), '') <> ''
  );


-- =============================================================================
-- 3) REORDENAR imagenes[] — Glo3D primero, fotos Tasaciones al final
-- =============================================================================

UPDATE public.inventario i
SET imagenes = sub.ordered
FROM (
  SELECT
    id,
    array_agg(u ORDER BY
      CASE
        WHEN u ~* 'glo3d|firebasestorage|storage\.googleapis|googleusercontent' THEN 0
        WHEN u ~* 'autored-public-files' THEN 1
        WHEN u ~* 'inventario-documentos|inventario_documentos' THEN 3
        ELSE 2
      END,
      u
    ) AS ordered
  FROM public.inventario,
       LATERAL unnest(coalesce(imagenes, ARRAY[]::text[])) AS u
  WHERE imagenes IS NOT NULL
    AND array_length(imagenes, 1) > 1
  GROUP BY id
) sub
WHERE i.id = sub.id;


-- =============================================================================
-- 4) CACHÉ EDITOR CATÁLOGO — quitar miniaturas no-Glo3D cacheadas
--    (obliga re-sync desde inventario tras deploy del fix)
-- =============================================================================

UPDATE public.catalogo_editor_config
SET
  config = jsonb_set(
    config,
    '{vehicleDetails}',
    (
      SELECT jsonb_object_agg(
        e.key,
        CASE
          WHEN e.value->>'thumbnail' IS NOT NULL
            AND e.value->>'thumbnail' !~* 'glo3d|firebasestorage|storage\.googleapis|googleusercontent'
          THEN e.value - 'thumbnail' - 'imagesCsv'
          ELSE e.value
        END
      )
      FROM jsonb_each(config->'vehicleDetails') AS e(key, value)
    ),
    true
  ),
  updated_at = timezone('utc', now())
WHERE id = 'global'
  AND config ? 'vehicleDetails';

COMMIT;


-- =============================================================================
-- 5) POST-REPARACIÓN — ejecutar en terminal (NO SQL)
-- =============================================================================
-- TasacionesVedisa-1:
--   npm run backfill-glo3d-thumbs
--   node scripts/repair-venta-directa-catalogo.mjs   (o grupo afectado)
--
-- Catálogo admin:
--   Sincronizar grupo completo desde "Ver y gestionar"
--   o sync individual en patentes que sigan sin miniatura (ej. VHWC96, GXLB21)
