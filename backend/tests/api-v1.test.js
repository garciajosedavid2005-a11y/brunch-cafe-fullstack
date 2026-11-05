import { describe, it, expect, beforeEach } from 'vitest'
import { api } from './helpers/app.js'
import { crearConSesion } from './helpers/usuarios.js'
import Categoria from '../src/models/categoria.model.js'
import Producto from '../src/models/producto.model.js'
import Comentario from '../src/models/comentario.model.js'

let admin
let cliente
let latte
beforeEach(async () => {
    ;({ sesion: admin } = await crearConSesion('admin'))
    ;({ sesion: cliente } = await crearConSesion('cliente'))
    const bebidas = await Categoria.create({ nombre: 'Bebidas' })
    latte = await Producto.create({ codigo: 1, nombre: 'Latte', precio: 9000, categoria: bebidas._id, imagen: '/productos/menu/imagenes/latte.png' })
})

// [quién, ruta v1, ruta anterior]
const EQUIVALENTES = [
    ['anonimo', '/api/v1/comentarios', '/api/comentarios'],
    ['anonimo', '/api/v1/comentarios/calificaciones', '/api/comentarios/product-ratings'],
    ['anonimo', '/api/v1/catalogo', '/api/productos/menu'],
    ['cliente', '/api/v1/auth/me', '/api/auth/me'],
    ['cliente', '/api/v1/cliente/pedidos', '/api/customer/orders'],
    ['cliente', '/api/v1/cliente/metodos-pago', '/api/customer/payment-methods'],
    ['cliente', '/api/v1/cliente/comentarios', '/api/customer/comentarios'],
    ['admin', '/api/v1/staff/pedidos', '/api/pedidos'],
    ['admin', '/api/v1/staff/reservas', '/api/reservas'],
    ['admin', '/api/v1/admin/categorias', '/api/categorias'],
    ['admin', '/api/v1/admin/productos', '/api/productos'],
    ['admin', '/api/v1/admin/estados', '/api/estados'],
    ['admin', '/api/v1/admin/roles', '/api/roles'],
    ['admin', '/api/v1/admin/permisos', '/api/permisos'],
    ['admin', '/api/v1/admin/metodos-pago', '/api/metodos-pago'],
    ['admin', '/api/v1/admin/usuarios', '/api/admin/usuarios'],
    ['admin', '/api/v1/admin/comentarios', '/api/comentarios/admin'],
]

const agente = (quien) => ({ admin, cliente, anonimo: api() }[quien])

describe('/api/v1: misma respuesta que las rutas anteriores, que quedan como alias deprecados', () => {
    it.each(EQUIVALENTES)('%s: %s ≡ %s', async (quien, v1, anterior) => {
        const nueva = await agente(quien).get(v1)
        const vieja = await (quien === 'anonimo' ? api() : agente(quien)).get(anterior)
        expect(nueva.status).toBe(200)
        expect(vieja.status).toBe(200)
        expect(vieja.body).toEqual(nueva.body)
        expect(nueva.headers.deprecation).toBeUndefined()
        expect(vieja.headers.deprecation).toBe('true')
        expect(vieja.headers.link).toBe(`<${v1}>; rel="successor-version"`)
    })

    it('los permisos se mantienen en v1 (un cliente no entra a staff ni admin)', async () => {
        expect((await cliente.get('/api/v1/staff/pedidos')).status).toBe(403)
        expect((await cliente.get('/api/v1/admin/usuarios')).status).toBe(403)
        expect((await api().get('/api/v1/cliente/pedidos')).status).toBe(401)
    })

    it('las imágenes del catálogo no están deprecadas (sus URL viven en los datos)', async () => {
        const res = await api().get('/api/productos/menu/imagenes/no-existe.png')
        expect(res.headers.deprecation).toBeUndefined()
    })

    it('flujo del cliente en v1: crear y cancelar un pedido', async () => {
        const metodos = await cliente.get('/api/v1/cliente/metodos-pago')
        const creado = await cliente.post('/api/v1/cliente/pedidos').send({
            items: [{ productoRef: String(latte._id), cantidad: 1 }], nombre: 'Ana Pérez',
            direccion: 'Carrera 36B #30-06', hora: '10:00', barrio: 'Centro', metodoPagoId: metodos.body[0].id,
        })
        expect(creado.status).toBe(201)
        const id = creado.body.order._id
        expect((await cliente.get(`/api/v1/cliente/pedidos/${id}`)).body.order._id).toBe(id)
        const cancelado = await cliente.patch(`/api/v1/cliente/pedidos/${id}/cancelar`).send({ motivo: 'Me equivoqué' })
        expect(cancelado.status).toBe(200)
        expect(cancelado.body.order.status).toBe('cancelled')
    })

    it('moderación de comentarios en v1', async () => {
        const { usuario } = await crearConSesion('cliente')
        const comentario = await Comentario.create({ usuario: usuario._id, tipo: 'general', calificacion: 5, comentario: 'Excelente atención siempre' })
        const oculto = await admin.patch(`/api/v1/admin/comentarios/${comentario._id}/visibilidad`).send({ visible: false })
        expect(oculto.body).toMatchObject({ visible: false })
        expect((await admin.delete(`/api/v1/admin/comentarios/${comentario._id}`)).status).toBe(200)
    })

    it('CRUD de productos en v1', async () => {
        const categoriaId = String((await Categoria.findOne())._id)
        const creado = await admin.post('/api/v1/admin/productos').send({ nombre: 'Mocca', precio: 11000, categoriaId })
        expect(creado.status).toBe(201)
        expect((await admin.put(`/api/v1/admin/productos/${creado.body.id}`).send({ disponible: false })).body.disponible).toBe(false)
        expect((await admin.delete(`/api/v1/admin/productos/${creado.body.id}`)).status).toBe(200)
    })
})
