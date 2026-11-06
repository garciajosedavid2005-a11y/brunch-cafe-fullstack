import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import { datosReserva, fechaFutura } from './helpers/datos.js'
import Categoria from '../src/modulos/catalogo/categoria.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Reserva from '../src/models/reserva.model.js'
import Pedido from '../src/models/pedido.model.js'
import { instanteLocal } from '../src/modulos/compartido/fechas.js'

let cliente
beforeEach(async () => {
    ;({ sesion: cliente } = await crearConSesion('cliente'))
})
afterEach(() => vi.useRealTimers())

describe('Reservas: instante de inicio en UTC (0.10)', () => {
    it('al crear guarda inicio = fecha + hora de Bogotá en UTC y lo devuelve', async () => {
        const fecha = fechaFutura()
        const res = await cliente.post('/api/customer/reservations').send(datosReserva({ fecha, hora: '09:00' }))
        expect(res.status).toBe(201)
        const esperado = instanteLocal(fecha, '09:00').toISOString()
        expect(res.body.reservation.inicio).toBe(esperado)
        expect((await Reserva.findById(res.body.reservation._id)).inicio.toISOString()).toBe(esperado)
        // Se conservan fecha y hora para los clientes actuales
        expect(res.body.reservation.hora).toBe('09:00')
    })

    it('al editar (también si estaba confirmada) recalcula inicio', async () => {
        const creada = await cliente.post('/api/customer/reservations').send(datosReserva())
        const id = creada.body.reservation._id
        const nueva = fechaFutura(9)
        await cliente.patch(`/api/customer/reservations/${id}`).send(datosReserva({ fecha: nueva, hora: '10:00' }))
        expect((await Reserva.findById(id)).inicio.toISOString()).toBe(instanteLocal(nueva, '10:00').toISOString())

        const { estadoPorCodigo } = await import('../src/modulos/compartido/estados.service.js')
        await Reserva.updateOne({ _id: id }, { $set: { estado: (await estadoPorCodigo('reserva', 'confirmada'))._id } })
        const otra = fechaFutura(11)
        const res = await cliente.patch(`/api/customer/reservations/${id}`).send(datosReserva({ fecha: otra, hora: '08:00' }))
        expect(res.status).toBe(200)
        expect((await Reserva.findById(id)).inicio.toISOString()).toBe(instanteLocal(otra, '08:00').toISOString())
    })

    it('"ya inició" se decide con el instante: no se puede cancelar una reserva que empezó', async () => {
        const creada = await cliente.post('/api/customer/reservations').send(datosReserva())
        const id = creada.body.reservation._id
        await Reserva.updateOne({ _id: id }, { $set: { inicio: new Date(Date.now() - 60000) } })
        const res = await cliente.patch(`/api/customer/reservations/${id}/cancel`)
        expect(res.status).toBe(409)
    })

    it('el modelo deriva inicio si una ruta antigua no lo envía', async () => {
        const { usuario } = await crearConSesion('cliente')
        const { estadoPorCodigo } = await import('../src/modulos/compartido/estados.service.js')
        const reserva = await Reserva.create({
            usuario: usuario._id, estado: (await estadoPorCodigo('reserva', 'pendiente'))._id,
            cantidadPersonas: 2, fecha: new Date('2026-12-01T12:00:00Z'), hora: '08:00',
        })
        expect(reserva.inicio.toISOString()).toBe('2026-12-01T13:00:00.000Z')
    })
})

describe('Pedidos: hora de entrega como instante (0.10)', () => {
    const pedir = async () => {
        const categoria = await Categoria.create({ nombre: 'Bebidas' })
        const latte = await Producto.create({ codigo: 3, nombre: 'Latte', precio: 9000, categoria: categoria._id })
        const metodos = await cliente.get('/api/customer/payment-methods')
        return cliente.post('/api/customer/orders').send({
            items: [{ productoRef: String(latte._id), cantidad: 1 }], nombre: 'Ana Pérez', telefono: '3001234567',
            direccion: 'Carrera 36B #30-06', hora: '10:00', barrio: 'Centro', metodoPagoId: metodos.body[0].id,
        })
    }

    // Desde N8 (0.8) el domicilio es solo para hoy y antes de las 16:00, así que ya no hay pedidos
    // válidos pasadas las 19:00 de Bogotá (cuando en UTC ya es mañana): ese caso se rechaza
    // (ver horarios.test.js). Aquí: 07:30 del jueves 5 en Bogotá, el reloj de setup.js.
    it('entregaEn = día de Bogotá del pedido + hora elegida', async () => {
        const res = await pedir()
        expect(res.status).toBe(201)
        expect(res.body.order.delivery.entregaEn).toBe('2026-11-05T15:00:00.000Z')
        expect(res.body.order.delivery.hora).toBe('10:00')
        expect((await Pedido.findById(res.body.order._id)).entregaEn.toISOString()).toBe('2026-11-05T15:00:00.000Z')
    })
})
