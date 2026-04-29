# Catalogo Vedisa

Catalogo historico de remates de VEDISA, construido desde cero en Next.js para desplegar en Vercel y conectado de forma dinamica a la data de `TasacionesVedisa`.

## Objetivo de integracion

Este proyecto intenta reutilizar la misma fuente de datos para evitar re-implementar todas las APIs:

1. **Primera opcion (preferida):** consumir la API pública de Tasaciones (`/api/inventario-publico`) mediante `CATALOG_SOURCE_API_URL`.
2. **Fallback automatico:** si ese endpoint no existe o falla, consulta directamente Supabase con credenciales anonimas de solo lectura.

## Variables de entorno

Copia `.env.example` a `.env.local` y completa:

```bash
cp .env.example .env.local
```

Campos principales:

- `CATALOG_SOURCE_API_URL`: base URL remota de Tasaciones (ej: `https://vedisa.vercel.app`).
- `CATALOG_SOURCE_API_TOKEN`: token para header `x-api-key`.
- `CATALOG_SOURCE_API_LIMIT`: límite solicitado al endpoint público.
- `CATALOG_SOURCE_API_ESTADO`: estado de inventario solicitado (recomendado `en_bodega`).
- `CATALOG_SOURCE_API_INCLUIR_HISTORICOS`: envía `incluir_historicos=true|false` al endpoint.
- `CATALOG_SOURCE_AUTORED_API_URL`: endpoint para enriquecer por patente (fallback técnico).
- `CATALOG_AUTORED_MAX_LOOKUPS`: máximo de patentes a consultar por ciclo para fallback Autored.
- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`: fallback a Supabase.
- `CATALOG_SUPABASE_TABLE`: tabla origen (por defecto `inventario`).
- `AWS_*`: inventario DynamoDB (misma lógica que Tasaciones).
- `GLO3D_API_USERNAME` / `GLO3D_API_PASSWORD`: visores 3D.
- `ADMIN_EDITOR_EMAIL` / `ADMIN_EDITOR_PASSWORD`: acceso al modo editor.
- `CATALOG_OFFERS_TABLE`: tabla para registrar ofertas de clientes (por defecto `catalogo_vehicle_offers`).
- `CATALOG_OFFERS_FROM_EMAIL` (opcional): remitente para notificaciones de oferta por AWS SES (fallback `AWS_SES_FROM_EMAIL` o `no-reply@vedisaremates.cl`).

## Modo editor administrador

Incluye login y edición de:

- selección de vehículos por sección (`proximos-remates`, `ventas-directas`, `novedades`, `catalogo`)
- ocultar/mostrar vehículos
- precio personalizado por vehículo

El modo editor guarda en Supabase en la tabla `catalogo_editor_config` (configurable con `CATALOG_EDITOR_TABLE`).

SQL sugerido:

```sql
create table if not exists public.catalogo_editor_config (
  id text primary key,
  config jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz default now()
);
```

## Ofertas de clientes

El botón **Enviar mi precio** registra ofertas en Supabase y luego las muestra en el panel admin, pestaña **5. Ofertas recibidas**.
Además, cada oferta envía notificación por correo vía AWS SES a:

- `tasaciones@vedisaremates.cl`
- `jpmontero@vedisaremates.cl`
- `comercial@vedisaremates.cl`

SQL sugerido:

```sql
create table if not exists public.catalogo_vehicle_offers (
  id uuid primary key default gen_random_uuid(),
  item_key text not null,
  vehicle_title text not null,
  patent text not null,
  reference_price numeric not null,
  offer_amount numeric not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  created_at timestamptz not null default now()
);
```

## Desarrollo local

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000`.

## Endpoint interno del catalogo

Este repo expone su propio endpoint normalizado:

- `GET /api/catalogo`

Puedes usarlo para integraciones futuras sin acoplarte al formato crudo de la base.

## Despliegue en Vercel

1. Subir este repo a GitHub.
2. Importarlo en Vercel.
3. Configurar las variables de entorno de `.env.example`.
4. Deploy.

No requiere `vercel.json` adicional para este MVP.

## Nota de integracion actual

La integración con `TasacionesVedisa` ya puede hacerse directo por API pública en `/api/inventario-publico`.  
El catálogo mantiene fallback a Supabase solo como contingencia.
