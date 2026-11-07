import { describe, it, expect, beforeEach } from 'vitest'
import Estacion from '../src/modulos/catalogo/estacion.model.js'
import Categoria from '../src/modulos/catalogo/categoria.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import GrupoModificadores from '../src/modulos/catalogo/grupoModificadores.model.js'

// 1.3 · Seeds: estaciones Cocina y Barra (seed:base) y grupos de ejemplo (seed:modificadores, F1-4).
// Idempotentes y sin pisar ediciones.
const nombres = async () => (await GrupoModificadores.find().sort({ nombre: 1 }).lean()).map((g) => g.nombre)

describe('sembrarEstaciones', () => {
    it('crea Cocina y Barra si faltan y no toca las existentes', async () => {
        const { sembrarEstaciones } = await import('../src/seeds/estaciones.js')
        await Estacion.deleteMany({})
        expect(await sembrarEstaciones()).toEqual({ creadas: 2, existentes: 0 })
        await Estacion.updateOne({ codigo: 'barra' }, { nombre: 'Barra de café' })
        expect(await sembrarEstaciones()).toEqual({ creadas: 0, existentes: 2 })
        expect((await Estacion.findOne({ codigo: 'barra' })).nombre).toBe('Barra de café')
        expect(await Estacion.countDocuments()).toBe(2)
    })

    it('si otra estación ya se llama «Cocina» con otro código, lo dice (no lo cuenta como existente)', async () => {
        const { sembrarEstaciones } = await import('../src/seeds/estaciones.js')
        await Estacion.deleteMany({})
        await Estacion.init()
        await Estacion.create({ codigo: 'cocina_principal', nombre: 'Cocina' })
        await expect(sembrarEstaciones()).rejects.toThrow(/«Cocina».*cocina_principal/)
    })
})

describe('sembrarModificadoresEjemplo', () => {
    let productos
    beforeEach(async () => {
        const cocina = await Estacion.findOne({ codigo: 'cocina' })
        const barra = await Estacion.findOne({ codigo: 'barra' })
        const desayunos = await Categoria.create({ nombre: 'Desayunos', estacion: cocina._id })
        const bebidas = await Categoria.create({ nombre: 'Bebidas', estacion: barra._id })
        const crear = (codigo, nombre, categoria) => Producto.create({ codigo, nombre, precio: 10000, categoria: categoria._id })
        productos = {
            clasico: await crear(1, 'Desayuno clásico gourmet', desayunos),
            aguacate: await crear(2, 'Tostada de aguacate gourmet', desayunos),
            omelette: await crear(3, 'Omelette de espárragos y queso de cabra', desayunos),
            campesina: await crear(15, 'Tostada campesina con huevo', desayunos),
            limonada: await crear(21, 'Limonada de hierbabuena', bebidas),
            latte: await crear(22, 'Latte frío artesanal', bebidas),
            te: await crear(23, 'Té helado de jazmín', bebidas),
            smoothie: await crear(24, 'Smoothie de mango y jengibre', bebidas),
        }
    })

    const gruposDe = async (producto) => {
        const p = await Producto.findById(producto._id).populate('gruposModificadores', 'nombre').lean()
        return p.gruposModificadores.map((g) => g.nombre)
    }

    it('crea Leche, Tamaño, Término del huevo y Extras marcados como ejemplo, con reglas válidas', async () => {
        const { sembrarModificadoresEjemplo } = await import('../src/seeds/modificadores.js')
        const r = await sembrarModificadoresEjemplo()
        expect(r.grupos).toEqual({ creados: 4, existentes: 0 })
        expect(await nombres()).toEqual(['Extras', 'Leche', 'Tamaño', 'Término del huevo'])
        const grupos = await GrupoModificadores.find().lean()
        expect(grupos.every((g) => g.ejemplo === true && g.activo === true)).toBe(true)
        const porNombre = Object.fromEntries(grupos.map((g) => [g.nombre, g]))
        expect(porNombre['Término del huevo']).toMatchObject({ obligatorio: true, min: 1, max: 1 })
        expect(porNombre['Término del huevo'].opciones.map((o) => o.nombre)).toEqual(['Yema líquida', 'Yema media', 'Bien cocido'])
        expect(porNombre.Leche.opciones.map((o) => [o.nombre, o.precioExtra])).toEqual([['Entera', 0], ['Deslactosada', 0], ['Almendra', 2000]])
        expect(porNombre['Tamaño'].opciones.map((o) => [o.nombre, o.precioExtra])).toEqual([['Normal', 0], ['Grande', 3000]])
        expect(porNombre.Extras.opciones.every((o) => Number.isInteger(o.precioExtra) && o.precioExtra > 0)).toBe(true)
    })

    it('asigna el Término del huevo a los 3 platos con huevo (sin el omelette) y Leche/Tamaño a las bebidas', async () => {
        const { sembrarModificadoresEjemplo } = await import('../src/seeds/modificadores.js')
        await sembrarModificadoresEjemplo()
        for (const p of ['clasico', 'aguacate', 'campesina']) expect(await gruposDe(productos[p])).toEqual(['Término del huevo', 'Extras'])
        expect(await gruposDe(productos.omelette)).toEqual([])
        expect(await gruposDe(productos.latte)).toEqual(['Leche', 'Tamaño'])
        for (const p of ['limonada', 'te', 'smoothie']) expect(await gruposDe(productos[p])).toEqual(['Tamaño'])
    })

    it('es idempotente y no pisa ediciones: grupos existentes ni productos que ya tienen grupos', async () => {
        const { sembrarModificadoresEjemplo } = await import('../src/seeds/modificadores.js')
        await GrupoModificadores.create({ nombre: 'leche', obligatorio: true, min: 1, max: 1, opciones: [{ nombre: 'Avena' }] })
        const extras = await GrupoModificadores.create({ nombre: 'Mis extras', obligatorio: false, min: 0, max: 1, opciones: [{ nombre: 'Miel', precioExtra: 1000 }] })
        await Producto.updateOne({ _id: productos.clasico._id }, { gruposModificadores: [extras._id] })

        const r = await sembrarModificadoresEjemplo()
        expect(r.grupos).toEqual({ creados: 3, existentes: 1 })
        expect((await GrupoModificadores.findOne({ nombre: 'leche' })).opciones.map((o) => o.nombre)).toEqual(['Avena'])
        expect(await gruposDe(productos.clasico)).toEqual(['Mis extras'])

        const otra = await sembrarModificadoresEjemplo()
        expect(otra.grupos).toEqual({ creados: 0, existentes: 4 })
        expect(otra.productos.asignados).toBe(0)
        expect(await GrupoModificadores.countDocuments()).toBe(5)
    })

    it('un producto del ejemplo que no existe se omite sin error', async () => {
        const { sembrarModificadoresEjemplo } = await import('../src/seeds/modificadores.js')
        await Producto.deleteOne({ _id: productos.latte._id })
        const r = await sembrarModificadoresEjemplo()
        expect(r.productos.noEncontrados).toContain('Latte frío artesanal')
    })
})
