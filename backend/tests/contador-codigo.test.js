import { describe, it, expect, beforeEach } from 'vitest'
import Categoria from '../src/modulos/catalogo/categoria.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import { crearConSesion } from './helpers/usuarios.js'

let categoriaId
let sesion
beforeEach(async () => {
    await Producto.init() // índice único de codigo creado antes de las pruebas
    categoriaId = String((await Categoria.create({ nombre: 'Bebidas' }))._id)
    await Producto.create({ codigo: 1, nombre: 'Latte', precio: 9000, categoria: categoriaId })
    ;({ sesion } = await crearConSesion('admin'))
})

const crear = (nombre) => sesion.post('/api/productos').send({ nombre, precio: 10000, categoriaId })

describe('Código de producto con contador atómico (colección counters)', () => {
    it('10 altas simultáneas reciben códigos únicos y consecutivos', async () => {
        const respuestas = await Promise.all(Array.from({ length: 10 }, (_, i) => crear(`Producto ${i}`)))
        expect(respuestas.map((r) => r.status)).toEqual(Array(10).fill(201))
        const codigos = respuestas.map((r) => r.body.codigo).sort((a, b) => a - b)
        expect(codigos).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    })

    it('respeta los códigos que el seed insertó directamente', async () => {
        expect((await crear('Mocca')).body.codigo).toBe(2)
        await Producto.create({ codigo: 50, nombre: 'Del seed', precio: 1000, categoria: categoriaId })
        expect((await crear('Chai')).body.codigo).toBe(51)
    })

    it('no reutiliza el código de un producto borrado', async () => {
        const creado = await crear('Mocca')
        await sesion.delete(`/api/productos/${creado.body.id}`)
        expect((await crear('Chai')).body.codigo).toBe(3)
    })
})
