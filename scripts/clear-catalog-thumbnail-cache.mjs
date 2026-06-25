/**
 * Quita thumbnail cacheada de una patente en catalogo_editor_config.
 * Uso: node scripts/clear-catalog-thumbnail-cache.mjs PTJD25
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvFile(relativePath) {
  try {
    const text = readFileSync(resolve(process.cwd(), relativePath), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (!m) continue
      const key = m[1].trim()
      const value = m[2].trim().replace(/^"|"$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // optional
  }
}

loadEnvFile('.env.vercel.production')
loadEnvFile('.env.local')

const patente = (process.argv[2] ?? 'PTJD25').trim().toUpperCase().replace(/[\s.-]/g, '')
const url = process.env.VITE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Falta VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const { data, error } = await supabase.from('catalogo_editor_config').select('config').eq('id', 'global').maybeSingle()
if (error || !data?.config) {
  console.error(error?.message ?? 'Sin config global')
  process.exit(1)
}

const config = data.config
const details = { ...(config.vehicleDetails ?? {}) }
const keys = Object.keys(details).filter(
  (k) => k.toUpperCase().replace(/[\s.-]/g, '') === patente || details[k]?.patente?.toUpperCase?.().replace(/[\s.-]/g, '') === patente,
)

if (keys.length === 0) {
  console.log(`No hay vehicleDetails cacheados para ${patente}`)
  process.exit(0)
}

for (const k of keys) {
  const next = { ...details[k] }
  delete next.thumbnail
  delete next.imagesCsv
  details[k] = next
  console.log(`Limpiado cache thumbnail: clave ${k}`)
}

const { error: saveErr } = await supabase
  .from('catalogo_editor_config')
  .update({ config: { ...config, vehicleDetails: details }, updated_at: new Date().toISOString() })
  .eq('id', 'global')

if (saveErr) {
  console.error(saveErr.message)
  process.exit(1)
}
console.log('OK')
