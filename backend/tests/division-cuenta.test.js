// 3b.2 · División de la cuenta en la caja (PLAN_FASE_3B, F3b-3 y F3b-4): partes iguales (residuo de a $1 en
// las primeras) o por ítems enteros; cada parte con su propina, sus pagos y su comprobante; la primera fija el
// modo y congela la cuenta; la última la cierra.
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba } from './helpers/datos.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Comprobante from '../src/modulos/caja/comprobante.model.js'
import TurnoCaja from '../src/modulos/caja/turno.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { abrirCuenta, agregarItem, enviarRonda, solicitarCuenta, montoParte, cerrarSinCobro } from '../src/modulos/salon/cuentas.service.js'
import { abrirTurno } from '../src/modulos/caja/turno.service.js'
import { up, down, VIEJO, NUEVO } from '../src/migraciones/m3b2-indice-comprobantes.js'
import { PERMISOS_SALON } from '../src/modulos/identidad/permisos.js'

const { ObjectId } = mongoose.Types
const BASE = '/api/v1/staff/caja'
const mesero = { id: String(new ObjectId()), rol: 'mesero', permisos: PERMISOS_SALON.mesero }
const admin = { id: String(new ObjectId()), rol: 'admin', permisos: ['*'] }

let huevos
let jugo
let zona
let cajero
beforeEach(async () => {
    const platos = await categoriaDePrueba('Desayunos')
    huevos = await Producto.create({ codigo: 1, nombre: 'Huevos pericos', precio: 15000, categoria: platos._id })
    jugo = await Producto.create({ codigo: 2, nombre: 'Jugo de mora', precio: 7001, categoria: platos._id })
    zona = await Zona.create({ nombre: 'Interior' })
    await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes(), Comprobante.createIndexes(), TurnoCaja.createIndexes()])
    await abrirTurno({ base: 0 }, admin)
    ;({ sesion: cajero } = await crearConSesion('cajero'))
})

/** Cuenta pedida: 2 × Huevos (30.000) + 1 × Jugo (7.001) = 37.001. */
const cuentaPedida = async (numero = 1) => {
    const mesa = await Mesa.create({ numero, zona: zona._id, capacidad: 4 })
    const cuenta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 3 }, mesero)
    await agregarItem(cuenta.id, { productoId: String(huevos._id), cantidad: 2 }, mesero)
    await agregarItem(cuenta.id, { productoId: String(jugo._id), cantidad: 1 }, mesero)
    await enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: (await Cuenta.findById(cuenta.id).lean()).version }, mesero)
    await solicitarCuenta(cuenta.id, { versionEsperada: (await Cuenta.findById(cuenta.id).lean()).version }, mesero)
    return { id: cuenta.id, mesa }
}
const version = async (id) => (await Cuenta.findById(id).lean()).version
const parte = async (cuentaId, division, monto, extra = {}) => cajero.post(`${BASE}/cuentas/${cuentaId}/cobrar-parte`)
    .send({ versionEsperada: await version(cuentaId), propina: 0, pagos: [{ metodo: 'tarjeta', monto }], division, ...extra })

describe('3b.2 · Partes iguales', () => {
    it('reparte el residuo de a $1 en las primeras partes y suma exacto', () => {
        expect([1, 2, 3].map((k) => montoParte(37001, 3, k))).toEqual([12334, 12334, 12333])
        expect([1, 2, 3].map((k) => montoParte(37001, 3, k)).reduce((a, b) => a + b)).toBe(37001)
        expect([1, 2].map((k) => montoParte(30000, 2, k))).toEqual([15000, 15000])
    })

    it('cada parte tiene su comprobante; la cuenta sigue pedida y congelada hasta la última, que la cierra', async () => {
        const c = await cuentaPedida()
        const r1 = await parte(c.id, { modo: 'iguales', partes: 3 }, 12334)
        expect(r1.status, JSON.stringify(r1.body)).toBe(201)
        expect(r1.body.cerrada).toBe(false)
        expect(r1.body.comprobante).toMatchObject({ subtotal: 12334, total: 12334, parte: { modo: 'iguales', numero: 1, de: 3 } })
        expect(r1.body.comprobante.lineas[0].nombre).toMatch(/^Parte 1 de 3 · C-/)

        // La lista de la caja muestra lo que falta
        const lista = await cajero.get(`${BASE}/cuentas`)
        expect(lista.body.cuentas[0]).toMatchObject({ porCobrar: 24667, division: { modo: 'iguales', partes: 3, cobradas: 1 } })

        // Congelada: ni el mesero agrega ítems ni se cobra entera
        await expect(agregarItem(c.id, { productoId: String(huevos._id), cantidad: 1 }, mesero)).rejects.toMatchObject({ code: 'CUENTA_EN_COBRO' })
        const entera = await cajero.post(`${BASE}/cuentas/${c.id}/cobrar`).send({ versionEsperada: await version(c.id), propina: 0, pagos: [{ metodo: 'tarjeta', monto: 24667 }] })
        expect(entera.body.error.code).toBe('CUENTA_EN_COBRO')
        // No cambia el número de partes ni el modo
        expect((await parte(c.id, { modo: 'iguales', partes: 2 }, 12334)).body.error.code).toBe('DIVISION_EN_CURSO')

        // Con propina y efectivo, la segunda; la tercera cierra
        const r2 = await parte(c.id, { modo: 'iguales', partes: 3 }, 13334, { propina: 1000, pagos: [{ metodo: 'efectivo', monto: 13334, recibido: 20000 }] })
        expect(r2.body.comprobante).toMatchObject({ subtotal: 12334, propina: 1000, total: 13334, cambio: 6666 })
        const r3 = await parte(c.id, { modo: 'iguales', partes: 3 }, 12333)
        expect(r3.body.cerrada).toBe(true)
        const cuenta = await Cuenta.findById(c.id).lean()
        expect(cuenta).toMatchObject({ estado: 'cerrada', division: { cobradas: 3, cobrado: 37001 } })
        expect((await Mesa.findById(c.mesa._id).lean()).estado).toBe('por_limpiar')
        expect(await Comprobante.countDocuments({ cuenta: c.id })).toBe(3)
        expect(await Evento.countDocuments({ entidadId: cuenta._id, tipo: 'cuenta_parte_cobrada' })).toBe(3)
        expect(await Evento.countDocuments({ entidadId: cuenta._id, tipo: 'cuenta_cobrada' })).toBe(1)
    })

    it('el monto de cada parte lo fija el servidor: pagos que no cuadran dan 400 y nada cambia', async () => {
        const c = await cuentaPedida()
        const r = await parte(c.id, { modo: 'iguales', partes: 3 }, 12000)
        expect(r.body.error.code).toBe('PAGO_NO_CUADRA')
        expect((await Cuenta.findById(c.id).lean()).division).toBeNull()
        expect(await Comprobante.countDocuments()).toBe(0)
    })
})

describe('3b.2 · Por ítems', () => {
    it('cobra los ítems elegidos; no deja repetir uno; la última parte (lo que falta) cierra', async () => {
        const c = await cuentaPedida()
        const detalle = await cajero.get(`${BASE}/cuentas/${c.id}`)
        expect(detalle.status, JSON.stringify(detalle.body)).toBe(200)
        const [lineaHuevos, lineaJugo] = detalle.body.items
        expect(lineaHuevos).toMatchObject({ nombre: 'Huevos pericos', cantidad: 2, subtotal: 30000, cobrado: false })

        const r1 = await parte(c.id, { modo: 'items', items: [lineaJugo.id] }, 7001)
        expect(r1.status, JSON.stringify(r1.body)).toBe(201)
        expect(r1.body.comprobante).toMatchObject({ subtotal: 7001, parte: { modo: 'items', numero: 1, de: null } })
        expect(r1.body.comprobante.lineas).toEqual([expect.objectContaining({ nombre: 'Jugo de mora', subtotal: 7001 })])
        expect((await cajero.get(`${BASE}/cuentas/${c.id}`)).body.items.find((i) => i.id === lineaJugo.id).cobrado).toBe(true)

        expect((await parte(c.id, { modo: 'items', items: [lineaJugo.id] }, 7001)).body.error.code).toBe('ITEM_YA_COBRADO')
        expect((await parte(c.id, { modo: 'iguales', partes: 2 }, 15000)).body.error.code).toBe('DIVISION_EN_CURSO')
        expect((await parte(c.id, { modo: 'items', items: [String(new ObjectId())] }, 1)).body.error.code).toBe('ITEM_NO_COBRABLE')

        const r2 = await parte(c.id, { modo: 'items', items: [lineaHuevos.id] }, 30000)
        expect(r2.body.cerrada).toBe(true)
        expect((await Cuenta.findById(c.id).lean()).estado).toBe('cerrada')
    })

    it('valida el cuerpo: modo, partes entre 2 y 20, ítems sin repetir', async () => {
        const c = await cuentaPedida()
        for (const division of [{ modo: 'mitad' }, { modo: 'iguales', partes: 1 }, { modo: 'iguales', partes: 21 }, { modo: 'items', items: [] }, { modo: 'items', items: ['x'] }]) {
            const r = await parte(c.id, division, 100)
            expect(r.status, JSON.stringify(division)).toBe(400)
            expect(r.body.error.code).toBe('VALIDATION_ERROR')
        }
        // Sin versión no se cobra una parte (un doble envío cobraría dos)
        const sinVersion = await cajero.post(`${BASE}/cuentas/${c.id}/cobrar-parte`)
            .send({ propina: 0, pagos: [{ metodo: 'tarjeta', monto: 18501 }], division: { modo: 'iguales', partes: 2 } })
        expect(sinVersion.body.error.code).toBe('VALIDATION_ERROR')
    })
})

describe('3b.2 · Reintentos', () => {
    it('el mismo envío dos veces: con la misma Idempotency-Key repite la respuesta; sin ella, 409 por la versión; una sola parte', async () => {
        const c = await cuentaPedida()
        const cuerpo = { versionEsperada: await version(c.id), propina: 0, pagos: [{ metodo: 'tarjeta', monto: 18501 }], division: { modo: 'iguales', partes: 2 } }
        const enviar = (clave) => {
            const p = cajero.post(`${BASE}/cuentas/${c.id}/cobrar-parte`)
            if (clave) p.set('Idempotency-Key', clave)
            return p.send(cuerpo)
        }
        const a = await enviar('clave-parte-1')
        const b = await enviar('clave-parte-1')
        expect(b.status).toBe(201)
        expect(b.body.comprobante.id).toBe(a.body.comprobante.id)
        expect((await enviar()).body.error.code).toBe('CUENTA_MODIFICADA')
        expect(await Comprobante.countDocuments({ cuenta: c.id })).toBe(1)
    })

    it('dos partes a la vez: se cobran en orden, sin repetir número', async () => {
        const c = await cuentaPedida()
        const v = await version(c.id)
        const cuerpo = (monto) => ({ versionEsperada: v, propina: 0, pagos: [{ metodo: 'tarjeta', monto }], division: { modo: 'iguales', partes: 2 } })
        const r = await Promise.all([18501, 18501].map((m) => cajero.post(`${BASE}/cuentas/${c.id}/cobrar-parte`).send(cuerpo(m))))
        expect(r.map((x) => x.status).sort()).toEqual([201, 409])
        expect(await Comprobante.countDocuments({ cuenta: c.id })).toBe(1)
    })
})

describe('3b.2 · Reglas generales', () => {
    it('sin turno no se cobra una parte; el mesero no cobra (403); el admin cierra sin cobro una cuenta a medio cobrar', async () => {
        const c = await cuentaPedida()
        const { sesion: meseroS } = await crearConSesion('mesero')
        expect((await meseroS.post(`${BASE}/cuentas/${c.id}/cobrar-parte`).send({})).status).toBe(403)
        await parte(c.id, { modo: 'iguales', partes: 2 }, montoParte(37001, 2, 1))
        const cerrada = await cerrarSinCobro(c.id, { versionEsperada: await version(c.id), motivo: 'Se fueron sin pagar la otra parte' }, admin)
        expect(cerrada.estado).toBe('cerrada_sin_cobro')

        await TurnoCaja.updateOne({ estado: 'abierto' }, { $set: { estado: 'cerrado' } }) // atajo de prueba
        const otra = await cuentaPedida(2)
        expect((await parte(otra.id, { modo: 'iguales', partes: 2 }, montoParte(37001, 2, 1))).body.error.code).toBe('TURNO_CERRADO')
    })
})

describe('Migración 3b.2 (índice de comprobantes)', () => {
    const db = () => mongoose.connection.db
    const nombres = async () => (await db().collection('comprobantes').indexes()).map((i) => i.name)

    it('up cambia el índice único viejo por el de partes; down vuelve atrás; up → down → up', async () => {
        // Como antes de 3b.2: solo el índice viejo
        await db().collection('comprobantes').dropIndex(NUEVO).catch(() => {})
        await db().collection('comprobantes').createIndex({ cuenta: 1 }, { unique: true, name: VIEJO })
        expect(await up(db(), { dryRun: true })).toMatchObject({ crear: true, quitar: true, aplicado: false })
        expect(await nombres()).toContain(VIEJO)
        expect((await up(db())).aplicado).toBe(true)
        expect(await nombres()).toEqual(expect.arrayContaining([NUEVO]))
        expect(await nombres()).not.toContain(VIEJO)
        expect((await up(db())).aplicado).toBe(false) // idempotente
        expect((await down(db())).aplicado).toBe(true)
        expect(await nombres()).toContain(VIEJO)
        expect(await nombres()).not.toContain(NUEVO)
        expect((await up(db())).aplicado).toBe(true)
        // Deja el índice como lo define hoy el esquema (3b.4: parcial), para los tests siguientes
        await db().collection('comprobantes').dropIndex(NUEVO)
        await Comprobante.createIndexes()
    })

    it('down no revierte si ya hay una cuenta cobrada por partes', async () => {
        const c = await cuentaPedida()
        await parte(c.id, { modo: 'iguales', partes: 2 }, montoParte(37001, 2, 1))
        await parte(c.id, { modo: 'iguales', partes: 2 }, montoParte(37001, 2, 2))
        const r = await down(db())
        expect(r).toMatchObject({ aplicado: false })
        expect(r.bloqueo).toMatch(/partes/)
        expect(await nombres()).toContain(NUEVO)
    })
})
