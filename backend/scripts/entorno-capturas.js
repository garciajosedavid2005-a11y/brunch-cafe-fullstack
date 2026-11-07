// Entorno aislado para `npm run capturas` (frontend), 1.3b. Lo arranca el script de capturas; no
// hace falta ejecutarlo a mano.
//   1. Toma el MONGO_URI del .env y cambia SOLO el nombre de la base: brunch-cafe-capturas.
//   2. Vacía esa base (se niega con cualquier otra) y la siembra: seed:base sin el admin real,
//      menú, modificadores, salón y los usuarios *.dev (DEV_USUARIOS_PASSWORD), sin datos personales.
//   3. Arranca la API sobre esa base en CAPTURAS_API_PORT (4100) aceptando CAPTURAS_FRONT_URL
//      (http://localhost:5174) y sin SMTP (no se envía ningún correo).
// La BD de trabajo y el servidor de desarrollo (4000) no se tocan.
import 'dotenv/config'
import mongoose from 'mongoose'
import { uriDeCapturas, prepararBdCapturas, BD_CAPTURAS } from '../src/seeds/capturas.js'

if (process.env.NODE_ENV === 'production') {
    console.error('El entorno de capturas no se ejecuta en producción.')
    process.exit(1)
}

// Antes de cargar src/config.js (lo importa el servidor): todo apunta a la BD de capturas
process.env.MONGO_URI = uriDeCapturas(process.env.MONGO_URI || '')
process.env.PORT = process.env.CAPTURAS_API_PORT || '4100'
process.env.CLIENT_URL = process.env.CAPTURAS_FRONT_URL || 'http://localhost:5174'
process.env.NODE_ENV = 'development'
for (const clave of ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_NOMBRE', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD']) delete process.env[clave]

try {
    await mongoose.connect(process.env.MONGO_URI)
    const { usuarios } = await prepararBdCapturas({ password: process.env.DEV_USUARIOS_PASSWORD || '' })
    console.log(`BD ${BD_CAPTURAS} preparada (${usuarios} usuarios de prueba).`)
    await mongoose.disconnect()
} catch (error) {
    console.error('No se pudo preparar la BD de capturas:', error.message)
    process.exit(1)
}

await import('../src/index.js') // la API de capturas (se detiene cuando termina el script de capturas)
