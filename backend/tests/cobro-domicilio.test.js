// 3b.4 · Cobro contra entrega de un domicilio (PLAN_FASE_3B, F3b-6): el cajero o el repartidor (pedido:cobrar)
// lo registran con el pedido en camino o entregado; exige turno; comprobante del pedido con el mismo
// consecutivo; una sola vez por pedido; se puede anular (Evento en el pedido).
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { crearPedido, entregarPedido } from './helpers/datos.js'
import Comprobante from '../src/modulos/caja/comprobante.model.js'
import TurnoCaja from '../src/modulos/caja/turno.model.js'
import Pedido from '../src/modulos/pedidos/pedido.model.js'
import MetodoPago from '../src/modulos/pedidos/metodoPago.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { abrirTurno } from '../src/modulos/caja/turno.service.js'
import { cobrarDomicilio, esContraEntrega } from '../src/modulos/caja/domicilios.service.js'
import { up, down, PARTES, PEDIDO } from '../src/migraciones/m3b4-indices-domicilio.js'

const { ObjectId } = mongoose.Types
const BASE = '/api/v1/staff/caja'
const admin = { id: String(new ObjectId()), rol: 'admin', permisos: ['*'] }

let cliente
let adminS
beforeEach(async () => {
    await Promise.all([Comprobante.createIndexes(), TurnoCaja.createIndexes()])
    await abrirTurno({ base: 0 }, admin)
    ;({ sesion: cliente } = await crearConSesion('cliente'))
    ;({ sesion: adminS } = await crearConSesion('admin'))
})

/** Pedido de 1 × Latte (9.000) llevado hasta `hasta` (en_camino o entregado). */
const domicilio = async (hasta = 'entregado') => {
    const id = await crearPedido(cliente)
    if (hasta === 'entregado') await entregarPedido(adminS, id)
    else {
        for (const codigo of ['confirmado', 'en_preparacion', 'listo', 'en_camino']) {
            await adminS.patch(`/api/v1/staff/pedidos/${id}/estado`).send({ codigo })
        }
    }
    return id
}

describe('3b.4 · Cobro de domicilios', () => {
    it('el repartidor cobra un entregado: comprobante del pedido (CI-…), en el turno, con sus líneas y Evento', async () => {
        const id = await domicilio('entregado')
        const { sesion: repartidor } = await crearConSesion('repartidor')
        const lista = await repartidor.get(`${BASE}/domicilios`)
        expect(lista.status, JSON.stringify(lista.body)).toBe(200)
        expect(lista.body.domicilios).toEqual([expect.objectContaining({ id, total: 9000, estado: 'entregado', cliente: 'Ana Pérez' })])

        const r = await repartidor.post(`${BASE}/domicilios/${id}/cobrar`).send({ propina: 1000, pagos: [{ metodo: 'efectivo', monto: 10000, recibido: 20000 }] })
        expect(r.status, JSON.stringify(r.body)).toBe(201)
        expect(r.body.comprobante).toMatchObject({ codigo: 'CI-000001', pedidoId: id, cuentaId: null, subtotal: 9000, propina: 1000, total: 10000, cambio: 10000 })
        expect(r.body.comprobante.pedido).toMatch(/^PED-/)
        expect(r.body.comprobante.lineas).toEqual([expect.objectContaining({ cantidad: 1, subtotal: 9000 })])
        const guardado = await Comprobante.findById(r.body.comprobante.id).lean()
        expect(String(guardado.turno)).toBe(String((await TurnoCaja.findOne({ estado: 'abierto' }).lean())._id))
        expect(await Evento.exists({ entidad: 'pedido', entidadId: new ObjectId(id), tipo: 'pedido_cobrado' })).toBeTruthy()

        // Ya no aparece y no se cobra dos veces
        expect((await repartidor.get(`${BASE}/domicilios`)).body.domicilios).toHaveLength(0)
        expect((await repartidor.post(`${BASE}/domicilios/${id}/cobrar`).send({ propina: 0, pagos: [{ metodo: 'tarjeta', monto: 9000 }] })).body.error.code).toBe('PEDIDO_YA_COBRADO')
    })

    it('el cajero cobra uno en camino; varios domicilios no chocan entre sí (índices parciales)', async () => {
        const [a, b] = [await domicilio('en_camino'), await domicilio('entregado')]
        const { sesion: cajero } = await crearConSesion('cajero')
        for (const id of [a, b]) {
            expect((await cajero.post(`${BASE}/domicilios/${id}/cobrar`).send({ propina: 0, pagos: [{ metodo: 'tarjeta', monto: 9000 }] })).status).toBe(201)
        }
        expect(await Comprobante.countDocuments({ pedido: { $exists: true } })).toBe(2)
    })

    it('reglas: solo en camino o entregado (409), pagos que cuadran (400), turno abierto (409), permiso (403)', async () => {
        const pendiente = await crearPedido(cliente)
        expect((await adminS.post(`${BASE}/domicilios/${pendiente}/cobrar`).send({ propina: 0, pagos: [{ metodo: 'tarjeta', monto: 9000 }] })).body.error.code).toBe('PEDIDO_NO_COBRABLE')
        const id = await domicilio('entregado')
        expect((await adminS.post(`${BASE}/domicilios/${id}/cobrar`).send({ propina: 0, pagos: [{ metodo: 'tarjeta', monto: 8000 }] })).body.error.code).toBe('PAGO_NO_CUADRA')
        const { sesion: mesero } = await crearConSesion('mesero')
        expect((await mesero.post(`${BASE}/domicilios/${id}/cobrar`).send({ propina: 0, pagos: [{ metodo: 'tarjeta', monto: 9000 }] })).status).toBe(403)
        expect((await adminS.post(`${BASE}/domicilios/${new ObjectId()}/cobrar`).send({ propina: 0, pagos: [{ metodo: 'tarjeta', monto: 9000 }] })).status).toBe(404)
        await TurnoCaja.updateOne({ estado: 'abierto' }, { $set: { estado: 'cerrado' } }) // atajo de prueba
        expect((await adminS.post(`${BASE}/domicilios/${id}/cobrar`).send({ propina: 0, pagos: [{ metodo: 'tarjeta', monto: 9000 }] })).body.error.code).toBe('TURNO_CERRADO')
    })

    it('dos cobros a la vez del mismo pedido: un solo comprobante', async () => {
        const id = await domicilio('entregado')
        const cuerpo = { propina: 0, pagos: [{ metodo: 'tarjeta', monto: 9000 }] }
        const r = await Promise.allSettled([cobrarDomicilio(id, cuerpo, admin), cobrarDomicilio(id, cuerpo, admin)])
        expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
        expect(r.find((x) => x.status === 'rejected').reason.code).toBe('PEDIDO_YA_COBRADO')
        expect(await Comprobante.countDocuments({ pedido: id })).toBe(1)
    })

    it('anular el comprobante de un domicilio deja el Evento en el pedido', async () => {
        const id = await domicilio('entregado')
        const { comprobante } = await cobrarDomicilio(id, { propina: 0, pagos: [{ metodo: 'tarjeta', monto: 9000 }] }, admin)
        const r = await adminS.post(`${BASE}/comprobantes/${comprobante.id}/anular`).send({ motivo: 'El cliente no recibió el pedido' })
        expect(r.status, JSON.stringify(r.body)).toBe(201)
        expect(await Evento.exists({ entidad: 'pedido', entidadId: new ObjectId(id), tipo: 'comprobante_anulado' })).toBeTruthy()
        expect(await Pedido.exists({ _id: id })).toBeTruthy()
    })
})

describe('Migración 3b.4 (índices de comprobantes para domicilios)', () => {
    const db = () => mongoose.connection.db
    const indice = async (nombre) => (await db().collection('comprobantes').indexes()).find((i) => i.name === nombre)

    it('up rehace el índice de partes como parcial y crea el de pedido; down vuelve atrás; up → down → up', async () => {
        // Como en 3b.2: partes sin filtro y sin índice de pedido
        await db().collection('comprobantes').dropIndex(PEDIDO).catch(() => {})
        await db().collection('comprobantes').dropIndex(PARTES).catch(() => {})
        await db().collection('comprobantes').createIndex({ cuenta: 1, 'parte.numero': 1 }, { unique: true, name: PARTES })
        expect(await up(db(), { dryRun: true })).toMatchObject({ rehacerPartes: true, crearPedido: true, aplicado: false })
        expect((await indice(PARTES)).partialFilterExpression).toBeUndefined()
        expect((await up(db())).aplicado).toBe(true)
        expect((await indice(PARTES)).partialFilterExpression).toEqual({ cuenta: { $type: 'objectId' } })
        expect(await indice(PEDIDO)).toBeTruthy()
        expect((await up(db())).aplicado).toBe(false)
        expect((await down(db())).aplicado).toBe(true)
        expect((await indice(PARTES)).partialFilterExpression).toBeUndefined()
        expect(await indice(PEDIDO)).toBeUndefined()
        expect((await up(db())).aplicado).toBe(true)
    })

    it('down no revierte si ya hay comprobantes de domicilios', async () => {
        const id = await domicilio('entregado')
        await cobrarDomicilio(id, { propina: 0, pagos: [{ metodo: 'tarjeta', monto: 9000 }] }, admin)
        expect((await down(db())).bloqueo).toMatch(/domicilios/)
        expect(await indice(PEDIDO)).toBeTruthy()
    })
})

describe('3b.4 · Total del pedido', () => {
    it('si el total guardado no coincide con sus líneas no se cobra (409) y no queda comprobante', async () => {
        const id = await domicilio('entregado')
        await Pedido.updateOne({ _id: id }, { $set: { total: 12000 } })
        await expect(cobrarDomicilio(id, { propina: 0, pagos: [{ metodo: 'tarjeta', monto: 9000 }] }, admin)).rejects.toMatchObject({ code: 'PEDIDO_TOTAL_INCONSISTENTE' })
        expect(await Comprobante.countDocuments()).toBe(0)
    })
})

describe('3b.4 · Ventana, permisos y reintentos', () => {
    it('un pedido de hace más de 48 h no se lista ni se cobra', async () => {
        const id = await domicilio('entregado')
        await Pedido.collection.updateOne({ _id: new ObjectId(id) }, { $set: { createdAt: new Date(Date.now() - 49 * 3600 * 1000) } })
        expect((await adminS.get(`${BASE}/domicilios`)).body.domicilios).toHaveLength(0)
        await expect(cobrarDomicilio(id, { propina: 0, pagos: [{ metodo: 'tarjeta', monto: 9000 }] }, admin)).rejects.toMatchObject({ code: 'PEDIDO_NO_COBRABLE' })
    })

    it('el mesero no ve la lista (403 FORBIDDEN); con la misma Idempotency-Key el reintento devuelve el mismo comprobante', async () => {
        const { sesion: mesero } = await crearConSesion('mesero')
        const r403 = await mesero.get(`${BASE}/domicilios`)
        expect(r403.status).toBe(403)
        expect(r403.body.error.code).toBe('FORBIDDEN')
        const id = await domicilio('entregado')
        const enviar = () => adminS.post(`${BASE}/domicilios/${id}/cobrar`).set('Idempotency-Key', 'cobro-domicilio-1').send({ propina: 0, pagos: [{ metodo: 'tarjeta', monto: 9000 }] })
        const a = await enviar()
        const b = await enviar()
        expect([a.status, b.status]).toEqual([201, 201])
        expect(b.body.comprobante.codigo).toBe(a.body.comprobante.codigo)
        expect(await Comprobante.countDocuments({ pedido: id })).toBe(1)
    })
})

describe('3b · Pendientes: método de pago y comprobantes del repartidor', () => {
    const cobro = { propina: 0, pagos: [{ metodo: 'tarjeta', monto: 9000 }] }

    it('un domicilio pagado con otro método (Tarjeta débito) no se lista ni se cobra contra entrega: 409 sin comprobante', async () => {
        const tarjeta = await MetodoPago.findOne({ codigo: 'tarjeta-debito' }).lean()
        const id = await crearPedido(cliente, { metodoPagoId: String(tarjeta._id) })
        await entregarPedido(adminS, id)
        expect((await adminS.get(`${BASE}/domicilios`)).body.domicilios).toHaveLength(0)
        const r = await adminS.post(`${BASE}/domicilios/${id}/cobrar`).send(cobro)
        expect(r.status).toBe(409)
        expect(r.body.error.code).toBe('PEDIDO_NO_CONTRA_ENTREGA')
        expect(r.body.error.message).toMatch(/Tarjeta débito/)
        expect(await Comprobante.countDocuments({ pedido: id })).toBe(0)
    })

    it('el repartidor vuelve a abrir el comprobante de un domicilio que él cobró, pero no los de otros ni los de mesas', async () => {
        const { sesion: repartidor, usuario: yo } = await crearConSesion('repartidor')
        const { sesion: otro } = await crearConSesion('repartidor')
        // Un comprobante de mesa (sin pedido) con el repartidor como cajero: tampoco lo ve (atajo de prueba)
        const deMesa = new ObjectId()
        await Comprobante.collection.insertOne({ _id: deMesa, numero: 999, codigo: 'CI-000999', cuenta: new ObjectId(), mesas: [1], cajero: { id: yo._id, nombre: 'R' }, emitidoEn: new Date(), lineas: [], pagos: [], subtotal: 0, propina: 0, total: 0 })
        const [mio, ajeno] = [await domicilio('entregado'), await domicilio('entregado')]
        const a = await repartidor.post(`${BASE}/domicilios/${mio}/cobrar`).send(cobro)
        const b = await otro.post(`${BASE}/domicilios/${ajeno}/cobrar`).send(cobro)
        expect([a.status, b.status]).toEqual([201, 201])

        const lista = await repartidor.get(`${BASE}/comprobantes`)
        expect(lista.status, JSON.stringify(lista.body)).toBe(200)
        expect(lista.body.comprobantes).toEqual([expect.objectContaining({ id: a.body.comprobante.id, pedido: expect.stringMatching(/^PED-/) })])
        const detalle = await repartidor.get(`${BASE}/comprobantes/${a.body.comprobante.id}`)
        expect(detalle.status).toBe(200)
        expect(detalle.body).toMatchObject({ codigo: a.body.comprobante.codigo, pedidoId: mio })
        expect((await repartidor.get(`${BASE}/comprobantes/${b.body.comprobante.id}`)).status).toBe(404)
        expect((await repartidor.get(`${BASE}/comprobantes/${deMesa}`)).status).toBe(404)

        // El cajero sigue viendo todos
        const { sesion: cajero } = await crearConSesion('cajero')
        expect((await cajero.get(`${BASE}/comprobantes`)).body.comprobantes).toHaveLength(3)
        // El mesero no ve ninguno
        const { sesion: mesero } = await crearConSesion('mesero')
        expect((await mesero.get(`${BASE}/comprobantes`)).status).toBe(403)
    })
})

describe('esContraEntrega', () => {
    it('reconoce el método por código o, en las BD sin código, por nombre (sin tildes, guiones ni mayúsculas)', () => {
        expect(esContraEntrega({ codigo: 'contra-entrega', nombre: 'Otro nombre' })).toBe(true)
        expect(esContraEntrega({ nombre: ' Contra-Entrega ' })).toBe(true)
        expect(esContraEntrega({ nombre: 'contra entrega' })).toBe(true)
        expect(esContraEntrega({ nombre: 'Tarjeta débito', codigo: 'tarjeta-debito' })).toBe(false)
        expect(esContraEntrega(null)).toBe(false)
    })
})
