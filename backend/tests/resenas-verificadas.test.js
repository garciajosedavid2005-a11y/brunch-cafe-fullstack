// 0.12 · Decisión 14: reseña verificada = pedido entregado que contenga el producto;
// 1 reseña por usuario y producto (editable); la general exige ≥ 1 pedido entregado o
// reserva completada; las existentes se conservan con verificada: false.
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { agente } from './helpers/app.js'
import { crearConSesion } from './helpers/usuarios.js'
import { crearPedido, crearReserva, entregarPedido } from './helpers/datos.js'
import DetallePedido from '../src/modulos/pedidos/detallePedido.model.js'
import Comentario from '../src/modulos/catalogo/comentario.model.js'

const RUTA = '/api/v1/cliente/comentarios'
let cliente, admin

beforeEach(async () => {
    ;({ sesion: cliente } = await crearConSesion('cliente'))
    ;({ sesion: admin } = await crearConSesion('admin'))
})

/** Pedido entregado del cliente; devuelve el ObjectId del producto que contiene. */
const productoEntregado = async () => {
    const pedidoId = await crearPedido(cliente)
    await entregarPedido(admin, pedidoId)
    return String((await DetallePedido.findOne({ pedido: pedidoId }).lean()).producto)
}
const resenar = (productoRef, extra = {}) => cliente.post(RUTA).send({
    tipo: 'producto', productoRef, calificacion: 5, comentario: 'Muy rico y bien servido', ...extra,
})

describe('Reseñas de producto: solo con compra entregada', () => {
    it('con un pedido entregado que lo contiene → verificada', async () => {
        const res = await resenar(await productoEntregado())
        expect(res.status).toBe(201)
        expect(res.body.review.verificada).toBe(true)
    })

    it('sin pedido entregado con ese producto → 403 RESENA_NO_VERIFICABLE', async () => {
        const pedidoId = await crearPedido(cliente) // pendiente, no entregado
        const producto = String((await DetallePedido.findOne({ pedido: pedidoId }).lean()).producto)
        const res = await resenar(producto)
        expect(res.status).toBe(403)
        expect(res.body.error.code).toBe('RESENA_NO_VERIFICABLE')
        expect(await Comentario.countDocuments()).toBe(0)
    })

    it('un pedido entregado de otro cliente no cuenta', async () => {
        const { sesion: otro } = await crearConSesion('cliente')
        const pedidoId = await crearPedido(otro)
        await entregarPedido(admin, pedidoId)
        const producto = String((await DetallePedido.findOne({ pedido: pedidoId }).lean()).producto)
        expect((await resenar(producto)).status).toBe(403)
    })

    it('una por usuario y producto: la segunda → 409 con el id de la existente', async () => {
        const producto = await productoEntregado()
        const primera = await resenar(producto)
        const segunda = await resenar(producto, { calificacion: 3 })
        expect(segunda.status).toBe(409)
        expect(segunda.body.error.code).toBe('RESENA_EXISTENTE')
        expect(segunda.body.error.details.id).toBe(primera.body.review._id)
    })

    it('la propia se edita con PATCH (calificación y texto) y sigue verificada', async () => {
        const { body } = await resenar(await productoEntregado())
        const editada = await cliente.patch(`${RUTA}/${body.review._id}`).send({ calificacion: 3, comentario: 'Bien, aunque llegó algo frío' })
        expect(editada.status).toBe(200)
        expect(editada.body.review).toMatchObject({ calificacion: 3, comentario: 'Bien, aunque llegó algo frío', verificada: true })
        expect(await Comentario.countDocuments()).toBe(1)
    })

    it('no se edita la de otro (404) ni con datos inválidos (400)', async () => {
        const { body } = await resenar(await productoEntregado())
        const { sesion: otro } = await crearConSesion('cliente')
        expect((await otro.patch(`${RUTA}/${body.review._id}`).send({ calificacion: 4, comentario: 'Intento de editar ajeno' })).status).toBe(404)
        expect((await cliente.patch(`${RUTA}/${body.review._id}`).send({ calificacion: 9, comentario: 'x' })).status).toBe(400)
        expect((await cliente.patch(`${RUTA}/${new mongoose.Types.ObjectId()}`).send({ calificacion: 4, comentario: 'No existe esta reseña' })).status).toBe(404)
    })
})

describe('Reseña general', () => {
    const general = () => cliente.post(RUTA).send({ tipo: 'general', calificacion: 5, comentario: 'Lugar muy agradable y buena atención' })

    it('sin pedidos entregados ni reservas completadas → 403', async () => {
        const res = await general()
        expect(res.status).toBe(403)
        expect(res.body.error.code).toBe('RESENA_NO_VERIFICABLE')
    })

    it('con un pedido entregado → se publica', async () => {
        await productoEntregado()
        const res = await general()
        expect(res.status).toBe(201)
        expect(res.body.review.verificada).toBe(true)
    })

    it('con una reserva completada → se publica', async () => {
        const reservaId = await crearReserva(cliente)
        for (const codigo of ['confirmada', 'sentada', 'completada']) {
            await admin.patch(`/api/v1/staff/reservas/${reservaId}/estado`).send({ codigo })
        }
        expect((await general()).status).toBe(201)
    })
})

describe('Reseñas existentes y listado público', () => {
    it('las anteriores sin el campo cuentan como no verificadas y se siguen mostrando', async () => {
        await Comentario.collection.insertOne({
            usuario: new mongoose.Types.ObjectId(), tipo: 'general', calificacion: 4, comentario: 'Reseña anterior a 0.12', visible: true, createdAt: new Date(),
        })
        const { body } = await agente().get('/api/v1/comentarios')
        expect(body.reviews).toHaveLength(1)
        expect(body.reviews[0].verificada).toBe(false)
    })

    it('el listado público marca las verificadas', async () => {
        await resenar(await productoEntregado())
        const { body } = await agente().get('/api/v1/comentarios')
        expect(body.reviews[0].verificada).toBe(true)
    })
})
