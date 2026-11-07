// Usuarios de prueba para desarrollo y capturas (npm run seed:dev). NUNCA en producción.
// - Crea o actualiza admin.dev / cliente.dev / mesero.dev @brunchcafe.test (dominio reservado .test).
// - La contraseña la recibe del llamador (DEV_USUARIOS_PASSWORD); no está en el código.
// - Solo toca usuarios de @brunchcafe.test; los demás usuarios no se modifican.
// - Deja un pedido pendiente del cliente de prueba (si no tiene ninguno) para ver el detalle en el admin.
import bcrypt from 'bcryptjs'
import Usuario from '../modulos/identidad/usuario.model.js'
import Rol from '../modulos/identidad/rol.model.js'
import Pedido from '../modulos/pedidos/pedido.model.js'
import DetallePedido from '../modulos/pedidos/detallePedido.model.js'
import Producto from '../modulos/catalogo/producto.model.js'
import MetodoPago from '../modulos/pedidos/metodoPago.model.js'
import { sembrarRoles } from './base.js'
import { sembrarEstados } from './estados.js'
import { sembrarMetodosPago } from './metodosPago.js'
import { estadoPorCodigo, registrarEvento } from '../modulos/compartido/estados.service.js'

export const USUARIOS_DEV = [
    { rol: 'admin', correo: 'admin.dev@brunchcafe.test', nombre: 'Admin', apellido: 'Prueba' },
    { rol: 'cliente', correo: 'cliente.dev@brunchcafe.test', nombre: 'Cliente', apellido: 'Prueba' },
    { rol: 'mesero', correo: 'mesero.dev@brunchcafe.test', nombre: 'Mesero', apellido: 'Prueba' },
]

/** Devuelve { usuarios, pedido: 'creado' | 'existente' | 'sin-productos' }. */
export const sembrarUsuariosDev = async (password) => {
    if (!password || password.length < 10) throw new Error('La contraseña de prueba debe tener al menos 10 caracteres.')
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
    }

    const cliente = await Usuario.findOne({ correo: 'cliente.dev@brunchcafe.test' })
    if (await Pedido.exists({ usuario: cliente._id })) return { usuarios: USUARIOS_DEV.length, pedido: 'existente' }
    const productos = await Producto.find().sort({ codigo: 1 }).limit(2).lean()
    if (productos.length === 0) return { usuarios: USUARIOS_DEV.length, pedido: 'sin-productos' }

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
    return { usuarios: USUARIOS_DEV.length, pedido: 'creado' }
}
