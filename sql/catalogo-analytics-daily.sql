-- Agregación diaria de analytics del catálogo Vedisa.
-- Ejecutar en Supabase SQL Editor.

create table if not exists public.catalogo_analytics_daily (
  date date primary key,
  visits integer not null default 0,
  unique_visitors integer not null default 0,
  detail_opens integer not null default 0,
  whatsapp_clicks integer not null default 0,
  leads integer not null default 0,
  offers_sent integer not null default 0,
  shares integer not null default 0,
  global_conversion_rate numeric(6, 2) not null default 0,
  by_section jsonb not null default '{}'::jsonb,
  by_auction jsonb not null default '{}'::jsonb,
  top_vehicles jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists catalogo_analytics_daily_date_idx
  on public.catalogo_analytics_daily (date desc);

create index if not exists catalogo_analytics_events_timestamp_idx
  on public.catalogo_analytics_events (event_timestamp desc);

create index if not exists catalogo_analytics_events_name_idx
  on public.catalogo_analytics_events (event_name);

create index if not exists catalogo_analytics_events_item_key_idx
  on public.catalogo_analytics_events (item_key)
  where item_key is not null;

create index if not exists catalogo_analytics_events_section_idx
  on public.catalogo_analytics_events (section)
  where section is not null;
