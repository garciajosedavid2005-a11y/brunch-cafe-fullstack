import { describe, it, expect, beforeEach } from 'vitest'
import { api } from './helpers/app.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import MenuImage from '../src/modulos/catalogo/menuImage.model.js'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba } from './helpers/datos.js'

// PNG de 1×1 px
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let bebidas

beforeEach(async () => {
    bebidas = await categoriaDePrueba('Bebidas')
    await Producto.create({ codigo: 1, nombre: 'Latte', precio: 12000, categoria: bebidas._id, imagen: '/productos/menu/imagenes/latte.png' })
})

describe('Menú público', () => {
    it('devuelve el precio como entero en COP (no como texto)', async () => {
        const res = await api().get('/api/v1/catalogo')
        expect(res.status).toBe(200)
        expect(res.body.productos[0].precio).toBe(12000)
    })
})

describe('GET /api/v1/catalogo', () => {
    it('devuelve categorías y productos con precio entero e imagen como URL', async () => {
        const res = await api().get('/api/v1/catalogo')
        expect(res.status).toBe(200)
        expect(res.body.categorias).toEqual(['Bebidas'])
        expect(res.body.productos).toEqual([{
            id: expect.stringMatching(/^[0-9a-f]{24}$/), codigo: 1, nombre: 'Latte', precio: 12000, categoria: 'Bebidas',
            descripcion: '', imagen: '/productos/menu/imagenes/latte.png', destacado: false,
        }])
    })

    it('nunca envía base64: una imagen incrustada antigua sale vacía', async () => {
        await Producto.create({ codigo: 2, nombre: 'Waffle', precio: 15000, categoria: bebidas._id, imagen: `data:image/png;base64,${PNG}` })
        const res = await api().get('/api/v1/catalogo')
        const waffle = res.body.productos.find((p) => p.codigo === 2)
        expect(waffle.imagen).toBe('')
        expect(JSON.stringify(res.body)).not.toContain('base64')
    })

})

describe('Imágenes subidas desde el admin', () => {
    it('se guardan aparte y el producto queda con una URL que sirve la imagen', async () => {
        const { sesion } = await crearConSesion('admin')
        const res = await sesion.post('/api/v1/admin/productos').send({
            nombre: 'Mocca', precio: 11000, categoriaId: String(bebidas._id), imagen: `data:image/png;base64,${PNG}`,
        })
        expect(res.status).toBe(201)
        expect(res.body.imagen).toMatch(/^\/productos\/menu\/imagenes\/producto-\d+-[\w-]+\.png$/)
        expect((await Producto.findById(res.body.id).lean()).imagen).toBe(res.body.imagen)

        const imagen = await api().get(`/api${res.body.imagen}`)
        expect(imagen.status).toBe(200)
        expect(imagen.headers['content-type']).toBe('image/png')
        expect(Buffer.compare(imagen.body, Buffer.from(PNG, 'base64'))).toBe(0)
    })

    it('al reemplazar o borrar, elimina la imagen subida anterior (no las del seed)', async () => {
        const { sesion } = await crearConSesion('admin')
        const creado = await sesion.post('/api/v1/admin/productos').send({
            nombre: 'Mocca', precio: 11000, categoriaId: String(bebidas._id), imagen: `data:image/png;base64,${PNG}`,
        })
        const editado = await sesion.put(`/api/v1/admin/productos/${creado.body.id}`).send({ imagen: `data:image/png;base64,${PNG}` })
        expect(editado.status).toBe(200)
        expect(editado.body.imagen).not.toBe(creado.body.imagen)
        const nombre = (url) => decodeURIComponent(url.split('/').pop())
        expect(await MenuImage.exists({ nombre: nombre(creado.body.imagen) })).toBeNull()

        await sesion.delete(`/api/v1/admin/productos/${creado.body.id}`)
        expect(await MenuImage.exists({ nombre: nombre(editado.body.imagen) })).toBeNull()

        // El producto del seed conserva su imagen al quitarle la imagen
        await MenuImage.create({ nombre: 'latte.png', contentType: 'image/png', data: Buffer.from(PNG, 'base64') })
        const latte = await Producto.findOne({ codigo: 1 })
        await sesion.put(`/api/v1/admin/productos/${latte._id}`).send({ imagen: '' })
        expect(await MenuImage.exists({ nombre: 'latte.png' })).not.toBeNull()
    })

    it('rechaza imágenes que no son una URL del menú ni una imagen incrustada', async () => {
        const { sesion } = await crearConSesion('admin')
        const res = await sesion.post('/api/v1/admin/productos').send({
            nombre: 'Mocca', precio: 11000, categoriaId: String(bebidas._id), imagen: 'javascript:alert(1)',
        })
        expect(res.status).toBe(400)
    })
})

describe('Productos no disponibles (agotados)', () => {
    beforeEach(async () => {
        await Producto.create({ codigo: 2, nombre: 'Waffle', precio: 15000, categoria: bebidas._id, disponible: false })
    })

    it('un producto nuevo está disponible por defecto', async () => {
        expect((await Producto.findOne({ codigo: 1 })).disponible).toBe(true)
    })

    it('no salen en el catálogo', async () => {
        const res = await api().get('/api/v1/catalogo')
        expect(res.body.productos.map((p) => p.codigo)).toEqual([1])
    })

    it('el admin los ve y puede cambiar la disponibilidad', async () => {
        const { sesion } = await crearConSesion('admin')
        const lista = await sesion.get('/api/v1/admin/productos')
        const waffle = lista.body.find((p) => p.codigo === 2)
        expect(waffle.disponible).toBe(false)
        expect(lista.body.find((p) => p.codigo === 1).disponible).toBe(true)

        const res = await sesion.put(`/api/v1/admin/productos/${waffle.id}`).send({ disponible: true })
        expect(res.status).toBe(200)
        expect(res.body.disponible).toBe(true)
        expect((await api().get('/api/v1/catalogo')).body.productos).toHaveLength(2)
    })

    it('no se pueden pedir: el backend rechaza el pedido y dice cuál', async () => {
        const { sesion } = await crearConSesion('cliente')
        const metodos = await sesion.get('/api/v1/cliente/metodos-pago')
        const res = await sesion.post('/api/v1/cliente/pedidos').send({
            items: await Promise.all([1, 2].map(async (codigo) => ({ productoRef: String((await Producto.findOne({ codigo }))._id), cantidad: 1 }))),
            nombre: 'Ana Pérez', telefono: '3001234567', direccion: 'Carrera 36B #30-06', hora: '10:00', barrio: 'Centro',
            metodoPagoId: metodos.body[0].id,
        })
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('PRODUCT_UNAVAILABLE')
        expect(res.body.error.message).toContain('Waffle')
        // 1.14 · Además, qué líneas del carrito marcar
        expect(res.body.error.details).toEqual({ productos: [2], lineas: [1] })
    })
})

describe('Validación de producto (N3) e imágenes', () => {
    const datos = (extra) => ({ nombre: 'Mocca', precio: 11000, categoriaId: String(bebidas._id), ...extra })
    // Imagen PNG incrustada de `bytes` bytes (cabecera PNG + relleno)
    const pngDe = (bytes) => `data:image/png;base64,${Buffer.alloc(bytes, 1).toString('base64')}`

    it('precio: entero ≥ 0 (acepta "12000" como número; rechaza decimales y negativos)', async () => {
        const { sesion } = await crearConSesion('admin')
        expect((await sesion.post('/api/v1/admin/productos').send(datos({ precio: '12000' }))).body.precio).toBe(12000)
        for (const precio of [12000.5, -1, 'doce mil']) {
            const res = await sesion.post('/api/v1/admin/productos').send(datos({ nombre: `P ${precio}`, precio }))
            expect(res.status, `precio ${precio}`).toBe(400)
            expect(res.body.error.code).toBe('VALIDATION_ERROR')
        }
    })

    it('imagen de hasta 2 MB se acepta; más de 2 MB → 400 con mensaje claro', async () => {
        const { sesion } = await crearConSesion('admin')
        const ok = await sesion.post('/api/v1/admin/productos').send(datos({ imagen: pngDe(2 * 1024 * 1024) }))
        expect(ok.status).toBe(201)

        const grande = await sesion.post('/api/v1/admin/productos').send(datos({ nombre: 'Grande', imagen: pngDe(2 * 1024 * 1024 + 1) }))
        expect(grande.status).toBe(400)
        expect(grande.body.error.message).toBe('La imagen no puede superar 2 MB.')
    })

    it('cuerpo de más de 3 MB → 413 con un mensaje que menciona el límite de la imagen', async () => {
        const { sesion } = await crearConSesion('admin')
        const res = await sesion.post('/api/v1/admin/productos').send(datos({ imagen: pngDe(2.5 * 1024 * 1024) }))
        expect(res.status).toBe(413)
        expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE')
        expect(res.body.error.message).toMatch(/2 MB/)
    })
})

describe('Borrar una categoría (1.3b)', () => {
    it('con productos → 409 CATEGORIA_EN_USO con cuántos (como estaciones y grupos); sin productos se borra', async () => {
        const { sesion } = await crearConSesion('admin')
        const res = await sesion.delete(`/api/v1/admin/categorias/${bebidas._id}`)
        expect(res.status).toBe(409)
        expect(res.body.error).toMatchObject({ code: 'CATEGORIA_EN_USO', details: { productos: 1 } })
        expect(res.body.error.message).toMatch(/1 producto/)

        const vacia = await categoriaDePrueba('Postres')
        expect((await sesion.delete(`/api/v1/admin/categorias/${vacia._id}`)).status).toBe(200)
    })
})
