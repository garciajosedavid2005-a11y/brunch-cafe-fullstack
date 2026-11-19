// Fase 5 · 5.2 (F5-2) · Recetas de productos y opciones: suman o reemplazan insumos; consumo con merma.
import { describe, it, expect, beforeEach } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba } from './helpers/datos.js'
import Insumo from '../src/modulos/inventario/insumo.model.js'
import Receta from '../src/modulos/inventario/receta.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import GrupoModificadores from '../src/modulos/catalogo/grupoModificadores.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { consumoDeLineas } from '../src/modulos/inventario/recetas.service.js'
import { sembrarInventarioEjemplo } from '../src/seeds/inventario.js'
import mongoose from 'mongoose'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import MovimientoInventario from '../src/modulos/inventario/movimiento.model.js'
import { abrirCuenta, agregarItem, enviarRonda } from '../src/modulos/salon/cuentas.service.js'
import { PERMISOS_SALON } from '../src/modulos/identidad/permisos.js'

const BASE = '/api/v1/inventario/recetas'
let latte, leche, cafe, entera, almendra, hielo

beforeEach(async () => {
    await Promise.all([Insumo.createIndexes(), Receta.createIndexes()])
    const bebidas = await categoriaDePrueba('Bebidas')
    leche = await GrupoModificadores.create({
        nombre: 'Leche', obligatorio: false, min: 0, max: 1,
        opciones: [{ nombre: 'Entera', porDefecto: true }, { nombre: 'Almendra', precioExtra: 2000 }],
    })
    latte = await Producto.create({ codigo: 22, nombre: 'Latte frío', precio: 11000, categoria: bebidas._id, gruposModificadores: [leche._id] })
    ;[cafe, entera, almendra, hielo] = await Insumo.create([
        { nombre: 'Café', unidad: 'g', costoPromedio: 50 },
        { nombre: 'Leche entera', unidad: 'ml', costoPromedio: 4 },
        { nombre: 'Leche de almendra', unidad: 'ml', costoPromedio: 12 },
        { nombre: 'Hielo', unidad: 'g', costoPromedio: 0.5 },
    ])
})

const opcion = (nombre) => leche.opciones.find((o) => o.nombre === nombre)

describe('5.2 · Recetas', () => {
    it('compras guarda la receta de un producto (con merma) y de una opción que reemplaza; deja Evento', async () => {
        const { sesion } = await crearConSesion('compras')
        const r1 = await sesion.put(`${BASE}/productos/${latte._id}`).send({ lineas: [
            { insumoId: String(cafe._id), cantidad: 18 },
            { insumoId: String(entera._id), cantidad: 200, merma: 5 },
        ] })
        expect(r1.status, JSON.stringify(r1.body)).toBe(200)
        const r2 = await sesion.put(`${BASE}/grupos/${leche._id}/opciones/${opcion('Almendra')._id}`).send({ lineas: [
            { insumoId: String(almendra._id), cantidad: 200, reemplazaId: String(entera._id) },
        ] })
        expect(r2.status, JSON.stringify(r2.body)).toBe(200)

        const lista = (await sesion.get(BASE)).body
        const producto = lista.productos.find((p) => p.nombre === 'Latte frío')
        // 18 × 50 + 200 × 1,05 × 4 = 900 + 840
        expect(producto).toMatchObject({ costo: 1740, lineas: [expect.objectContaining({ insumo: 'Café', cantidad: 18 }), expect.objectContaining({ insumo: 'Leche entera', merma: 5 })] })
        const opcionAlmendra = lista.grupos[0].opciones.find((o) => o.nombre === 'Almendra')
        expect(opcionAlmendra.lineas[0]).toMatchObject({ insumo: 'Leche de almendra', reemplaza: 'Leche entera' })
        expect(await Evento.countDocuments({ tipo: 'receta_editada' })).toBe(2)
        // Editar una receta que ya existe exige su versión (revisión de seguridad)
        const otra = { lineas: [{ insumoId: String(cafe._id), cantidad: 20 }] }
        expect((await sesion.put(`${BASE}/productos/${latte._id}`).send(otra)).body.error.code).toBe('VALIDATION_ERROR')
        expect((await sesion.put(`${BASE}/productos/${latte._id}`).send({ ...otra, versionEsperada: 9 })).body.error.code).toBe('RECETA_CAMBIADA')
        expect((await sesion.put(`${BASE}/productos/${latte._id}`).send({ ...otra, versionEsperada: r1.body.version })).status).toBe(200)
    })

    it('consumo: la opción reemplaza el insumo del producto y suma el suyo; × cantidad', async () => {
        await Receta.create({ tipo: 'producto', producto: latte._id, lineas: [
            { insumo: cafe._id, cantidad: 18 }, { insumo: entera._id, cantidad: 200, merma: 5 }, { insumo: hielo._id, cantidad: 120 },
        ] })
        await Receta.create({ tipo: 'opcion', grupo: leche._id, opcion: opcion('Almendra')._id, lineas: [
            { insumo: almendra._id, cantidad: 200, reemplaza: entera._id },
        ] })
        const conEntera = await consumoDeLineas([{ producto: latte._id, cantidad: 2, modificadores: [{ grupo: leche._id, opcion: opcion('Entera')._id }] }])
        expect(Object.fromEntries(conEntera.map((l) => [l.insumo, l.cantidad]))).toEqual({
            [String(cafe._id)]: 36, [String(entera._id)]: 420, [String(hielo._id)]: 240,
        })
        const conAlmendra = await consumoDeLineas([{ producto: latte._id, cantidad: 1, modificadores: [{ grupo: leche._id, opcion: opcion('Almendra')._id }] }])
        expect(Object.fromEntries(conAlmendra.map((l) => [l.insumo, l.cantidad]))).toEqual({
            [String(cafe._id)]: 18, [String(almendra._id)]: 200, [String(hielo._id)]: 120,
        })
    })

    it('5.8.1 · cada producto trae sus variantes por opción, con lo que cambia, su precio y su costo', async () => {
        await Receta.create({ tipo: 'producto', producto: latte._id, lineas: [
            { insumo: cafe._id, cantidad: 18 }, { insumo: entera._id, cantidad: 200, merma: 5 },
        ] })
        await Receta.create({ tipo: 'opcion', grupo: leche._id, opcion: opcion('Almendra')._id, lineas: [
            { insumo: almendra._id, cantidad: 200, reemplaza: entera._id },
        ] })
        const { sesion } = await crearConSesion('compras')
        const producto = (await sesion.get(BASE)).body.productos.find((p) => p.nombre === 'Latte frío')
        // Solo la opción que cambia la receta (Entera no tiene receta propia)
        expect(producto.variantes).toEqual([expect.objectContaining({
            grupo: 'Leche', opcion: 'Almendra', precio: 13000, version: 0,
            // 18 × 50 de café + 200 × 12 de leche de almendra (la entera y su merma salen)
            costo: 3300,
            cambios: [expect.objectContaining({ insumo: 'Leche de almendra', reemplaza: 'Leche entera', cantidad: 200 })],
        })])
    })

    it('5.8.1 · un Latte frío con Almendra descuenta leche de almendra y no leche entera al enviar la ronda', async () => {
        await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes(), MovimientoInventario.createIndexes()])
        await Insumo.updateMany({}, { $set: { existencia: 5000 } })
        await Receta.create({ tipo: 'producto', producto: latte._id, lineas: [
            { insumo: cafe._id, cantidad: 18 }, { insumo: entera._id, cantidad: 200 },
        ] })
        await Receta.create({ tipo: 'opcion', grupo: leche._id, opcion: opcion('Almendra')._id, lineas: [
            { insumo: almendra._id, cantidad: 200, reemplaza: entera._id },
        ] })
        const mesero = { id: String(new mongoose.Types.ObjectId()), rol: 'mesero', permisos: PERMISOS_SALON.mesero }
        const zona = await Zona.create({ nombre: 'Interior' })
        const mesa = await Mesa.create({ numero: 1, zona: zona._id, capacidad: 4 })
        const cuenta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 1 }, mesero)
        await agregarItem(cuenta.id, {
            productoId: String(latte._id), cantidad: 2,
            modificadores: [{ grupoId: String(leche._id), opcionIds: [String(opcion('Almendra')._id)] }],
        }, mesero)
        await enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: (await Cuenta.findById(cuenta.id).lean()).version }, mesero)
        const existencias = Object.fromEntries((await Insumo.find().lean()).map((i) => [i.nombre, i.existencia]))
        expect(existencias).toMatchObject({ 'Leche de almendra': 4600, 'Leche entera': 5000, Café: 4964 })
        expect(await MovimientoInventario.exists({ insumo: entera._id })).toBeNull()
    })

    it('rechaza insumos inactivos, repetidos, cantidades en 0 y reemplazos en la receta de un producto', async () => {
        const { sesion } = await crearConSesion('compras')
        await Insumo.updateOne({ _id: hielo._id }, { activo: false })
        const put = (lineas) => sesion.put(`${BASE}/productos/${latte._id}`).send({ lineas })
        expect((await put([{ insumoId: String(hielo._id), cantidad: 1 }])).body.error.code).toBe('INSUMO_NO_DISPONIBLE')
        expect((await put([{ insumoId: String(cafe._id), cantidad: 0 }])).body.error.code).toBe('VALIDATION_ERROR')
        expect((await put([{ insumoId: String(cafe._id), cantidad: 1 }, { insumoId: String(cafe._id), cantidad: 2 }])).status).toBe(400)
        expect((await put([{ insumoId: String(cafe._id), cantidad: 1, reemplazaId: String(entera._id) }])).body.error.code).toBe('VALIDATION_ERROR')
    })

    it('sin inventario:gestionar no se edita; el mesero no ve recetas', async () => {
        const { sesion: mesero } = await crearConSesion('mesero')
        expect((await mesero.get(BASE)).status).toBe(403)
        const { sesion: admin } = await crearConSesion('admin')
        expect((await admin.put(`${BASE}/productos/${latte._id}`).send({ lineas: [] })).status).toBe(200)
    })

    it('el seed de ejemplo crea insumos y recetas y es idempotente', async () => {
        const primera = await sembrarInventarioEjemplo()
        expect(primera.insumos).toBeGreaterThan(20)
        const segunda = await sembrarInventarioEjemplo()
        expect(segunda).toEqual({ insumos: 0, recetas: 0 })
    })
})
