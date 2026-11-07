import 'dotenv/config'
import { z } from 'zod'

// Define y valida las variables de entorno que el backend necesita.
// Si falta alguna obligatoria, el servidor no arranca (mejor fallar rápido).
const booleanoEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')

// Duración de sesión: número > 0 + unidad (s, m, h o d). Sin unidad, jsonwebtoken la tomaría como
// milisegundos y duracionEnMs como segundos; con 0, cada sesión vencería al emitirse (1.1)
export const duracionSchema = z.string().trim()
  .regex(/^[1-9]\d*[smhd]$/i, 'Usa un número con unidad s, m, h o d (p. ej. 2h o 12h)')

const envSchema = z.object({
  PORT: z.string().default('4000'),
  MONGO_URI: z.string().min(1, 'MONGO_URI es requerido en el .env'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET es requerido en el .env'),
  JWT_EXPIRES_IN: duracionSchema.default('2h'),
  // Personal sin "*" (mesero, anfitrión, cocina…) en tablets del local (F1-10)
  JWT_EXPIRES_IN_STAFF: duracionSchema.default('12h'),
  // Uno o varios orígenes separados por coma
  CLIENT_URL: z.string().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Cookie de sesión. En producción con frontend y API en sitios distintos: SAMESITE=none + SECURE=true
  COOKIE_SECURE: booleanoEnv.optional(),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  SMTP_HOST: z.string().trim().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().trim().optional(),
  // Número de proxies delante de la API (para que req.ip sea la IP real del cliente)
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas o faltantes:')
  console.error(z.treeifyError(parsed.error))
  process.exit(1)
}

const env = parsed.data

export const config = {
  ...env,
  CLIENT_URLS: env.CLIENT_URL.split(',').map((url) => url.trim()).filter(Boolean),
  COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
}

if (config.COOKIE_SAMESITE === 'none' && !config.COOKIE_SECURE) {
  console.error('❌ COOKIE_SAMESITE=none exige COOKIE_SECURE=true (los navegadores rechazan la cookie).')
  process.exit(1)
}
