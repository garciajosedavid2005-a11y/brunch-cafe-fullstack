// 6.2 (F6-2) · Repartidor asignado a cada domicilio. El admin o el cajero (pedido:asignar_repartidor) lo asignan o lo
// cambian mientras el pedido no haya salido; el repartidor (pedido:entregar) solo ve, avanza y cobra los suyos.
import mongoose from 'mongoose'
import Pedido from './pedido.model.js'
import Rol from '../identidad/rol.model.js'
import Usuario from '../identidad/usuario.model.js'
import Estado from '../compartido/estado.model.js'
import { AppError } from '../compartido/errors.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { registrarEvento } from '../compartido/estados.service.js'
import { tienePermiso, soloDomiciliosAsignados } from '../identidad/permisos.js'
import { nombreCorto, CAMPOS_NOMBRE } from '../compartido/nombres.js'
import { publicar } from '../tiempoReal/bus.js'

// Antes de salir se puede asignar o cambiar; en camino o en un estado final, ya no
export const ESTADOS_ASIGNABLES = ['pendiente', 'confirmado', 'en_preparacion', 'listo']
const MAX_REPARTIDORES = 100

const noExiste = () => new AppError(404, 'PEDIDO_NO_ENCONTRADO', 'El pedido no existe.')
const exigir = (sesion, clave) => {
    if (!tienePermiso(sesion?.permisos, clave)) throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: [clave] })
}

/** Filtro que limita los pedidos a los del repartidor conectado (vacío para quien ve todos). */
export const alcancePedidos = (sesion) =>
    (soloDomiciliosAsignados(sesion?.permisos) ? { repartidor: new mongoose.Types.ObjectId(String(sesion.id)) } : {})

/** Usuarios activos cuyo rol entrega domicilios (pedido:entregar), por nombre. */
export const listarRepartidores = async (sesion) => {
    exigir(sesion, 'pedido:asignar_repartidor')
    const roles = await Rol.find({ permisos: 'pedido:entregar' }).select('_id').lean()
    const usuarios = await Usuario.find({ rol: { $in: roles.map((r) => r._id) }, activo: { $ne: false }, eliminado: { $ne: true } })
        .collation({ locale: 'es' }).sort({ nombre: 1, apellido: 1 }).limit(MAX_REPARTIDORES).select(CAMPOS_NOMBRE).lean()
    return usuarios.map((u) => ({ id: String(u._id), nombre: nombreCorto(u) }))
}

/** PATCH /staff/pedidos/:id/repartidor { repartidorId | null } → el pedido actualizado (lean). */
export const asignarRepartidor = async (id, { repartidorId }, sesion) => {
    exigir(sesion, 'pedido:asignar_repartidor')
    if (!mongoose.isValidObjectId(id)) throw noExiste()
    let avisar = []
    const pedido = await conTransaccion(async (session) => {
        avisar = []
        let nuevo = null
        if (repartidorId) {
            const usuario = await Usuario.findOne({ _id: repartidorId, activo: { $ne: false }, eliminado: { $ne: true } }).select('rol').session(session).lean()
            const rol = usuario && await Rol.findOne({ _id: usuario.rol, permisos: 'pedido:entregar' }).select('_id').session(session).lean()
            if (!rol) throw new AppError(400, 'REPARTIDOR_NO_VALIDO', 'Esa persona no reparte domicilios.')
            nuevo = usuario._id
        }
        const asignables = await Estado.find({ tipo: 'pedido', codigo: { $in: ESTADOS_ASIGNABLES } }).select('_id').session(session).lean()
        const antes = await Pedido.findOneAndUpdate(
            { _id: id, canal: 'domicilio', estado: { $in: asignables.map((e) => e._id) } },
            { $set: { repartidor: nuevo } }, { session, returnDocument: 'before' },
        ).lean()
        if (!antes) {
            if (!(await Pedido.exists({ _id: id }).session(session))) throw noExiste()
            throw new AppError(409, 'PEDIDO_NO_ASIGNABLE', 'El repartidor se asigna antes de que el pedido salga.')
        }
        const de = antes.repartidor ? String(antes.repartidor) : null
        const a = nuevo ? String(nuevo) : null
        if (de !== a) {
            await registrarEvento({
                entidad: 'pedido', entidadId: antes._id, tipo: 'repartidor_asignado', usuario: sesion.id, actor: sesion.rol || 'staff',
                datos: { de, a }, session,
            })
            avisar = [de, a].filter(Boolean)
        }
        return antes._id
    })
    // Después de confirmar: el anterior deja de verlo y el nuevo lo recibe
    if (avisar.length) publicar(avisar.map((u) => `repartidor:${u}`), { tipo: 'pedido_asignado', ids: { pedidoId: String(pedido) } })
    return pedido
}

/** Nombres de los repartidores de una lista de pedidos (para mostrarlos). */
export const nombresRepartidores = async (pedidos) => {
    const ids = [...new Set(pedidos.map((p) => p.repartidor).filter(Boolean).map(String))]
    if (!ids.length) return new Map()
    const usuarios = await Usuario.find({ _id: { $in: ids } }).select(CAMPOS_NOMBRE).lean()
    return new Map(usuarios.map((u) => [String(u._id), nombreCorto(u)]))
}
