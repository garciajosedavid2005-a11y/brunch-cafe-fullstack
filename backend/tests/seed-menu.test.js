import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, relative } from 'node:path'
import Categoria from '../src/modulos/catalogo/categoria.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import MenuImage from '../src/modulos/catalogo/menuImage.model.js'
import Estacion from '../src/modulos/catalogo/estacion.model.js'
import { sembrarMenu, DIRECTORIO_SEED } from '../src/seeds/menu.js'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

let dir
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'seed-menu-'))
    mkdirSync(join(dir, 'imagenes'))
    writeFileSync(join(dir, 'imagenes', 'latte.png'), PNG)
    writeFileSync(join(dir, 'imagenes', 'waffle.png'), PNG)
    writeFileSync(join(dir, 'menu.json'), JSON.stringify({
        categorias: [{ nombre: 'Bebidas', descripcion: 'Calientes y frías' }, { nombre: 'Postres', descripcion: 'Dulces' }],
        productos: [
            { codigo: 1, nombre: 'Latte', descripcion: 'Café con leche', precio: 9000, categoria: 'Bebidas', imagen: 'latte.png', destacado: true },
            { codigo: 2, nombre: 'Waffle', descripcion: 'Con frutas', precio: 15000, categoria: 'Postres', imagen: 'waffle.png', destacado: false },
        ],
    }))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('Seed del menú', () => {
    it('lee sus datos de backend/seed-data (no de la carpeta del frontend)', () => {
        const backend = resolve(import.meta.dirname, '..')
        expect(relative(backend, DIRECTORIO_SEED)).toBe('seed-data')
        const codigo = readFileSync(resolve(backend, 'src/seeds/menu.js'), 'utf8') + readFileSync(resolve(backend, 'scripts/seed-menu.js'), 'utf8')
        expect(codigo).not.toMatch(/frontend/)
    })

    it('crea categorías, imágenes y productos con precio entero e imagen como URL', async () => {
        const resumen = await sembrarMenu({ directorio: dir })
        expect(resumen).toEqual({
            categorias: { creadas: 2, existentes: 0 },
            imagenes: { creadas: 2, existentes: 0 },
            productos: { creados: 2, existentes: 0 },
        })
        const latte = await Producto.findOne({ codigo: 1 }).populate('categoria').lean()
        expect(latte).toMatchObject({ nombre: 'Latte', precio: 9000, destacado: true, disponible: true, imagen: '/productos/menu/imagenes/latte.png' })
        expect(latte.categoria).toMatchObject({ nombre: 'Bebidas', descripcion: 'Calientes y frías' })
        expect((await MenuImage.findOne({ nombre: 'latte.png' })).contentType).toBe('image/png')
    })

    it('1.3 · las categorías nuevas nacen con su estación (Bebidas → Barra, el resto → Cocina), aunque falten las estaciones', async () => {
        await Estacion.deleteMany({})
        await sembrarMenu({ directorio: dir })
        const codigo = async (nombre) => (await Categoria.findOne({ nombre }).populate('estacion').lean()).estacion?.codigo
        expect(await codigo('Bebidas')).toBe('barra')
        expect(await codigo('Postres')).toBe('cocina')
    })

    it('es idempotente y no pisa lo que el admin editó', async () => {
        await sembrarMenu({ directorio: dir })
        await Producto.updateOne({ codigo: 1 }, { $set: { precio: 9500, disponible: false, destacado: false } })
        await Categoria.updateOne({ nombre: 'Bebidas' }, { $set: { descripcion: 'Editada' } })

        const resumen = await sembrarMenu({ directorio: dir })
        expect(resumen).toEqual({
            categorias: { creadas: 0, existentes: 2 },
            imagenes: { creadas: 0, existentes: 2 },
            productos: { creados: 0, existentes: 2 },
        })
        expect(await Producto.countDocuments()).toBe(2)
        expect(await MenuImage.countDocuments()).toBe(2)
        expect(await Producto.findOne({ codigo: 1 }).lean()).toMatchObject({ precio: 9500, disponible: false, destacado: false })
        expect((await Categoria.findOne({ nombre: 'Bebidas' })).descripcion).toBe('Editada')
    })

    it('valida el archivo antes de escribir: precio no entero → error y nada creado', async () => {
        const menu = JSON.parse(readFileSync(join(dir, 'menu.json'), 'utf8'))
        menu.productos[1].precio = '$15.000'
        writeFileSync(join(dir, 'menu.json'), JSON.stringify(menu))
        await expect(sembrarMenu({ directorio: dir })).rejects.toThrow(/precio/i)
        expect(await Producto.countDocuments()).toBe(0)
    })

    it('valida que cada imagen exista', async () => {
        rmSync(join(dir, 'imagenes', 'waffle.png'))
        await expect(sembrarMenu({ directorio: dir })).rejects.toThrow(/waffle\.png/)
        expect(await Producto.countDocuments()).toBe(0)
    })

    it('los datos reales de seed-data son válidos (imágenes presentes, códigos únicos)', () => {
        const menu = JSON.parse(readFileSync(join(DIRECTORIO_SEED, 'menu.json'), 'utf8'))
        const codigos = menu.productos.map((p) => p.codigo)
        expect(new Set(codigos).size).toBe(codigos.length)
        for (const producto of menu.productos) {
            expect(Number.isSafeInteger(producto.precio)).toBe(true)
            expect(existsSync(join(DIRECTORIO_SEED, 'imagenes', producto.imagen))).toBe(true)
            expect(menu.categorias.map((c) => c.nombre)).toContain(producto.categoria)
        }
    })
})
