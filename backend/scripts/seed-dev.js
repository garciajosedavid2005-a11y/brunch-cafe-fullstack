// Usuarios de prueba para desarrollo y capturas (npm run seed:dev). NUNCA en producción.
// - Crea o actualiza admin.dev / cliente.dev / mesero.dev @brunchcafe.test (dominio reservado .test).
// - La contraseña sale de DEV_USUARIOS_PASSWORD (mínimo 10 caracteres); no está en el código.
// - Solo toca usuarios de @brunchcafe.test; los demás usuarios no se modifican.
// - Deja un pedido pendiente del cliente de prueba (si no tiene ninguno) para ver el detalle en el admin.
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import Usuario from '../src/models/usuario.model.js'
import Rol from '../src/models/rol.model.js'
import Pedido from '../src/models/pedido.model.js'
import DetallePedido from '../src/models/detallePedido.model.js'
import Producto from '../src/models/producto.model.js'
import { sembrarRoles } from '../src/seeds/base.js'
import { sembrarEstados } from '../src/seeds/estados.js'
import { sembrarMetodosPago } from '../src/seeds/metodosPago.js'
import MetodoPago from '../src/models/metodoPago.model.js'
import { estadoPorCodigo, registrarEvento } from '../src/modulos/compartido/estados.service.js'

export const USUARIOS_DEV = [
    { rol: 'admin', correo: 'admin.dev@brunchcafe.test', nombre: 'Admin', apellido: 'Prueba' },
    { rol: 'cliente', correo: 'cliente.dev@brunchcafe.test', nombre: 'Cliente', apellido: 'Prueba' },
    { rol: 'mesero', correo: 'mesero.dev@brunchcafe.test', nombre: 'Mesero', apellido: 'Prueba' },
]

if (config.NODE_ENV === 'production') {
    console.error('seed:dev no se ejecuta en producción.')
    process.exit(1)
}
const password = process.env.DEV_USUARIOS_PASSWORD || ''
if (password.length < 10) {
    console.error('Define DEV_USUARIOS_PASSWORD (mínimo 10 caracteres) en el entorno o en backend/.env.')
    process.exit(1)
}

try {
    await mongoose.connect(config.MONGO_URI)
    await sembrarRoles()
    await sembrarEstados()
    const hash = await bcrypt.hash(password, 10)

    for (const datos of USUARIOS_DEV) {
        const rol = await Rol.findOne({ nombre: datos.rol })
        await Usuario.updateOne(
            { correo: datos.correo },
            {
                $set: { contraseña: hash, rol: rol._id, activo: true },
                $setOnInsert: { correo: datos.correo, nombre: datos.nombre, apellido: datos.apellido, telefono: '3000000000' },
            },
            { upsert: true }
        )
        console.log(`Usuario de prueba listo: ${datos.correo} (${datos.rol})`)
    }

    const cliente = await Usuario.findOne({ correo: 'cliente.dev@brunchcafe.test' })
    if (!(await Pedido.exists({ usuario: cliente._id }))) {
        const productos = await Producto.find().sort({ codigo: 1 }).limit(2).lean()
        if (productos.length === 0) {
            console.log('Sin productos: ejecuta npm run seed:menu para crear el pedido de prueba.')
        } else {
            await sembrarMetodosPago()
            const metodo = await MetodoPago.findOne({ codigo: 'contra-entrega' })
            const pendiente = await estadoPorCodigo('pedido', 'pendiente')
            const lineas = productos.map((p) => ({ p, cantidad: 1, subtotal: p.precio }))
            const pedido = await Pedido.create({
                usuario: cliente._id, estado: pendiente._id, metodoPago: metodo._id,
                total: lineas.reduce((t, l) => t + l.subtotal, 0),
                nombreEntrega: 'Cliente Prueba', direccion: 'Carrera 36B #30-06', barrio: 'Centro',
                horaEntrega: '10:00', indicaciones: 'Pedido de prueba (seed:dev)',
            })
            await DetallePedido.insertMany(lineas.map(({ p, cantidad, subtotal }) => ({
                pedido: pedido._id, producto: p._id, productoId: p.codigo, nombreProducto: p.nombre,
                precioProducto: p.precio, cantidad, subtotal,
            })))
            await registrarEvento({ entidad: 'pedido', entidadId: pedido._id, a: 'pendiente', actor: 'sistema', motivo: 'seed:dev' })
            console.log('Pedido de prueba creado.')
        }
    }
} catch (error) {
    console.error('seed:dev falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
