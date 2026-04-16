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
- `CATALOG_SOURCE_API_INCLUIR_HISTORICOS`: envía `incluir_historicos=true|false` al endpoint.
- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`: fallback a Supabase.
- `CATALOG_SUPABASE_TABLE`: tabla origen (por defecto `inventario`).
- `AWS_*`: inventario DynamoDB (misma lógica que Tasaciones).
- `GLO3D_API_USERNAME` / `GLO3D_API_PASSWORD`: visores 3D.
- `ADMIN_EDITOR_EMAIL` / `ADMIN_EDITOR_PASSWORD`: acceso al modo editor.

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
