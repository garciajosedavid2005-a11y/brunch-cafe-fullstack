// 2.6 · Aviso al mesero y «servido» (PLAN_FASE_2 §2.6; F2-2, F2-7): el plano dice cuántos ítems de cada
// cuenta están listos para servir, la cuenta trae los tiempos de cada ítem (para el «Deshacer» del admin
// pasados los 10 s) y el canal del mesero se entera de lo que queda listo, se sirve o se deshace.
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { categoriaDePrueba } from './helpers/datos.js'
import { crearConSesion } from './helpers/usuarios.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import { PERMISOS_SALON, PERMISOS_COCINA } from '../src/modulos/identidad/permisos.js'
import { abrirCuenta, agregarItem, enviarRonda, anularItem, obtenerCuenta } from '../src/modulos/salon/cuentas.service.js'
import { obtenerPlano } from '../src/modulos/salon/salonStaff.service.js'
import { cambiarEstadoItem, todoListo } from '../src/modulos/cocina/cocina.service.js'
import { suscribir } from '../src/modulos/tiempoReal/bus.js'

const { ObjectId } = mongoose.Types
const sesionDe = (rol, permisos) => ({ id: String(new ObjectId()), rol, permisos, estaciones: { cocina: ['cocina'], barista: ['barra'] }[rol] ?? [] })

let mesero
let cocinero
let admin
let cuenta
let otra
let items

const abrirConRonda = async (mesa, productos) => {
    const abierta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, mesero)
    for (const p of productos) await agregarItem(abierta.id, { productoId: String(p._id), cantidad: 2 }, mesero)
    const actual = await Cuenta.findById(abierta.id).lean()
    await enviarRonda(abierta.id, { numeroRonda: 1, versionEsperada: actual.version }, mesero)
    return Cuenta.findById(abierta.id).lean()
}

beforeEach(async () => {
    await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes()])
    mesero = sesionDe('mesero', [...PERMISOS_SALON.mesero, ...PERMISOS_COCINA.mesero])
    cocinero = sesionDe('cocina', ['pedido:ver', ...PERMISOS_COCINA.cocina])
    admin = sesionDe('admin', ['*'])
    const zona = await Zona.create({ nombre: 'Interior' })
    const mesa1 = await Mesa.create({ numero: 1, zona: zona._id, capacidad: 4 })
    const mesa2 = await Mesa.create({ numero: 2, zona: zona._id, capacidad: 4 })
    const platos = await categoriaDePrueba('Desayunos')
    const productos = await Promise.all(['Huevos', 'Tostada', 'Arepa'].map((nombre, i) => Producto.create({ codigo: i + 1, nombre, precio: 10000, categoria: platos._id })))
    cuenta = await abrirConRonda(mesa1, productos)
    otra = await abrirConRonda(mesa2, productos.slice(0, 1))
    const ronda = await Comanda.findOne({ cuenta: cuenta._id }).lean()
    items = Object.fromEntries(ronda.items.map((i) => [i.nombre, String(i._id)]))
})

const listo = async (itemId) => {
    await cambiarEstadoItem(itemId, { a: 'en_preparacion', de: 'enviado' }, cocinero)
    return cambiarEstadoItem(itemId, { a: 'listo', de: 'en_preparacion' }, cocinero)
}
const cuentaEnPlano = async (c) => (await obtenerPlano({}, mesero)).mesas.find((m) => m.cuenta?.id === String(c._id)).cuenta

describe('«Listo para servir» en el plano (2.6)', () => {
    it('cuenta las líneas listas de cada cuenta (no las servidas, las anuladas ni las pendientes)', async () => {
        expect(await cuentaEnPlano(cuenta)).toMatchObject({ listosParaServir: 0 })
        await listo(items.Huevos)
        await listo(items.Tostada)
        await listo(items.Arepa)
        expect((await cuentaEnPlano(cuenta)).listosParaServir).toBe(3) // líneas, no unidades (cada una con cantidad 2)
        await cambiarEstadoItem(items.Huevos, { a: 'servido', de: 'listo' }, mesero)
        const actual = await Cuenta.findById(cuenta._id).lean()
        await anularItem(String(cuenta._id), items.Tostada, { motivo: 'cliente_cambio', versionEsperada: actual.version }, admin) // F1-19: anula el admin
        expect((await cuentaEnPlano(cuenta)).listosParaServir).toBe(1)
        // La otra cuenta no se mezcla
        expect((await cuentaEnPlano(otra)).listosParaServir).toBe(0)
    })

    it('suma las líneas listas de todas las rondas de la cuenta', async () => {
        await listo(items.Huevos)
        const producto = await Producto.findOne({ nombre: 'Arepa' }).lean()
        await agregarItem(String(cuenta._id), { productoId: String(producto._id), cantidad: 1 }, mesero)
        const actual = await Cuenta.findById(cuenta._id).lean()
        await enviarRonda(String(cuenta._id), { numeroRonda: 2, versionEsperada: actual.version }, mesero)
        const ronda2 = await Comanda.findOne({ cuenta: cuenta._id, numeroRonda: 2 }).lean()
        await listo(String(ronda2.items[0]._id))
        expect((await cuentaEnPlano(cuenta)).listosParaServir).toBe(2)
    })

    it('«Todo listo» de la ronda suma todas sus líneas pendientes', async () => {
        const ronda = await Comanda.findOne({ cuenta: otra._id }).lean()
        await todoListo(String(ronda._id), { estacion: ronda.items[0].estacion.codigo }, cocinero)
        expect((await cuentaEnPlano(otra)).listosParaServir).toBe(1)
    })
})

describe('Tiempos del ítem en la cuenta (2.6)', () => {
    it('cada ítem trae cuándo empezó, quedó listo y se sirvió (sin el id de quién lo preparó)', async () => {
        await listo(items.Huevos)
        await cambiarEstadoItem(items.Huevos, { a: 'servido', de: 'listo' }, mesero)
        await listo(items.Tostada)
        const detalle = await obtenerCuenta(String(cuenta._id), mesero)
        const porNombre = Object.fromEntries(detalle.rondas[0].items.map((i) => [i.nombre, i]))
        expect(porNombre.Huevos).toMatchObject({ estado: 'servido' })
        expect(porNombre.Huevos).not.toHaveProperty('listoPor')
        expect(new Date(porNombre.Huevos.servidoEn).getTime()).toBeGreaterThanOrEqual(new Date(porNombre.Huevos.listoEn).getTime())
        expect(porNombre.Tostada).toMatchObject({ estado: 'listo', servidoEn: null })
        expect(porNombre.Tostada.iniciadoEn).toBeTruthy()
        expect(porNombre.Arepa).toMatchObject({ estado: 'enviado', iniciadoEn: null, listoEn: null, servidoEn: null })
    })
})

describe('Canal del mesero (2.6)', () => {
    it('recibe lo que queda listo, lo que se sirve y el «Deshacer» del admin; no recibe «Empezar»', async () => {
        const avisos = []
        const baja = suscribir([`mesero:${cuenta.mesero}`], (aviso) => avisos.push(aviso))
        try {
            await cambiarEstadoItem(items.Huevos, { a: 'en_preparacion', de: 'enviado' }, cocinero)
            expect(avisos).toEqual([])
            await cambiarEstadoItem(items.Huevos, { a: 'listo', de: 'en_preparacion' }, cocinero)
            // Sirve otro mesero (F1-17): el aviso va al mesero de la cuenta, no a quien sirve
            const otroMesero = sesionDe('mesero', [...PERMISOS_SALON.mesero, ...PERMISOS_COCINA.mesero])
            const delOtro = []
            const bajaOtro = suscribir([`mesero:${otroMesero.id}`], (aviso) => delOtro.push(aviso))
            await cambiarEstadoItem(items.Huevos, { a: 'servido', de: 'listo' }, otroMesero)
            bajaOtro()
            expect(delOtro).toEqual([])
            await listo(items.Tostada)
            // El admin no lo marcó: lo deshace siempre con motivo (F2-7)
            await cambiarEstadoItem(items.Tostada, { a: 'en_preparacion', de: 'listo', motivo: 'Faltaba la salsa' }, admin)
            expect(avisos.map((a) => a.ids.itemId)).toEqual([items.Huevos, items.Huevos, items.Tostada, items.Tostada])
            expect(avisos.every((a) => a.tipo === 'item_estado' && a.ids.cuentaId === String(cuenta._id))).toBe(true)
        } finally {
            baja()
        }
    })
})

describe('Operaciones del salón que cambian lo listo (2.6, revisor-backend)', () => {
    it('anular un ítem listo avisa al mesero de la cuenta', async () => {
        await listo(items.Huevos)
        const { sesion } = await crearConSesion('admin')
        const avisos = []
        const baja = suscribir([`mesero:${cuenta.mesero}`], (aviso) => avisos.push(aviso))
        try {
            const { version } = await Cuenta.findById(cuenta._id).lean()
            const r = await sesion.post(`/api/v1/staff/salon/cuentas/${cuenta._id}/items/${items.Huevos}/anular`).send({ motivo: 'cliente_cambio', versionEsperada: version })
            expect(r.status, JSON.stringify(r.body)).toBe(200)
            expect(avisos).toHaveLength(1)
        } finally {
            baja()
        }
    })

    it('transferir la cuenta avisa al mesero anterior y al nuevo', async () => {
        const { sesion, usuario: nuevo } = await crearConSesion('mesero')
        const avisos = []
        const baja = suscribir([`mesero:${cuenta.mesero}`, `mesero:${nuevo._id}`], (aviso) => avisos.push(aviso))
        try {
            const { version } = await Cuenta.findById(cuenta._id).lean()
            const r = await sesion.post(`/api/v1/staff/salon/cuentas/${cuenta._id}/transferir`).send({ meseroId: String(nuevo._id), motivo: 'Cambio de turno', versionEsperada: version })
            expect(r.status, JSON.stringify(r.body)).toBe(200)
            expect(avisos.map((a) => a.canal).sort()).toEqual([`mesero:${cuenta.mesero}`, `mesero:${nuevo._id}`].sort())
        } finally {
            baja()
        }
    })
})
