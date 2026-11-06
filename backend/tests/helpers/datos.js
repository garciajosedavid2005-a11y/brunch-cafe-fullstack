import Categoria from '../../src/models/categoria.model.js'
import Producto from '../../src/models/producto.model.js'

// Próximo día hábil a 7+ días (09:00 es válida en cualquier horario actual).
// El reloj de las pruebas es fijo (setup.js): jueves 2026-11-05 07:30 en Bogotá.
export const fechaFutura = (dias = 7) => {
    const d = new Date(Date.now() + dias * 86400000)
    while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
}

let codigoProducto = 100

/** Crea un pedido pendiente desde el portal del cliente y devuelve su id. */
export const crearPedido = async (sesionCliente) => {
    codigoProducto += 1
    const categoria = await Categoria.findOneAndUpdate(
        { nombre: 'Bebidas' }, { $setOnInsert: { nombre: 'Bebidas' } }, { upsert: true, returnDocument: 'after' }
    )
    await Producto.create({ codigo: codigoProducto, nombre: `Latte ${codigoProducto}`, precio: 9000, categoria: categoria._id })
    const metodos = await sesionCliente.get('/api/customer/payment-methods')
    const res = await sesionCliente.post('/api/customer/orders').send({
        items: [{ productoId: codigoProducto, cantidad: 1 }],
        nombre: 'Ana Pérez',
        telefono: '3001234567',
        direccion: 'Carrera 36B #30-06',
        hora: '10:00',
        barrio: 'Centro',
        metodoPagoId: metodos.body[0].id,
    })
    if (res.status !== 201) throw new Error(`No se creó el pedido de prueba: ${JSON.stringify(res.body)}`)
    return res.body.order._id
}

export const datosReserva = (extra = {}) => ({
    nombre: 'Ana Pérez', correo: 'ana@example.com', telefono: '3001234567', motivo: 'Desayuno',
    personas: 2, fecha: fechaFutura(), hora: '09:00', ...extra,
})

/** Crea una reserva pendiente desde el portal del cliente y devuelve su id. */
export const crearReserva = async (sesionCliente, extra) => {
    const res = await sesionCliente.post('/api/customer/reservations').send(datosReserva(extra))
    if (res.status !== 201) throw new Error(`No se creó la reserva de prueba: ${JSON.stringify(res.body)}`)
    return res.body.reservation._id
}
