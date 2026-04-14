# Catalogo Vedisa

Catalogo historico de remates de VEDISA, construido desde cero en Next.js para desplegar en Vercel y conectado de forma dinamica a la data de `TasacionesVedisa`.

## Objetivo de integracion

Este proyecto intenta reutilizar la misma fuente de datos para evitar re-implementar todas las APIs:

1. **Primera opcion (preferida):** consumir un endpoint existente de Tasaciones (ej: `https://vedisa.vercel.app/api/...`) mediante `CATALOG_SOURCE_API_URL`.
2. **Fallback automatico:** si ese endpoint no existe o falla, consulta directamente Supabase con credenciales anonimas de solo lectura.

## Variables de entorno

Copia `.env.example` a `.env.local` y completa:

```bash
cp .env.example .env.local
```

Campos principales:

- `CATALOG_SOURCE_API_URL`: endpoint remoto desde Tasaciones/vedisa.
- `CATALOG_SOURCE_API_TOKEN`: token opcional (si el endpoint lo exige).
- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`: fallback a Supabase.
- `CATALOG_SUPABASE_TABLE`: tabla origen (por defecto `inventario`).

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

## Siguiente paso recomendado

En `TasacionesVedisa`, crear un endpoint read-only dedicado al catalogo (ej: `/api/catalogo-publico`) para estabilizar contrato de datos y dejar Supabase solo como respaldo.
