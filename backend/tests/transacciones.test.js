import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion, rolId } from './helpers/usuarios.js'
import { crearPedido, crearReserva } from './helpers/datos.js'
import Categoria from '../src/modulos/catalogo/categoria.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Pedido from '../src/modulos/pedidos/pedido.model.js'
import DetallePedido from '../src/modulos/pedidos/detallePedido.model.js'
import Reserva from '../src/models/reserva.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import Usuario from '../src/models/usuario.model.js'
import { exigirReplicaSet, ReplicaSetRequeridoError } from '../src/db.js'

afterEach(() => vi.restoreAllMocks())

// Evento.create falla una vez: lo que se escribió antes en la misma operación debe deshacerse
const fallarEvento = () => vi.spyOn(Evento, 'create').mockRejectedValueOnce(new Error('fallo simulado del Evento'))

describe('Transacciones (0.9)', () => {
    let cliente
    let cuerpoPedido
    beforeEach(async () => {
        ;({ sesion: cliente } = await crearConSesion('cliente'))
        const categoria = await Categoria.create({ nombre: 'Bebidas' })
        const latte = await Producto.create({ codigo: 9, nombre: 'Latte', precio: 9000, categoria: categoria._id })
        const metodos = await cliente.get('/api/v1/cliente/metodos-pago')
        cuerpoPedido = {
            items: [{ productoRef: String(latte._id), cantidad: 2 }], nombre: 'Ana Pérez', telefono: '3001234567',
            direccion: 'Carrera 36B #30-06', hora: '10:00', barrio: 'Centro', metodoPagoId: metodos.body[0].id,
        }
    })

    it('pedido: si falla el Evento no queda ni el pedido ni sus líneas', async () => {
        fallarEvento()
        const res = await cliente.post('/api/v1/cliente/pedidos').send(cuerpoPedido)
        expect(res.status).toBe(500)
        expect(await Pedido.countDocuments()).toBe(0)
        expect(await DetallePedido.countDocuments()).toBe(0)
    })

    it('pedido: si fallan las líneas no queda el pedido', async () => {
        vi.spyOn(DetallePedido, 'insertMany').mockRejectedValueOnce(new Error('fallo simulado de las líneas'))
        expect((await cliente.post('/api/v1/cliente/pedidos').send(cuerpoPedido)).status).toBe(500)
        expect(await Pedido.countDocuments()).toBe(0)
        expect(await Evento.countDocuments()).toBe(0)
    })

    it('pedido correcto: pedido, líneas con nombre y precio del momento, y Evento', async () => {
        const res = await cliente.post('/api/v1/cliente/pedidos').send(cuerpoPedido)
        expect(res.status).toBe(201)
        const linea = await DetallePedido.findOne().lean()
        expect(linea).toMatchObject({ nombreProducto: 'Latte', precioProducto: 9000, cantidad: 2, subtotal: 18000 })
        await Producto.updateOne({ codigo: 9 }, { $set: { nombre: 'Latte grande', precio: 12000 } })
        const despues = await cliente.get(`/api/v1/cliente/pedidos/${res.body.order._id}`)
        expect(despues.body.order.items[0]).toMatchObject({ name: 'Latte', unitPrice: 9000 }) // snapshot
        expect(await Evento.countDocuments({ entidad: 'pedido', a: 'pendiente' })).toBe(1)
    })

    it('reserva: si falla el Evento no queda la reserva', async () => {
        fallarEvento()
        await expect(crearReserva(cliente)).rejects.toThrow()
        expect(await Reserva.countDocuments()).toBe(0)
    })

    it('cambio de estado: si falla el Evento el estado no cambia', async () => {
        const id = await crearPedido(cliente)
        fallarEvento()
        const res = await cliente.patch(`/api/v1/cliente/pedidos/${id}/cancelar`).send({})
        expect(res.status).toBe(500)
        const pedido = await Pedido.findById(id).populate('estado', 'codigo')
        expect(pedido.estado.codigo).toBe('pendiente')
    })
})

describe('Último admin: dos degradaciones simultáneas (0.9)', () => {
    it('no deja el sistema sin administradores activos', async () => {
        const a = await crearConSesion('admin')
        const b = await crearConSesion('admin')
        await Usuario.deleteMany({ _id: { $nin: [a.usuario._id, b.usuario._id] }, rol: await rolId('admin') })
        const cliente = await rolId('cliente')
        // a quita el rol admin a b y b se lo quita a a, al mismo tiempo
        const respuestas = await Promise.all([
            a.sesion.patch(`/api/v1/admin/usuarios/${b.usuario._id}`).send({ rolId: cliente }),
            b.sesion.patch(`/api/v1/admin/usuarios/${a.usuario._id}`).send({ rolId: cliente }),
        ])
        const admins = await Usuario.countDocuments({ rol: await rolId('admin'), activo: { $ne: false } })
        expect(admins).toBe(1)
        expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409])
    })
})

describe('Replica set obligatorio (0.9)', () => {
    it('con replica set no falla', async () => {
        await expect(exigirReplicaSet(mongoose.connection)).resolves.toBeUndefined()
    })

    it('en un Mongo standalone lanza un error con instrucciones', async () => {
        const standalone = { db: { admin: () => ({ command: async () => ({ isWritablePrimary: true }) }) } }
        await expect(exigirReplicaSet(standalone)).rejects.toBeInstanceOf(ReplicaSetRequeridoError)
        await expect(exigirReplicaSet(standalone)).rejects.toThrow(/replica set/i)
    })
})
