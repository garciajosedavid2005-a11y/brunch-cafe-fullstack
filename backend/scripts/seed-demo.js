// 3.5 · Datos de demostración (npm run seed:demo). SOLO para desarrollo: se niega en producción.
// No borra nada: crea lo que falta y, si el salón ya tiene actividad, no lo toca y lo dice. Antes de
// escribir comprueba la BD: con un salón real no hace nada; con usuarios reales pide --confirmar.
// Usa los usuarios *.dev con DEV_USUARIOS_PASSWORD (mínimo 10 caracteres, fuera del código).
// Guion de la presentación: docs/GUIA_DEMO.md. La lógica está en src/seeds/demo.js.
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { exigirEntornoDemo, sembrarDemo } from '../src/seeds/demo.js'

try {
    exigirEntornoDemo({ NODE_ENV: config.NODE_ENV })
} catch (error) {
    console.error(error.message)
    process.exit(1)
}
const password = process.env.DEV_USUARIOS_PASSWORD || ''
if (password.length < 10) {
    console.error('Define DEV_USUARIOS_PASSWORD (mínimo 10 caracteres) en el entorno o en backend/.env.')
    process.exit(1)
}

const SALON = {
    creado: 'Salón en servicio: mesa 1 ocupada (ítems servido, listo, en preparación y por empezar), 2 y 4 libres, 3 con la cuenta pedida, 5 + 6 unidas y 7 por limpiar; 2 comprobantes del día.',
    'con-actividad': 'El salón ya tiene actividad (cuentas abiertas o mesas no libres): no se tocó. Para prepararlo de nuevo, cobra o cancela las cuentas y marca las mesas como limpias, o usa una base de datos vacía (docs/GUIA_DEMO.md).',
    'sin-salon-ejemplo': 'Esta base de datos tiene un salón real (mesas que no son de ejemplo): no se escribió nada. Usa una base de datos de desarrollo (docs/GUIA_DEMO.md).',
    'requiere-confirmacion': 'Esta base de datos tiene usuarios reales: no se escribió nada. seed:demo crearía cuentas, cobros, una reserva y un pedido de demostración, y volvería a fijar la contraseña de los usuarios *.dev. Si es lo que quieres, repite con: npm run seed:demo -- --confirmar',
    incompleta: 'Una ejecución anterior de seed:demo se cortó a mitad: no se repite encima (volvería a cobrar). Usa una base de datos vacía (docs/GUIA_DEMO.md, plan B).',
}
const PARTE = { creado: 'creado', creada: 'creada', existente: 'ya existía' }

try {
    await mongoose.connect(config.MONGO_URI)
    console.log(`Base de datos: ${mongoose.connection.db.databaseName}`)
    const r = await sembrarDemo({ password, confirmado: process.argv.includes('--confirmar') })
    console.log(SALON[r.salon] + (r.faltan ? ` Faltan las mesas ${r.faltan.join(', ')}.` : ''))
    if (!r.agotado) {
        // No se escribió nada (salón real, BD con usuarios reales sin --confirmar o demo incompleta)
        if (r.salon !== 'sin-salon-ejemplo') process.exitCode = 1
    } else {
        console.log(`Producto agotado: ${PARTE[r.agotado]}. Reserva pendiente para mañana: ${PARTE[r.reserva]}. Pedido a domicilio confirmado: ${PARTE[r.domicilio]}.`)
        console.log('Usuarios: admin.dev, cliente.dev, mesero.dev, cocina.dev y cajero.dev @brunchcafe.test (contraseña: DEV_USUARIOS_PASSWORD).')
    }
} catch (error) {
    console.error('seed:demo falló:', error.message)
    console.error('Si se cortó a mitad, la próxima vez dirá «incompleta»: usa una base de datos vacía (docs/GUIA_DEMO.md, plan B).')
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
