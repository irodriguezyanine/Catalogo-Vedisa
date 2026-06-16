-- Cola de fallos de sincronización compartida (opcional).
-- Ejecutar en Supabase si se quiere persistir skipped del sync Tasaciones/Subastas.

create table if not exists public.catalog_sync_dlq (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  message text not null,
  skipped_count integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists catalog_sync_dlq_created_at_idx
  on public.catalog_sync_dlq (created_at desc);

comment on table public.catalog_sync_dlq is
  'Registro de operaciones omitidas o fallidas al sincronizar con Tasaciones/Subastas.';
