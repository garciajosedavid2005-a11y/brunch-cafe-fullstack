import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { api } from './helpers/app.js'
import Categoria from '../src/modulos/catalogo/categoria.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Estacion from '../src/modulos/catalogo/estacion.model.js'
import GrupoModificadores from '../src/modulos/catalogo/grupoModificadores.model.js'

// 1.3 · /api/v1/catalogo: sin ?incluir=modificadores la respuesta es idéntica a la anterior (contrato
// público); con el parámetro, cada producto añade su estación efectiva y sus grupos activos.
const CLAVES_PRODUCTO = ['categoria', 'codigo', 'descripcion', 'destacado', 'id', 'imagen', 'nombre', 'precio']

let latte
let leche
let extras
beforeEach(async () => {
    const barra = await Estacion.findOne({ codigo: 'barra' })
    const cocina = await Estacion.findOne({ codigo: 'cocina' })
    const bebidas = await Categoria.create({ nombre: 'Bebidas', estacion: barra._id })
    const desayunos = await Categoria.create({ nombre: 'Desayunos', estacion: cocina._id })
    leche = await GrupoModificadores.create({
        nombre: 'Leche', obligatorio: false, min: 0, max: 1,
        opciones: [{ nombre: 'Entera' }, { nombre: 'Almendra', precioExtra: 2000, disponible: false }],
    })
    extras = await GrupoModificadores.create({ nombre: 'Extras', obligatorio: false, min: 0, max: 1, opciones: [{ nombre: 'Queso', precioExtra: 3000 }], activo: false })
    latte = await Producto.create({ codigo: 1, nombre: 'Latte', precio: 9000, categoria: bebidas._id, gruposModificadores: [leche._id, extras._id] })
    // Producto de cocina servido en barra (sobrescritura) y sin grupos
    await Producto.create({ codigo: 2, nombre: 'Croissant', precio: 6000, categoria: desayunos._id, estacion: barra._id })
    await Producto.create({ codigo: 3, nombre: 'Huevos', precio: 15000, categoria: desayunos._id })
})

describe('Contrato de /api/v1/catalogo (1.3)', () => {
    it('sin el parámetro: las mismas claves de antes, sin estación ni modificadores', async () => {
        const res = await api().get('/api/v1/catalogo')
        expect(res.status).toBe(200)
        expect(Object.keys(res.body).sort()).toEqual(['categorias', 'productos'])
        expect(res.body.categorias).toEqual(['Bebidas', 'Desayunos'])
        for (const producto of res.body.productos) expect(Object.keys(producto).sort()).toEqual(CLAVES_PRODUCTO)
        expect(JSON.stringify(res.body)).not.toMatch(/estacion|modificadores|Almendra/)
    })

    it('con ?incluir=modificadores: estación efectiva y solo los grupos activos, con todas sus opciones', async () => {
        const res = await api().get('/api/v1/catalogo?incluir=modificadores')
        expect(res.status).toBe(200)
        const porCodigo = Object.fromEntries(res.body.productos.map((p) => [p.codigo, p]))
        expect(Object.keys(porCodigo[1]).sort()).toEqual([...CLAVES_PRODUCTO, 'estacion', 'modificadores'].sort())
        expect(porCodigo[1].estacion).toEqual({ codigo: 'barra', nombre: 'Barra' })
        expect(porCodigo[1].modificadores).toEqual([{
            id: String(leche._id), nombre: 'Leche', obligatorio: false, min: 0, max: 1,
            opciones: [
                { id: String(leche.opciones[0]._id), nombre: 'Entera', precioExtra: 0, disponible: true },
                { id: String(leche.opciones[1]._id), nombre: 'Almendra', precioExtra: 2000, disponible: false },
            ],
        }])
        expect(porCodigo[2].estacion).toEqual({ codigo: 'barra', nombre: 'Barra' })
        expect(porCodigo[3]).toMatchObject({ estacion: { codigo: 'cocina', nombre: 'Cocina' }, modificadores: [] })
        expect(latte.gruposModificadores).toHaveLength(2) // el inactivo sigue asignado, pero no se ofrece
    })

    it('un producto cuya categoría ya no existe no rompe el catálogo con modificadores', async () => {
        await Producto.create({ codigo: 4, nombre: 'Huérfano', precio: 1000, categoria: new mongoose.Types.ObjectId() })
        const res = await api().get('/api/v1/catalogo?incluir=modificadores')
        expect(res.status).toBe(200)
        expect(res.body.productos.find((p) => p.codigo === 4)).toMatchObject({ estacion: null, modificadores: [] })
    })

    it('un valor de incluir desconocido → 400 VALIDATION_ERROR', async () => {
        for (const q of ['incluir=todo', 'incluir=modificadores&incluir=modificadores']) {
            const res = await api().get(`/api/v1/catalogo?${q}`)
            expect(res.status, q).toBe(400)
            expect(res.body.error.code).toBe('VALIDATION_ERROR')
        }
    })
})
