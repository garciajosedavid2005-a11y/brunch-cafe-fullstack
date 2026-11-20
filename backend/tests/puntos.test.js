// 6.6 (F6-5, F6-c) · Puntos: 1 por cada $1.000 pagados del consumo (sin propina, después del canje) al cobrar la cuenta de
// un cliente identificado o su domicilio; canje en la caja en bloques de 100 = $10.000 (solo en el cobro completo, con
// saldo y sin superar el consumo); la nota crédito revierte lo ganado y devuelve lo canjeado. Libro inmutable.
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba, crearPedido, entregarPedido } from './helpers/datos.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Comprobante from '../src/modulos/caja/comprobante.model.js'
import Usuario from '../src/modulos/identidad/usuario.model.js'
import MovimientoPuntos from '../src/modulos/fidelizacion/movimientoPuntos.model.js'
import { abrirTurno } from '../src/modulos/caja/turno.service.js'
import Rol from '../src/modulos/identidad/rol.model.js'
import { limpiarCacheSesiones } from '../src/modulos/identidad/sesiones.js'

const { ObjectId } = mongoose.Types
const SALON = '/api/v1/staff/salon'
const CAJA = '/api/v1/staff/caja'
const admin = { id: String(new ObjectId()), rol: 'admin', permisos: ['*'] }

let huevos, cajero, cliente, clienteSesion
beforeEach(async () => {
    huevos = await Producto.create({ codigo: 1, nombre: 'Huevos pericos', precio: 15000, categoria: (await categoriaDePrueba('Desayunos'))._id })
    await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Comprobante.createIndexes(), MovimientoPuntos.createIndexes()])
    await abrirTurno({ base: 0 }, admin)
    ;({ sesion: cajero } = await crearConSesion('cajero'))
    ;({ usuario: cliente, sesion: clienteSesion } = await crearConSesion('cliente'))
})

const version = async (id) => (await Cuenta.findById(id).lean()).version
const saldo = async () => (await Usuario.findById(cliente._id).lean()).puntos

/** Para llevar de 2 × huevos ($30.000) en caja; con `identificar`, del cliente de prueba. */
const cuentaEnCaja = async ({ identificar = true } = {}) => {
    const { id } = (await cajero.post(`${SALON}/para-llevar`).send({ nombre: 'Ana' })).body
    if (identificar) expect((await cajero.put(`${SALON}/cuentas/${id}/cliente`).send({ clienteId: String(cliente._id) })).status).toBe(200)
    await cajero.post(`${SALON}/cuentas/${id}/items`).send({ productoId: String(huevos._id), cantidad: 2 })
    await cajero.post(`${SALON}/cuentas/${id}/rondas/1/enviar`).send({ versionEsperada: await version(id) })
    await cajero.post(`${SALON}/cuentas/${id}/solicitar`).send({ versionEsperada: await version(id) })
    return id
}
const cobrar = async (id, { propina = 0, canjearPuntos, total }) => cajero.post(`${CAJA}/cuentas/${id}/cobrar`).send({
    versionEsperada: await version(id), propina, pagos: [{ metodo: 'tarjeta', monto: total }], ...(canjearPuntos === undefined ? {} : { canjearPuntos }),
})

describe('6.6 · Acumular', () => {
    it('al cobrar la cuenta de un cliente identificado gana 1 punto por cada $1.000 del consumo (sin la propina)', async () => {
        const id = await cuentaEnCaja()
        const r = await cobrar(id, { propina: 3000, total: 33000 })
        expect(r.status, JSON.stringify(r.body)).toBe(201)
        expect(r.body.comprobante).toMatchObject({ subtotal: 30000, descuentos: [], propina: 3000, total: 33000, puntos: { ganados: 30, canjeados: 0 } })
        expect(await saldo()).toBe(30)
        const [m] = await MovimientoPuntos.find({ usuario: cliente._id }).lean()
        expect(m).toMatchObject({ tipo: 'acumula', puntos: 30, saldoDespues: 30, referencia: { modelo: 'Comprobante', codigo: r.body.comprobante.codigo } })
    })

    it('sin cliente identificado no hay puntos', async () => {
        const id = await cuentaEnCaja({ identificar: false })
        const r = await cobrar(id, { total: 30000 })
        expect(r.body.comprobante.puntos).toBeNull()
        expect(await MovimientoPuntos.countDocuments()).toBe(0)
    })

    it('el domicilio cobrado de un cliente acumula', async () => {
        const { sesion: sesionCliente, usuario } = await crearConSesion('cliente')
        const { sesion: adminS } = await crearConSesion('admin')
        const pedido = await crearPedido(sesionCliente)
        await entregarPedido(adminS, pedido)
        const r = await adminS.post(`${CAJA}/domicilios/${pedido}/cobrar`).send({ propina: 0, pagos: [{ metodo: 'tarjeta', monto: 9000 }] })
        expect(r.status, JSON.stringify(r.body)).toBe(201)
        expect(r.body.comprobante.puntos).toEqual({ ganados: 9, canjeados: 0 })
        expect((await Usuario.findById(usuario._id).lean()).puntos).toBe(9)
    })

    it('el domicilio cobrado en camino acumula al pasar a «entregado» (F6-5), una sola vez', async () => {
        const { sesion: sesionCliente, usuario } = await crearConSesion('cliente')
        const { sesion: adminS } = await crearConSesion('admin')
        const pedido = await crearPedido(sesionCliente)
        for (const codigo of ['confirmado', 'en_preparacion', 'listo', 'en_camino']) await adminS.patch(`/api/v1/staff/pedidos/${pedido}/estado`).send({ codigo })
        const r = await adminS.post(`${CAJA}/domicilios/${pedido}/cobrar`).send({ propina: 0, pagos: [{ metodo: 'tarjeta', monto: 9000 }] })
        expect(r.status, JSON.stringify(r.body)).toBe(201)
        expect((await Usuario.findById(usuario._id).lean()).puntos).toBe(0) // aún no se entrega
        expect((await adminS.patch(`/api/v1/staff/pedidos/${pedido}/estado`).send({ codigo: 'entregado' })).status).toBe(200)
        expect((await Usuario.findById(usuario._id).lean()).puntos).toBe(9)
        expect(await MovimientoPuntos.countDocuments({ usuario: usuario._id })).toBe(1)
    })

    it('el cobro por partes acumula por parte (hacia abajo en cada una)', async () => {
        const id = await cuentaEnCaja()
        for (const numero of [1, 2]) {
            const r = await cajero.post(`${CAJA}/cuentas/${id}/cobrar-parte`).send({
                versionEsperada: await version(id), propina: 0, pagos: [{ metodo: 'tarjeta', monto: 15000 }], division: { modo: 'iguales', partes: 2 },
            })
            expect(r.status, `parte ${numero} ${JSON.stringify(r.body)}`).toBe(201)
            expect(r.body.comprobante.puntos).toEqual({ ganados: 15, canjeados: 0 })
        }
        expect(await saldo()).toBe(30)
    })
})

describe('6.6 · Canjear', () => {
    it('200 puntos = $20.000 de descuento sobre el consumo; gana sobre lo pagado; el comprobante guarda el descuento', async () => {
        await Usuario.updateOne({ _id: cliente._id }, { $set: { puntos: 250 } })
        const id = await cuentaEnCaja()
        const r = await cobrar(id, { propina: 1000, canjearPuntos: 200, total: 11000 })
        expect(r.status, JSON.stringify(r.body)).toBe(201)
        expect(r.body.comprobante).toMatchObject({
            subtotal: 30000, descuentos: [{ tipo: 'puntos', monto: 20000, detalle: '200 puntos' }], propina: 1000, total: 11000,
            puntos: { canjeados: 200, ganados: 10 },
        })
        expect(await saldo()).toBe(60) // 250 − 200 + 10
        const movimientos = await MovimientoPuntos.find({ usuario: cliente._id }).sort({ _id: 1 }).lean()
        expect(movimientos.map((m) => [m.tipo, m.puntos, m.saldoDespues])).toEqual([['canjea', -200, 50], ['acumula', 10, 60]])
    })

    it('rechaza bloques que no son de 100, más de lo que tiene, más que el consumo, sin cliente y en el cobro por partes', async () => {
        await Usuario.updateOne({ _id: cliente._id }, { $set: { puntos: 500 } })
        const id = await cuentaEnCaja()
        const noBloque = await cobrar(id, { canjearPuntos: 150, total: 15000 })
        expect(noBloque.status).toBe(400)
        expect(JSON.stringify(noBloque.body.error)).toContain('bloques de 100')
        expect((await cobrar(id, { canjearPuntos: 400, total: 1000 })).body.error.code).toBe('CANJE_SUPERA_CONSUMO')
        await Usuario.updateOne({ _id: cliente._id }, { $set: { puntos: 100 } })
        const sinSaldo = await cobrar(id, { canjearPuntos: 200, total: 10000 })
        expect(sinSaldo.status).toBe(409)
        expect(sinSaldo.body.error.code).toBe('PUNTOS_INSUFICIENTES')
        const parte = await cajero.post(`${CAJA}/cuentas/${id}/cobrar-parte`).send({
            versionEsperada: await version(id), propina: 0, pagos: [{ metodo: 'tarjeta', monto: 5000 }], canjearPuntos: 100, division: { modo: 'iguales', partes: 2 },
        })
        expect(parte.status).toBe(400)
        expect(parte.body.error.code).toBe('CANJE_SOLO_COMPLETO')
        const otra = await cuentaEnCaja({ identificar: false })
        expect((await cobrar(otra, { canjearPuntos: 100, total: 20000 })).body.error.code).toBe('CANJE_SIN_CLIENTE')
        expect(await saldo()).toBe(100) // nada se descontó
        expect(await Comprobante.countDocuments()).toBe(0)
    })

    it('quien cobra pero no tiene puntos:canjear recibe 403 y no se descuenta nada', async () => {
        await Usuario.updateOne({ _id: cliente._id }, { $set: { puntos: 100 } })
        const id = await cuentaEnCaja()
        await Rol.updateOne({ nombre: 'cajero' }, { $pull: { permisos: 'puntos:canjear' } })
        limpiarCacheSesiones()
        try {
            const r = await cobrar(id, { canjearPuntos: 100, total: 20000 })
            expect(r.status).toBe(403)
            expect(r.body.error.details.requiere).toEqual(['puntos:canjear'])
            expect(await saldo()).toBe(100)
            expect(await Comprobante.countDocuments()).toBe(0)
            // Sin canje, el mismo cajero sí cobra (y acumula)
            expect((await cobrar(id, { total: 30000 })).status).toBe(201)
        } finally {
            await Rol.updateOne({ nombre: 'cajero' }, { $addToSet: { permisos: 'puntos:canjear' } })
            limpiarCacheSesiones()
        }
    })

    it('dos canjes a la vez con saldo para uno: uno pasa y el otro recibe 409; el saldo no queda negativo', async () => {
        await Usuario.updateOne({ _id: cliente._id }, { $set: { puntos: 100 } })
        const [a, b] = [await cuentaEnCaja(), await cuentaEnCaja()]
        const respuestas = await Promise.all([a, b].map((id) => cobrar(id, { canjearPuntos: 100, total: 20000 })))
        expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409])
        expect(await saldo()).toBe(20) // 100 − 100 + 20 ganados
    })
})

describe('6.6 · Revertir, historial e inmutabilidad', () => {
    it('la nota crédito quita lo ganado y devuelve lo canjeado (un movimiento «revierte»)', async () => {
        await Usuario.updateOne({ _id: cliente._id }, { $set: { puntos: 250 } })
        const id = await cuentaEnCaja()
        const { comprobante } = (await cobrar(id, { canjearPuntos: 200, total: 10000 })).body
        const { sesion: adminS } = await crearConSesion('admin')
        const anula = await adminS.post(`${CAJA}/comprobantes/${comprobante.id}/anular`).send({ motivo: 'Error de cobro' })
        expect(anula.status, JSON.stringify(anula.body)).toBe(201)
        expect(await saldo()).toBe(250)
        const revierte = await MovimientoPuntos.findOne({ tipo: 'revierte' }).lean()
        expect(revierte).toMatchObject({ puntos: 190, saldoDespues: 250, referencia: { modelo: 'NotaCredito' } })
    })

    it('anular después de gastar lo ganado deja el saldo negativo (F6-c) y con él no se canjea', async () => {
        const id = await cuentaEnCaja()
        const { comprobante } = (await cobrar(id, { total: 30000 })).body // gana 30
        await Usuario.updateOne({ _id: cliente._id }, { $inc: { puntos: -20 } }) // los gastó (simulado)
        const { sesion: adminS } = await crearConSesion('admin')
        expect((await adminS.post(`${CAJA}/comprobantes/${comprobante.id}/anular`).send({ motivo: 'Error' })).status).toBe(201)
        expect(await saldo()).toBe(-20)
        const otra = await cuentaEnCaja()
        expect((await cobrar(otra, { canjearPuntos: 100, total: 20000 })).body.error.code).toBe('PUNTOS_INSUFICIENTES')
    })

    it('GET /cliente/puntos: saldo, reglas y movimientos propios (el más reciente primero)', async () => {
        const id = await cuentaEnCaja()
        const { comprobante } = (await cobrar(id, { total: 30000 })).body
        const r = await clienteSesion.get('/api/v1/cliente/puntos')
        expect(r.status).toBe(200)
        expect(r.body).toMatchObject({
            saldo: 30, reglas: { pesosPorPunto: 1000, bloque: 100, valorBloque: 10000 },
            movimientos: [expect.objectContaining({ tipo: 'acumula', puntos: 30, saldoDespues: 30, referencia: comprobante.codigo })],
        })
        const { sesion: otro } = await crearConSesion('cliente')
        expect((await otro.get('/api/v1/cliente/puntos')).body).toMatchObject({ saldo: 0, movimientos: [] })
    })

    it('el libro no se modifica ni se borra', async () => {
        const id = await cuentaEnCaja()
        await cobrar(id, { total: 30000 })
        await expect(MovimientoPuntos.updateOne({}, { $set: { puntos: 999 } })).rejects.toThrow('no se pueden modificar')
        await expect(MovimientoPuntos.deleteMany({})).rejects.toThrow('no se pueden modificar')
    })
})
