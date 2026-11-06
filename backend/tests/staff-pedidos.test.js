// 0.13: endpoints internos de pedido para el staff (listar con filtros, detalle con
// historial y cancelar con motivo). Las transiciones están en estados-api.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { crearPedido } from './helpers/datos.js'
import Pedido from '../src/models/pedido.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'

const BASE = '/api/v1/staff/pedidos'
let cliente, admin, mesero, cocina

beforeEach(async () => {
    cliente = (await crearConSesion('cliente')).sesion
    admin = (await crearConSesion('admin')).sesion
    mesero = (await crearConSesion('mesero')).sesion
    cocina = (await crearConSesion('cocina')).sesion
})

describe('GET /api/v1/staff/pedidos: filtros', () => {
    let ids
    beforeEach(async () => {
        ids = [await crearPedido(cliente), await crearPedido(cliente), await crearPedido(cliente)]
        await mesero.patch(`${BASE}/${ids[0]}/estado`).send({ codigo: 'confirmado' })
    })

    it('sin parámetros responde igual que antes (todos, más recientes primero) e informa el total', async () => {
        const res = await cocina.get(BASE)
        expect(res.status).toBe(200)
        expect(res.body.map((p) => String(p.id))).toEqual([...ids].reverse())
        expect(res.headers['x-total-count']).toBe('3')
    })

    it('por estado (uno o varios códigos)', async () => {
        expect((await cocina.get(`${BASE}?estado=confirmado`)).body.map((p) => String(p.id))).toEqual([ids[0]])
        expect((await cocina.get(`${BASE}?estado=pendiente`)).body).toHaveLength(2)
        expect((await cocina.get(`${BASE}?estado=pendiente,confirmado`)).body).toHaveLength(3)
    })

    it('un estado que no es de pedido → 400 con los válidos', async () => {
        const res = await cocina.get(`${BASE}?estado=sentada`)
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('por día de Bogotá y con límite', async () => {
        // Un pedido de ayer (en Bogotá) no sale en el día de hoy
        // createdAt es inmutable en Mongoose: se cambia directo en la colección
        await Pedido.collection.updateOne({ _id: new mongoose.Types.ObjectId(ids[1]) }, { $set: { createdAt: new Date(Date.now() - 86400000) } })
        const hoy = await cocina.get(`${BASE}?fecha=2026-11-05`)
        expect(hoy.body.map((p) => String(p.id)).sort()).toEqual([ids[0], ids[2]].sort())
        expect((await cocina.get(`${BASE}?fecha=2026-11-04`)).body.map((p) => String(p.id))).toEqual([ids[1]])

        const limitado = await cocina.get(`${BASE}?limite=1`)
        expect(limitado.body).toHaveLength(1)
        expect(limitado.headers['x-total-count']).toBe('3')
        expect((await cocina.get(`${BASE}?limite=0`)).status).toBe(400)
        expect((await cocina.get(`${BASE}?fecha=05-11-2026`)).status).toBe(400)
    })

    it('el cliente no lista pedidos del staff', async () => {
        expect((await cliente.get(BASE)).status).toBe(403)
    })
})

describe('GET /api/v1/staff/pedidos/:id: detalle con historial', () => {
    it('trae el pedido, sus líneas y cada cambio con quién lo hizo', async () => {
        const id = await crearPedido(cliente)
        await mesero.patch(`${BASE}/${id}/estado`).send({ codigo: 'confirmado' })
        const res = await cocina.get(`${BASE}/${id}`)
        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({ estadoCodigo: 'confirmado', telefono: '3001234567' })
        expect(res.body.items).toHaveLength(1)
        expect(res.body.historial.map((e) => [e.de, e.a, e.actor])).toEqual([[null, 'pendiente', 'cliente'], ['pendiente', 'confirmado', 'mesero']])
        expect(res.body.historial[1].usuario).toMatch(/mesero/i)
        expect(res.body.historial[1].fecha).toBeDefined()
    })

    it('id inexistente o mal formado → 404; sin permiso → 403', async () => {
        expect((await cocina.get(`${BASE}/${new mongoose.Types.ObjectId()}`)).status).toBe(404)
        expect((await cocina.get(`${BASE}/no-es-un-id`)).status).toBe(404)
        expect((await cliente.get(`${BASE}/${new mongoose.Types.ObjectId()}`)).status).toBe(403)
    })
})

describe('PATCH /api/v1/staff/pedidos/:id/cancelar', () => {
    let id
    beforeEach(async () => {
        id = await crearPedido(cliente)
    })

    it('exige pedido:cancelar', async () => {
        const res = await mesero.patch(`${BASE}/${id}/cancelar`).send({ motivo: 'Sin domiciliarios' })
        expect(res.status).toBe(403)
    })

    it('exige motivo (mínimo 3 caracteres)', async () => {
        const res = await admin.patch(`${BASE}/${id}/cancelar`).send({})
        expect(res.status).toBe(400)
        expect((await admin.patch(`${BASE}/${id}/cancelar`).send({ motivo: ' x ' })).status).toBe(400)
    })

    it('cancela con motivo, deja el Evento y respeta la máquina de estados', async () => {
        const ok = await admin.patch(`${BASE}/${id}/cancelar`).send({ motivo: 'Sin domiciliarios' })
        expect(ok.status).toBe(200)
        expect(ok.body).toMatchObject({ estadoCodigo: 'cancelado', esFinal: true })
        expect(await Evento.findOne({ entidadId: id, a: 'cancelado' }).lean()).toMatchObject({ motivo: 'Sin domiciliarios', actor: 'admin' })
        // Ya es final: no se vuelve a cancelar
        const otra = await admin.patch(`${BASE}/${id}/cancelar`).send({ motivo: 'otra vez' })
        expect(otra.status).toBe(409)
    })

    it('no cancela un pedido en preparación (solo pendiente o confirmado)', async () => {
        await mesero.patch(`${BASE}/${id}/estado`).send({ codigo: 'confirmado' })
        await mesero.patch(`${BASE}/${id}/estado`).send({ codigo: 'en_preparacion' })
        expect((await admin.patch(`${BASE}/${id}/cancelar`).send({ motivo: 'Cliente llamó' })).status).toBe(409)
    })

    it('si falla el Evento el pedido no queda cancelado (0.9)', async () => {
        vi.spyOn(Evento, 'create').mockRejectedValueOnce(new Error('fallo simulado'))
        expect((await admin.patch(`${BASE}/${id}/cancelar`).send({ motivo: 'Sin domiciliarios' })).status).toBe(500)
        expect((await Pedido.findById(id).populate('estado', 'codigo')).estado.codigo).toBe('pendiente')
        vi.restoreAllMocks()
    })
})
