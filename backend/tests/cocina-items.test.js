// 2.2 · Transiciones del ítem y tiempos (PLAN_FASE_2 §2.2; F2-1, F2-2, F2-7): la cocina y la barra marcan
// cada ítem (item:preparar), «Todo listo» por ronda y estación pasa por en_preparacion en la misma
// transacción, el mesero sirve (item:servir) y «Deshacer» de listo dura 10 s para quien lo marcó;
// después solo el admin, con motivo. Cada cambio guarda quién y cuándo en el ítem, sube `versionCocina`
// de la cuenta (no `version`: el mesero no recibe 409 por lo que hace la cocina) y deja su Evento.
// `de` (estado que vio la pantalla) es obligatorio.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { categoriaDePrueba } from './helpers/datos.js'
import { crearConSesion } from './helpers/usuarios.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { PERMISOS_SALON, PERMISOS_COCINA } from '../src/modulos/identidad/permisos.js'
import { abrirCuenta, agregarItem, enviarRonda, anularItem, cerrarSinCobro } from '../src/modulos/salon/cuentas.service.js'
import { cambiarEstadoItem, todoListo } from '../src/modulos/cocina/cocina.service.js'
import { verificarConsistenciaSalon } from '../src/modulos/salon/consistencia.js'

const { ObjectId } = mongoose.Types
const sesionDe = (rol, permisos) => ({ id: String(new ObjectId()), rol, permisos })
const error = async (promesa) => {
    try {
        await promesa
    } catch (e) {
        return e
    }
    throw new Error('Se esperaba un error')
}

let mesero
let cocinero
let otroCocinero
let barista
let admin
let cuenta
let ronda
let huevos
let tostada
let latte

beforeEach(async () => {
    await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes()])
    mesero = sesionDe('mesero', [...PERMISOS_SALON.mesero, ...PERMISOS_COCINA.mesero])
    cocinero = sesionDe('cocina', ['pedido:ver', ...PERMISOS_COCINA.cocina])
    otroCocinero = sesionDe('cocina', ['pedido:ver', ...PERMISOS_COCINA.cocina])
    barista = sesionDe('barista', ['pedido:ver', ...PERMISOS_COCINA.barista])
    admin = sesionDe('admin', ['*'])
    const zona = await Zona.create({ nombre: 'Interior' })
    const mesa = await Mesa.create({ numero: 1, zona: zona._id, capacidad: 4 })
    const platos = await categoriaDePrueba('Desayunos')
    const bebidas = await categoriaDePrueba('Bebidas')
    const pHuevos = await Producto.create({ codigo: 1, nombre: 'Huevos', precio: 15000, categoria: platos._id })
    const pTostada = await Producto.create({ codigo: 2, nombre: 'Tostada', precio: 8000, categoria: platos._id })
    const pLatte = await Producto.create({ codigo: 3, nombre: 'Latte', precio: 9000, categoria: bebidas._id })
    const abierta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, mesero)
    for (const p of [pHuevos, pTostada, pLatte]) await agregarItem(abierta.id, { productoId: String(p._id), cantidad: 1 }, mesero)
    const actual = await Cuenta.findById(abierta.id).lean()
    await enviarRonda(abierta.id, { numeroRonda: 1, versionEsperada: actual.version }, mesero)
    cuenta = await Cuenta.findById(abierta.id).lean()
    ronda = await Comanda.findOne({ cuenta: cuenta._id }).lean()
    const porNombre = (n) => String(ronda.items.find((i) => i.nombre === n)._id)
    huevos = porNombre('Huevos')
    tostada = porNombre('Tostada')
    latte = porNombre('Latte')
})

const itemDe = async (id) => (await Comanda.findOne({ 'items._id': id }).lean()).items.find((i) => String(i._id) === id)
const versionCuenta = async () => (await Cuenta.findById(cuenta._id).lean()).version
const versionCocina = async () => (await Cuenta.findById(cuenta._id).lean()).versionCocina ?? 0

describe('Transiciones del ítem con permiso (2.2)', () => {
    it('la cocina inicia y termina un ítem: guarda quién y cuándo, sube versionCocina (no la del mesero) y deja el Evento', async () => {
        const v0 = await versionCuenta()
        const c0 = await versionCocina()
        const r1 = await cambiarEstadoItem(huevos, { a: 'en_preparacion', de: 'enviado' }, cocinero)
        expect(r1.item).toMatchObject({ id: huevos, estado: 'en_preparacion' })
        const r2 = await cambiarEstadoItem(huevos, { a: 'listo', de: 'en_preparacion' }, cocinero)
        expect(r2.item.estado).toBe('listo')
        expect(r2.cuenta.versionCocina).toBe(c0 + 2)
        expect(await versionCuenta()).toBe(v0) // la tablet del mesero no recibe 409 por esto
        const item = await itemDe(huevos)
        expect(String(item.iniciadoPor)).toBe(cocinero.id)
        expect(String(item.listoPor)).toBe(cocinero.id)
        expect(item.iniciadoEn.getTime()).toBeLessThanOrEqual(item.listoEn.getTime())
        const eventos = await Evento.find({ entidad: 'cuenta', entidadId: cuenta._id, tipo: 'item_estado_cambiado' }).sort({ _id: 1 }).lean()
        expect(eventos.map((e) => [e.de, e.a, String(e.usuario), e.actor, e.datos.item.itemId])).toEqual([
            ['enviado', 'en_preparacion', cocinero.id, 'cocina', huevos],
            ['en_preparacion', 'listo', cocinero.id, 'cocina', huevos],
        ])
        expect((await verificarConsistenciaSalon()).problemas).toEqual([])
    })

    it('el mesero sirve un ítem listo (item:servir) y no puede prepararlo; la cocina no sirve', async () => {
        expect(await error(cambiarEstadoItem(huevos, { a: 'en_preparacion', de: 'enviado' }, mesero))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
        await cambiarEstadoItem(huevos, { a: 'en_preparacion', de: 'enviado' }, cocinero)
        await cambiarEstadoItem(huevos, { a: 'listo', de: 'en_preparacion' }, cocinero)
        expect(await error(cambiarEstadoItem(huevos, { a: 'servido', de: 'listo' }, cocinero))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
        const r = await cambiarEstadoItem(huevos, { a: 'servido', de: 'listo' }, mesero)
        expect(r.item.estado).toBe('servido')
        const item = await itemDe(huevos)
        expect(String(item.servidoPor)).toBe(mesero.id)
        expect(item.servidoEn).toBeInstanceOf(Date)
    })

    it('no se salta pasos: enviado → listo uno a uno es 409 (para eso está «Todo listo»)', async () => {
        expect(await error(cambiarEstadoItem(huevos, { a: 'listo', de: 'enviado' }, cocinero))).toMatchObject({ status: 409, code: 'TRANSICION_INVALIDA' })
        expect(await error(cambiarEstadoItem(huevos, { a: 'servido', de: 'enviado' }, mesero))).toMatchObject({ status: 409, code: 'TRANSICION_INVALIDA' })
    })

    it('`de` es obligatorio; el motivo solo vale para «Deshacer»; sin permiso del destino → 403 antes de mirar el estado', async () => {
        expect(await error(cambiarEstadoItem(huevos, { a: 'en_preparacion' }, cocinero))).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' })
        expect(await error(cambiarEstadoItem(huevos, { a: 'en_preparacion', de: 'enviado', motivo: 'x' }, cocinero)))
            .toMatchObject({ status: 400, code: 'MOTIVO_NO_APLICA' })
        // Un mesero (solo item:servir) no averigua el estado de un ítem pidiendo prepararlo con un `de` falso
        expect(await error(cambiarEstadoItem(huevos, { a: 'en_preparacion', de: 'listo' }, mesero))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
        expect(await Evento.countDocuments({ tipo: 'item_estado_cambiado' })).toBe(0)
    })

    it('con el estado esperado: si otro ya lo movió → 409 ITEM_MODIFICADO sin cambiar nada', async () => {
        await cambiarEstadoItem(huevos, { a: 'en_preparacion', de: 'enviado' }, cocinero)
        const e = await error(cambiarEstadoItem(huevos, { a: 'en_preparacion', de: 'enviado' }, otroCocinero))
        expect(e).toMatchObject({ status: 409, code: 'ITEM_MODIFICADO', details: { estado: 'en_preparacion' } })
        expect(String((await itemDe(huevos)).iniciadoPor)).toBe(cocinero.id)
    })

    it('dos tablets marcan el mismo ítem a la vez: una gana y la otra recibe 409', async () => {
        await cambiarEstadoItem(huevos, { a: 'en_preparacion', de: 'enviado' }, cocinero)
        const resultados = await Promise.allSettled([
            cambiarEstadoItem(huevos, { a: 'listo', de: 'en_preparacion' }, cocinero),
            cambiarEstadoItem(huevos, { a: 'listo', de: 'en_preparacion' }, otroCocinero),
        ])
        expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
        expect(resultados.find((r) => r.status === 'rejected').reason).toMatchObject({ status: 409 })
        expect(await Evento.countDocuments({ tipo: 'item_estado_cambiado', a: 'listo' })).toBe(1)
    })

    it('un ítem anulado no se prepara; una cuenta cerrada tampoco (sin Evento ni cambios)', async () => {
        const v = await versionCuenta()
        await anularItem(String(cuenta._id), tostada, { motivo: 'error_toma', versionEsperada: v }, admin)
        expect(await error(cambiarEstadoItem(tostada, { a: 'en_preparacion', de: 'anulado' }, cocinero))).toMatchObject({ status: 409, code: 'ESTADO_FINAL' })
        expect(await error(cambiarEstadoItem(String(new ObjectId()), { a: 'en_preparacion', de: 'enviado' }, cocinero))).toMatchObject({ status: 404, code: 'ITEM_NO_ENCONTRADO' })
        await cerrarSinCobro(String(cuenta._id), { motivo: 'Prueba', versionEsperada: await versionCuenta() }, admin)
        expect(await error(cambiarEstadoItem(huevos, { a: 'en_preparacion', de: 'enviado' }, cocinero))).toMatchObject({ status: 409, code: 'ESTADO_FINAL' })
        expect((await itemDe(huevos)).estado).toBe('enviado')
        expect(await Evento.countDocuments({ tipo: 'item_estado_cambiado' })).toBe(0)
    })

    it('un ítem de una ronda en borrador no se prepara; «Todo listo» de una ronda sin enviar → 404', async () => {
        const { item } = await agregarItem(String(cuenta._id), { productoId: String(ronda.items[0].producto), cantidad: 1 }, mesero)
        expect(await error(cambiarEstadoItem(item.id, { a: 'en_preparacion', de: 'borrador' }, cocinero))).toMatchObject({ status: 409, code: 'TRANSICION_INVALIDA' })
        const borrador = await Comanda.findOne({ cuenta: cuenta._id, estado: 'borrador' }).lean()
        expect(await error(todoListo(String(borrador._id), { estacion: 'cocina' }, cocinero))).toMatchObject({ status: 404, code: 'RONDA_NO_ENCONTRADA' })
    })

    it('el esquema exige los tiempos del estado y verificar:salon detecta los incoherentes escritos por fuera', async () => {
        const comanda = await Comanda.findById(ronda._id)
        comanda.items.id(huevos).estado = 'listo'
        await expect(comanda.save()).rejects.toThrow(/listo/)
        await Comanda.updateOne({ 'items._id': huevos }, { $set: { 'items.$.estado': 'listo' } })
        const { problemas } = await verificarConsistenciaSalon()
        expect(problemas.some((p) => /le falta iniciadoEn/.test(p.detalle))).toBe(true)
    })

    it('anulado conserva sus tiempos, pero en orden y sin huecos', async () => {
        const comanda = await Comanda.findById(ronda._id)
        const item = comanda.items.id(huevos)
        item.set({ estado: 'anulado', anulacion: { motivo: 'error_toma', por: admin.id, en: new Date() }, servidoEn: new Date(), servidoPor: admin.id })
        comanda.subtotal -= item.subtotal
        await expect(comanda.save()).rejects.toThrow(/sin iniciadoEn|huecos/)
    })
})

describe('«Todo listo» por ronda y estación (F2-1)', () => {
    it('pasa a listo los pendientes de esa estación, pasando por en_preparacion; no toca otras estaciones ni los anulados', async () => {
        await cambiarEstadoItem(tostada, { a: 'en_preparacion', de: 'enviado' }, cocinero)
        const c0 = await versionCocina()
        const r = await todoListo(String(ronda._id), { estacion: 'cocina' }, cocinero)
        expect(r.items.map((i) => [i.id, i.estado]).sort()).toEqual([[huevos, 'listo'], [tostada, 'listo']].sort())
        expect(r.cuenta.versionCocina).toBe(c0 + 1)
        for (const id of [huevos, tostada]) {
            const item = await itemDe(id)
            expect(item.iniciadoEn).toBeInstanceOf(Date)
            expect(item.listoEn.getTime()).toBeGreaterThanOrEqual(item.iniciadoEn.getTime())
        }
        expect((await itemDe(latte)).estado).toBe('enviado')
        // Huevos pasó por en_preparacion en la misma transacción: dos Eventos; tostada, uno
        const eventos = await Evento.find({ tipo: 'item_estado_cambiado' }).lean()
        expect(eventos.filter((e) => e.datos.item.itemId === huevos).map((e) => e.a)).toEqual(['en_preparacion', 'listo'])
        expect(eventos.filter((e) => e.datos.item.itemId === tostada).map((e) => e.a)).toEqual(['en_preparacion', 'listo'])
        expect((await verificarConsistenciaSalon()).problemas).toEqual([])
    })

    it('sin nada pendiente en esa estación → 409 NADA_PENDIENTE; sin item:preparar → 403', async () => {
        await todoListo(String(ronda._id), { estacion: 'barra' }, barista)
        expect(await error(todoListo(String(ronda._id), { estacion: 'barra' }, barista))).toMatchObject({ status: 409, code: 'NADA_PENDIENTE' })
        expect(await error(todoListo(String(ronda._id), { estacion: 'cocina' }, mesero))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    })
})

describe('«Deshacer» de listo (F2-7)', () => {
    const marcarListo = async (sesion) => {
        await cambiarEstadoItem(huevos, { a: 'en_preparacion', de: 'enviado' }, sesion)
        await cambiarEstadoItem(huevos, { a: 'listo', de: 'en_preparacion' }, sesion)
    }

    it('quien lo marcó lo deshace durante 10 s: vuelve a en preparación y se borra listoEn', async () => {
        await marcarListo(cocinero)
        vi.setSystemTime(new Date(Date.now() + 9_000))
        const r = await cambiarEstadoItem(huevos, { a: 'en_preparacion', de: 'listo' }, cocinero)
        expect(r.item.estado).toBe('en_preparacion')
        const item = await itemDe(huevos)
        expect(item.listoEn).toBeNull()
        expect(item.listoPor).toBeNull()
        expect(item.iniciadoEn).toBeInstanceOf(Date)
    })

    it('otra persona, o la misma pasados 10 s → 403 DESHACER_NO_PERMITIDO', async () => {
        await marcarListo(cocinero)
        expect(await error(cambiarEstadoItem(huevos, { a: 'en_preparacion', de: 'listo' }, otroCocinero)))
            .toMatchObject({ status: 403, code: 'DESHACER_NO_PERMITIDO' })
        vi.setSystemTime(new Date(Date.now() + 11_000))
        expect(await error(cambiarEstadoItem(huevos, { a: 'en_preparacion', de: 'listo' }, cocinero)))
            .toMatchObject({ status: 403, code: 'DESHACER_NO_PERMITIDO' })
    })

    it('pasados 10 s, el admin deshace con motivo (sin motivo → 400) y el Evento lo guarda', async () => {
        await marcarListo(cocinero)
        vi.setSystemTime(new Date(Date.now() + 60_000))
        expect(await error(cambiarEstadoItem(huevos, { a: 'en_preparacion', de: 'listo' }, admin))).toMatchObject({ status: 400, code: 'MOTIVO_REQUERIDO' })
        await cambiarEstadoItem(huevos, { a: 'en_preparacion', de: 'listo', motivo: 'Faltaba la salsa' }, admin)
        const evento = await Evento.findOne({ tipo: 'item_estado_cambiado', de: 'listo' }).lean()
        expect(evento).toMatchObject({ a: 'en_preparacion', motivo: 'Faltaba la salsa', actor: 'admin' })
    })
})

describe('Endpoints (2.2)', () => {
    it('POST /api/v1/staff/items/:id/estado y /cocina/rondas/:id/todo-listo con la sesión de cocina; un cliente → 403', async () => {
        const { sesion: cocina } = await crearConSesion('cocina')
        const r = await cocina.post(`/api/v1/staff/items/${huevos}/estado`).send({ a: 'en_preparacion', de: 'enviado' })
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        expect(r.body.item).toMatchObject({ id: huevos, estado: 'en_preparacion' })
        const t = await cocina.post(`/api/v1/staff/cocina/rondas/${ronda._id}/todo-listo`).send({ estacion: 'cocina' })
        expect(t.status, JSON.stringify(t.body)).toBe(200)
        const malo = await cocina.post(`/api/v1/staff/items/${huevos}/estado`).send({ a: 'volando', de: 'enviado' })
        expect(malo.status).toBe(400)
        const { sesion: cliente } = await crearConSesion('cliente')
        expect((await cliente.post(`/api/v1/staff/items/${latte}/estado`).send({ a: 'en_preparacion', de: 'enviado' })).status).toBe(403)
    })
})
