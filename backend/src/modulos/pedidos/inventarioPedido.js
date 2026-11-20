// Fase 5 (F5-3) · El domicilio descuenta el inventario al CONFIRMARSE y lo devuelve al CANCELARSE, en la misma
// transacción que el cambio de estado (efectos de cambiarEstado). Los agotados automáticos se avisan después.
import DetallePedido from './detallePedido.model.js'
import { codigoPedido } from './pedidoComoCuenta.js'
import { descontarPedido, devolverPedido } from '../inventario/consumo.service.js'
import { acreditarDomicilioEntregado } from '../fidelizacion/puntos.service.js'
import { liberarCumpleanos } from '../fidelizacion/cumpleanos.service.js'

/** Devuelve { efectos, cambios }: `efectos` va a cambiarEstado y `cambios()` da lo que hay que avisar. */
export const efectosInventarioPedido = (sesion) => {
    let cambios = []
    const efectos = async ({ documento, de, a, session }) => {
        cambios = []
        const codigo = codigoPedido(documento._id)
        if (a === 'confirmado') {
            const lineas = await DetallePedido.find({ pedido: documento._id }).select('producto cantidad modificadores').session(session).lean()
            cambios = await descontarPedido({ pedido: documento, codigo, lineas, sesion, session })
        } else if (a === 'cancelado') {
            cambios = await devolverPedido({ pedido: documento, codigo, de, sesion, session }) // en preparación o listo: merma (5.8.5)
            await liberarCumpleanos({ referencias: [documento._id], motivo: 'cancelado', session }) // 6.7 · si lo usó en el carrito
        } else if (a === 'entregado') {
            await acreditarDomicilioEntregado({ pedidoId: documento._id, session }) // 6.6 (F6-5) · si ya se cobró
        }
    }
    return { efectos, cambios: () => cambios }
}
