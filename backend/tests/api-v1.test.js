import { describe, it, expect, beforeEach } from 'vitest'
import { api } from './helpers/app.js'
import { crearConSesion } from './helpers/usuarios.js'
import Categoria from '../src/modulos/catalogo/categoria.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Comentario from '../src/modulos/catalogo/comentario.model.js'
import { categoriaDePrueba } from './helpers/datos.js'

let admin
let cliente
let latte
beforeEach(async () => {
    ;({ sesion: admin } = await crearConSesion('admin'))
    ;({ sesion: cliente } = await crearConSesion('cliente'))
    const bebidas = await categoriaDePrueba('Bebidas')
    latte = await Producto.create({ codigo: 1, nombre: 'Latte', precio: 9000, categoria: bebidas._id, imagen: '/productos/menu/imagenes/latte.png' })
})

describe('/api/v1', () => {
    it('los permisos se mantienen en v1 (un cliente no entra a staff ni admin)', async () => {
        expect((await cliente.get('/api/v1/staff/pedidos')).status).toBe(403)
        expect((await cliente.get('/api/v1/admin/usuarios')).status).toBe(403)
        expect((await api().get('/api/v1/cliente/pedidos')).status).toBe(401)
    })

    it('las imágenes del catálogo siguen en /api/productos/menu/imagenes (sus URL viven en los datos)', async () => {
        const res = await api().get('/api/productos/menu/imagenes/no-existe.png')
        expect(res.headers.deprecation).toBeUndefined()
    })

    it('flujo del cliente en v1: crear y cancelar un pedido', async () => {
        const metodos = await cliente.get('/api/v1/cliente/metodos-pago')
        const creado = await cliente.post('/api/v1/cliente/pedidos').send({
            items: [{ productoRef: String(latte._id), cantidad: 1 }], nombre: 'Ana Pérez', telefono: '3001234567',
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
