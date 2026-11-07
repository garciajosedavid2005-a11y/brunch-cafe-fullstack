// Usuarios de prueba para desarrollo (npm run seed:dev). NUNCA en producción.
// Crea o actualiza admin.dev / cliente.dev / mesero.dev @brunchcafe.test con DEV_USUARIOS_PASSWORD
// (mínimo 10 caracteres, fuera del código) y un pedido pendiente del cliente de prueba.
// La lógica está en src/seeds/dev.js (la usa también la BD de capturas).
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { sembrarUsuariosDev, USUARIOS_DEV } from '../src/seeds/dev.js'

if (config.NODE_ENV === 'production') {
    console.error('seed:dev no se ejecuta en producción.')
    process.exit(1)
}
const password = process.env.DEV_USUARIOS_PASSWORD || ''
if (password.length < 10) {
    console.error('Define DEV_USUARIOS_PASSWORD (mínimo 10 caracteres) en el entorno o en backend/.env.')
    process.exit(1)
}

const PEDIDO = {
    creado: 'Pedido de prueba creado.',
    existente: 'El cliente de prueba ya tiene pedidos.',
    'sin-productos': 'Sin productos: ejecuta npm run seed:menu para crear el pedido de prueba.',
}

try {
    await mongoose.connect(config.MONGO_URI)
    const { pedido } = await sembrarUsuariosDev(password)
    for (const u of USUARIOS_DEV) console.log(`Usuario de prueba listo: ${u.correo} (${u.rol})`)
    console.log(PEDIDO[pedido])
} catch (error) {
    console.error('seed:dev falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
