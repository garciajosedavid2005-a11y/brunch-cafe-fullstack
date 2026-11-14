// 2.7 · Agotar productos («86») desde la operación (PLAN_FASE_2 §2.7; F2-5): agotan cocina, barista, mesero y
// admin (producto:agotar); reactivan cocina, barista y admin (producto:reactivar); sin reactivación
// automática. Cada cambio deja un Evento con quién lo hizo y avisa por el canal «catalogo».
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba } from './helpers/datos.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import GrupoModificadores from '../src/modulos/catalogo/grupoModificadores.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { suscribir } from '../src/modulos/tiempoReal/bus.js'
import { validarCanales } from '../src/modulos/tiempoReal/eventos.routes.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import { PERMISOS_SALON, PERMISOS_COCINA } from '../src/modulos/identidad/permisos.js'
import { abrirCuenta, agregarItem, enviarRonda } from '../src/modulos/salon/cuentas.service.js'

const { ObjectId } = mongoose.Types
const BASE = '/api/v1/staff/agotados'

let huevos
let latte
let leche
let entera
let avena

beforeEach(async () => {
    const platos = await categoriaDePrueba('Desayunos')
    const bebidas = await categoriaDePrueba('Bebidas')
    leche = await GrupoModificadores.create({
        nombre: 'Leche', obligatorio: true, min: 1, max: 1,
        opciones: [{ nombre: 'Entera' }, { nombre: 'Avena', precioExtra: 2000 }],
    })
    entera = String(leche.opciones[0]._id)
    avena = String(leche.opciones[1]._id)
    huevos = await Producto.create({ codigo: 1, nombre: 'Huevos', precio: 15000, categoria: platos._id })
    latte = await Producto.create({ codigo: 2, nombre: 'Latte', precio: 9000, categoria: bebidas._id, gruposModificadores: [leche._id] })
})

afterEach(() => vi.restoreAllMocks())

const escuchar = () => {
    const avisos = []
    const baja = suscribir(['catalogo'], (a) => avisos.push(a))
    return { avisos, baja }
}

describe('Listado para agotar (2.7)', () => {
    it('con producto:agotar: productos (también los agotados) con su estación y las opciones de sus grupos', async () => {
        await Producto.updateOne({ _id: huevos._id }, { disponible: false })
        const { sesion } = await crearConSesion('mesero')
        const r = await sesion.get(BASE)
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        const porNombre = Object.fromEntries(r.body.productos.map((p) => [p.nombre, p]))
        expect(porNombre.Huevos).toMatchObject({ id: String(huevos._id), disponible: false, estacion: { codigo: 'cocina' } })
        expect(porNombre.Latte).toMatchObject({ disponible: true, estacion: { codigo: 'barra' }, grupos: [String(leche._id)] })
        expect(r.body.grupos).toEqual([{ id: String(leche._id), nombre: 'Leche', opciones: [
            { id: entera, nombre: 'Entera', disponible: true }, { id: avena, nombre: 'Avena', disponible: true },
        ] }])
    })

    it('sin permiso (un cliente) → 403', async () => {
        const { sesion } = await crearConSesion('cliente')
        expect((await sesion.get(BASE)).status).toBe(403)
    })
})

describe('Agotar y reactivar un producto (F2-5)', () => {
    it('el mesero lo agota: queda no disponible, con Evento (quién) y aviso en «catalogo»', async () => {
        const { sesion, usuario } = await crearConSesion('mesero')
        const { avisos, baja } = escuchar()
        try {
            const r = await sesion.post(`${BASE}/productos/${huevos._id}`).send({ disponible: false })
            expect(r.status, JSON.stringify(r.body)).toBe(200)
            expect(r.body).toEqual({ id: String(huevos._id), disponible: false, cambiado: true })
            expect((await Producto.findById(huevos._id).lean()).disponible).toBe(false)
            const evento = await Evento.findOne({ entidad: 'producto', entidadId: huevos._id }).lean()
            expect(evento).toMatchObject({ tipo: 'producto_agotado', de: 'disponible', a: 'agotado', actor: 'mesero' })
            expect(String(evento.usuario)).toBe(String(usuario._id))
            expect(avisos).toEqual([expect.objectContaining({ canal: 'catalogo', tipo: 'disponibilidad', ids: { productoId: String(huevos._id) } })])
        } finally {
            baja()
        }
    })

    it('agotar lo que ya está agotado no cambia nada ni deja otro Evento ni otro aviso (dos tablets a la vez)', async () => {
        const { sesion } = await crearConSesion('mesero')
        const { avisos, baja } = escuchar()
        try {
            await sesion.post(`${BASE}/productos/${huevos._id}`).send({ disponible: false })
            const r = await sesion.post(`${BASE}/productos/${huevos._id}`).send({ disponible: false })
            expect(r.status).toBe(200)
            expect(r.body.cambiado).toBe(false)
            expect(await Evento.countDocuments({ entidad: 'producto' })).toBe(1)
            expect(avisos).toHaveLength(1)
        } finally {
            baja()
        }
    })

    it('el mesero no reactiva (403, sin cambios); la cocina sí, con su Evento', async () => {
        await Producto.updateOne({ _id: huevos._id }, { disponible: false })
        const { sesion: mesero } = await crearConSesion('mesero')
        const negado = await mesero.post(`${BASE}/productos/${huevos._id}`).send({ disponible: true })
        expect(negado.status).toBe(403)
        expect((await Producto.findById(huevos._id).lean()).disponible).toBe(false)
        const { sesion: cocina } = await crearConSesion('cocina')
        const r = await cocina.post(`${BASE}/productos/${huevos._id}`).send({ disponible: true })
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        expect((await Producto.findById(huevos._id).lean()).disponible).toBe(true)
        expect(await Evento.findOne({ entidad: 'producto', tipo: 'producto_reactivado' }).lean()).toMatchObject({ de: 'agotado', a: 'disponible', actor: 'cocina' })
    })

    it('el admin agota y reactiva (por «*»)', async () => {
        const { sesion } = await crearConSesion('admin')
        expect((await sesion.post(`${BASE}/productos/${latte._id}`).send({ disponible: false })).status).toBe(200)
        expect((await Producto.findById(latte._id).lean()).disponible).toBe(false)
        expect((await sesion.post(`${BASE}/productos/${latte._id}`).send({ disponible: true })).status).toBe(200)
        expect((await Producto.findById(latte._id).lean()).disponible).toBe(true)
        const eventos = await Evento.find({ entidad: 'producto', entidadId: latte._id }).sort({ _id: 1 }).lean()
        expect(eventos.map((e) => [e.tipo, e.actor])).toEqual([['producto_agotado', 'admin'], ['producto_reactivado', 'admin']])
    })

    it('cuerpo estricto, producto inexistente o id mal formado', async () => {
        const { sesion } = await crearConSesion('mesero')
        expect((await sesion.post(`${BASE}/productos/${huevos._id}`).send({ disponible: 'no' })).status).toBe(400)
        expect((await sesion.post(`${BASE}/productos/${huevos._id}`).send({ disponible: false, precio: 1 })).status).toBe(400)
        expect((await sesion.post(`${BASE}/productos/${new ObjectId()}`).send({ disponible: false })).body.error.code).toBe('PRODUCTO_NO_ENCONTRADO')
        expect((await sesion.post(`${BASE}/productos/abc`).send({ disponible: false })).status).toBe(404)
    })

    it('el permiso va antes que la existencia: el mesero reactivando un id inexistente recibe 403, no 404', async () => {
        const { sesion } = await crearConSesion('mesero')
        const r = await sesion.post(`${BASE}/productos/${new ObjectId()}`).send({ disponible: true })
        expect(r.status, JSON.stringify(r.body)).toBe(403)
        const o = await sesion.post(`${BASE}/grupos/${new ObjectId()}/opciones/${new ObjectId()}`).send({ disponible: true })
        expect(o.status, JSON.stringify(o.body)).toBe(403)
    })

    it('si el Evento falla, nada cambia (producto ni opción) y no se avisa: todo va en la transacción', async () => {
        const { sesion } = await crearConSesion('admin')
        const { avisos, baja } = escuchar()
        try {
            vi.spyOn(Evento, 'create').mockRejectedValue(new Error('fallo simulado del Evento'))
            expect((await sesion.post(`${BASE}/productos/${huevos._id}`).send({ disponible: false })).status).toBe(500)
            expect((await sesion.post(`${BASE}/grupos/${leche._id}/opciones/${avena}`).send({ disponible: false })).status).toBe(500)
            expect((await Producto.findById(huevos._id).lean()).disponible).not.toBe(false)
            const grupo = await GrupoModificadores.findById(leche._id).lean()
            expect(grupo.opciones.find((o) => String(o._id) === avena).disponible).not.toBe(false)
            expect(grupo.__v).toBe(leche.__v)
            expect(avisos).toEqual([])
        } finally {
            baja()
        }
    })

    it('el catálogo de la toma de comanda lo muestra agotado', async () => {
        const { sesion } = await crearConSesion('mesero')
        await sesion.post(`${BASE}/productos/${huevos._id}`).send({ disponible: false })
        const catalogo = await sesion.get('/api/v1/staff/salon/catalogo')
        expect(catalogo.body.productos.find((p) => p.nombre === 'Huevos').disponible).toBe(false)
    })

    it('una ronda en curso con el producto o la opción recién agotados no se envía (PRODUCT_UNAVAILABLE, D3)', async () => {
        const mesero = { id: String(new ObjectId()), rol: 'mesero', permisos: [...PERMISOS_SALON.mesero, ...PERMISOS_COCINA.mesero] }
        const zona = await Zona.create({ nombre: 'Interior' })
        const mesa = await Mesa.create({ numero: 1, zona: zona._id, capacidad: 4 })
        await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes()])
        const cuenta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, mesero)
        await agregarItem(cuenta.id, { productoId: String(huevos._id), cantidad: 1 }, mesero)
        await agregarItem(cuenta.id, { productoId: String(latte._id), cantidad: 1, modificadores: [{ grupoId: String(leche._id), opcionIds: [avena] }] }, mesero)
        const { sesion } = await crearConSesion('cocina')
        expect((await sesion.post(`${BASE}/productos/${huevos._id}`).send({ disponible: false })).status).toBe(200)
        expect((await sesion.post(`${BASE}/grupos/${leche._id}/opciones/${avena}`).send({ disponible: false })).status).toBe(200)
        const { version } = await Cuenta.findById(cuenta.id).lean()
        let fallo = null
        try {
            await enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: version }, mesero)
        } catch (e) {
            fallo = e
        }
        expect(fallo).toMatchObject({ code: 'PRODUCT_UNAVAILABLE' })
        expect(fallo.details.items.map((i) => i.motivo).sort()).toEqual(['opcion_agotada', 'producto_agotado'])
    })
})

describe('Agotar y reactivar una opción (F2-5)', () => {
    it('la barra agota «Avena»: la opción queda no disponible, con Evento y aviso; reactivarla la devuelve', async () => {
        const { sesion, usuario } = await crearConSesion('barista')
        const { avisos, baja } = escuchar()
        try {
            const ruta = `${BASE}/grupos/${leche._id}/opciones/${avena}`
            const r = await sesion.post(ruta).send({ disponible: false })
            expect(r.status, JSON.stringify(r.body)).toBe(200)
            expect(r.body).toEqual({ id: avena, grupoId: String(leche._id), disponible: false, cambiado: true })
            const grupo = await GrupoModificadores.findById(leche._id).lean()
            expect(grupo.opciones.map((o) => o.disponible)).toEqual([true, false])
            const evento = await Evento.findOne({ entidad: 'modificador' }).lean()
            expect(evento).toMatchObject({ entidadId: leche._id, tipo: 'opcion_agotada', de: 'disponible', a: 'agotado', datos: { opcion: new ObjectId(avena), nombre: 'Avena' } })
            expect(String(evento.usuario)).toBe(String(usuario._id))
            expect((await sesion.post(ruta).send({ disponible: true })).status).toBe(200)
            expect((await GrupoModificadores.findById(leche._id).lean()).opciones[1].disponible).toBe(true)
            expect(avisos.map((a) => a.ids)).toEqual([{ grupoId: String(leche._id), opcionId: avena }, { grupoId: String(leche._id), opcionId: avena }])
        } finally {
            baja()
        }
    })

    it('opción o grupo inexistentes o ids mal formados → 404', async () => {
        const { sesion } = await crearConSesion('barista')
        expect((await sesion.post(`${BASE}/grupos/${leche._id}/opciones/${new ObjectId()}`).send({ disponible: false })).status).toBe(404)
        expect((await sesion.post(`${BASE}/grupos/${new ObjectId()}/opciones/${avena}`).send({ disponible: false })).status).toBe(404)
        expect((await sesion.post(`${BASE}/grupos/abc/opciones/${avena}`).send({ disponible: false })).status).toBe(404)
        expect((await sesion.post(`${BASE}/grupos/${leche._id}/opciones/abc`).send({ disponible: false })).status).toBe(404)
    })

    it('el mesero agota una opción pero no la reactiva (403, sin cambios); repetir no deja otro Evento ni aviso', async () => {
        const { sesion } = await crearConSesion('mesero')
        const ruta = `${BASE}/grupos/${leche._id}/opciones/${avena}`
        const { avisos, baja } = escuchar()
        try {
            expect((await sesion.post(ruta).send({ disponible: false })).body.cambiado).toBe(true)
            expect((await sesion.post(ruta).send({ disponible: false })).body.cambiado).toBe(false)
            expect((await sesion.post(ruta).send({ disponible: true })).status).toBe(403)
            expect((await GrupoModificadores.findById(leche._id).lean()).opciones[1].disponible).toBe(false)
            expect(await Evento.countDocuments({ entidad: 'modificador' })).toBe(1)
            expect(avisos).toHaveLength(1)
        } finally {
            baja()
        }
    })

    it('agotar una opción sube la versión del grupo: una edición del admin abierta desde antes no la pisa', async () => {
        const viejo = await GrupoModificadores.findById(leche._id)
        const { sesion } = await crearConSesion('barista')
        await sesion.post(`${BASE}/grupos/${leche._id}/opciones/${avena}`).send({ disponible: false })
        viejo.nombre = 'Leche y bebidas'
        await expect(viejo.save()).rejects.toThrow(mongoose.Error.VersionError)
        expect((await GrupoModificadores.findById(leche._id).lean()).opciones[1].disponible).toBe(false)
    })
})

describe('Canal «catalogo» (2.7)', () => {
    it('lo escuchan quien toma comanda, el KDS y quien agota; un cliente no', () => {
        expect(validarCanales('catalogo', { id: '1', permisos: ['comanda:tomar'] })).toEqual(['catalogo'])
        expect(validarCanales('catalogo', { id: '1', permisos: ['kds:ver'], estaciones: [] })).toEqual(['catalogo'])
        expect(validarCanales('catalogo', { id: '1', permisos: ['producto:agotar'] })).toEqual(['catalogo'])
        expect(() => validarCanales('catalogo', { id: '1', permisos: ['pedido:crear'] })).toThrow()
    })
})
