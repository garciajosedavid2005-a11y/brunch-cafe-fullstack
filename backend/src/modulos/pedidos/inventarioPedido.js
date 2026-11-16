// Fase 5 (F5-3) · El domicilio descuenta el inventario al CONFIRMARSE y lo devuelve al CANCELARSE, en la misma
// transacción que el cambio de estado (efectos de cambiarEstado). Los agotados automáticos se avisan después.
import DetallePedido from './detallePedido.model.js'
import { codigoPedido } from './pedidoComoCuenta.js'
import { descontarPedido, devolverPedido } from '../inventario/consumo.service.js'

/** Devuelve { efectos, cambios }: `efectos` va a cambiarEstado y `cambios()` da lo que hay que avisar. */
export const efectosInventarioPedido = (sesion) => {
    let cambios = []
    const efectos = async ({ documento, a, session }) => {
        cambios = []
        const codigo = codigoPedido(documento._id)
        if (a === 'confirmado') {
            const lineas = await DetallePedido.find({ pedido: documento._id }).select('producto cantidad modificadores').session(session).lean()
            cambios = await descontarPedido({ pedido: documento, codigo, lineas, sesion, session })
        } else if (a === 'cancelado') {
            cambios = await devolverPedido({ pedido: documento, codigo, sesion, session })
        }
    }
    return { efectos, cambios: () => cambios }
}
