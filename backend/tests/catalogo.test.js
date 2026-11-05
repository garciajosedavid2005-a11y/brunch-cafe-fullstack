import { describe, it, expect, beforeEach } from 'vitest'
import { api } from './helpers/app.js'
import Categoria from '../src/models/categoria.model.js'
import Producto from '../src/models/producto.model.js'

let bebidas

beforeEach(async () => {
    bebidas = await Categoria.create({ nombre: 'Bebidas' })
    await Producto.create({ codigo: 1, nombre: 'Latte', precio: 12000, categoria: bebidas._id, imagen: '/productos/menu/imagenes/latte.png' })
})

describe('Menú público', () => {
    it('devuelve el precio como entero en COP (no como texto)', async () => {
        const res = await api().get('/api/productos/menu')
        expect(res.status).toBe(200)
        expect(res.body.productos[0].precio).toBe(12000)
    })
})
