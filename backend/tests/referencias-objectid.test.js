import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { api } from './helpers/app.js'
import { crearConSesion } from './helpers/usuarios.js'
import { entregarPedido, categoriaDePrueba } from './helpers/datos.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import DetallePedido from '../src/modulos/pedidos/detallePedido.model.js'
import Comentario from '../src/modulos/catalogo/comentario.model.js'
import { up, down } from '../src/migraciones/m06-referencias.js'

let latte
let cliente
beforeEach(async () => {
    const bebidas = await categoriaDePrueba('Bebidas')
    latte = await Producto.create({ codigo: 7, nombre: 'Latte', precio: 9000, categoria: bebidas._id })
    ;({ sesion: cliente } = await crearConSesion('cliente'))
})

const pedir = async (items) => {
    const metodos = await cliente.get('/api/v1/cliente/metodos-pago')
    return cliente.post('/api/v1/cliente/pedidos').send({
        items, nombre: 'Ana Pérez', telefono: '3001234567', direccion: 'Carrera 36B #30-06', hora: '10:00', barrio: 'Centro',
        metodoPagoId: metodos.body[0].id,
    })
}
// Desde 0.12 una reseña de producto exige un pedido entregado que lo contenga
const recibirLatte = async () => {
    const { body } = await pedir([{ productoRef: String(latte._id), cantidad: 1 }])
    await entregarPedido((await crearConSesion('admin')).sesion, body.order._id)
}
const comentar = (extra) => cliente.post('/api/v1/cliente/comentarios').send({
    tipo: 'producto', calificacion: 4, comentario: 'Muy rico y bien servido', ...extra,
})

describe('Referencias por ObjectId (0.6)', () => {
    it('el catálogo identifica cada producto por su ObjectId y conserva el código', async () => {
        const { body } = await api().get('/api/v1/catalogo')
        expect(body.productos[0]).toMatchObject({ id: String(latte._id), codigo: 7 })
    })

    it('pedido con productoRef (ObjectId): guarda la referencia y el código', async () => {
        const res = await pedir([{ productoRef: String(latte._id), cantidad: 2 }])
        expect(res.status).toBe(201)
        expect(res.body.order.total).toBe(18000)
        const detalle = await DetallePedido.findOne().lean()
        expect(String(detalle.producto)).toBe(String(latte._id))
        expect(detalle.productoId).toBe(7)
    })

    it('pedido con productoRef inválido o inexistente → 400', async () => {
        expect((await pedir([{ productoRef: 'no-es-un-id', cantidad: 1 }])).status).toBe(400)
        expect((await pedir([{ productoRef: String(new mongoose.Types.ObjectId()), cantidad: 1 }])).status).toBe(400)
    })

    it('el código numérico (productoId) ya no se acepta: solo productoRef (0.12)', async () => {
        const res = await pedir([{ productoId: 7, cantidad: 1 }])
        expect(res.status).toBe(400)
        expect(await DetallePedido.countDocuments()).toBe(0)
    })

    it('reseña de producto con productoRef: guarda la referencia; las calificaciones la incluyen', async () => {
        await recibirLatte()
        const res = await comentar({ productoRef: String(latte._id) })
        expect(res.status).toBe(201)
        const guardado = await Comentario.findOne().lean()
        expect(String(guardado.producto)).toBe(String(latte._id))
        expect(guardado.productoId).toBe(7)

        const { body } = await api().get('/api/v1/comentarios/calificaciones')
        expect(body.productRatings).toEqual([{ productoRef: String(latte._id), productoId: 7, average: 4, count: 1 }])
    })

    it('reseña con productoId numérico → 400 (solo productoRef desde 0.12)', async () => {
        await recibirLatte()
        expect((await comentar({ productoId: 7 })).status).toBe(400)
        expect(await Comentario.countDocuments()).toBe(0)
    })

    it('reseña de un producto inexistente → 400', async () => {
        expect((await comentar({ productoRef: String(new mongoose.Types.ObjectId()) })).status).toBe(400)
    })
})

describe('Migración 0.6 (referencias por ObjectId)', () => {
    const db = () => mongoose.connection.db
    // Documentos antiguos: solo el código numérico
    const sembrarAntiguos = async () => {
        const pedido = new mongoose.Types.ObjectId()
        await db().collection('detallepedidos').insertMany([
            { pedido, productoId: 7, nombreProducto: 'Latte', precioProducto: 9000, cantidad: 1, subtotal: 9000 },
            { pedido, producto: latte._id, productoId: 7, nombreProducto: 'Latte', precioProducto: 9000, cantidad: 1, subtotal: 9000 },
        ])
        await db().collection('comentarios').insertMany([
            { usuario: new mongoose.Types.ObjectId(), tipo: 'producto', productoId: 7, calificacion: 5, comentario: 'Excelente latte de verdad' },
            { usuario: new mongoose.Types.ObjectId(), tipo: 'general', calificacion: 5, comentario: 'Lugar muy agradable' },
        ])
    }

    it('--dry-run informa lo que haría sin escribir', async () => {
        await sembrarAntiguos()
        const plan = await up(db(), { dryRun: true })
        expect(plan).toMatchObject({ puedeAplicar: true, aplicado: false })
        expect(plan.detallepedidos).toMatchObject({ completar: 1, yaTenian: 1, sinProducto: [] })
        expect(plan.comentarios).toMatchObject({ completar: 1, yaTenian: 0, sinProducto: [] })
        expect(await db().collection('detallepedidos').countDocuments({ producto: { $exists: true } })).toBe(1)
    })

    it('up completa las referencias (marcadas), es idempotente; down solo quita las que puso', async () => {
        await sembrarAntiguos()
        const aplicado = await up(db())
        expect(aplicado.aplicado).toBe(true)
        expect(await db().collection('detallepedidos').countDocuments({ producto: latte._id })).toBe(2)
        expect(await db().collection('comentarios').countDocuments({ producto: latte._id })).toBe(1)

        expect((await up(db(), { dryRun: true })).detallepedidos.completar).toBe(0)

        const revertido = await down(db())
        expect(revertido).toMatchObject({ aplicado: true, detallepedidos: 1, comentarios: 1 })
        // La línea que ya tenía referencia la conserva; las migradas vuelven a su estado original
        expect(await db().collection('detallepedidos').countDocuments({ producto: { $exists: true } })).toBe(1)
        expect(await db().collection('comentarios').countDocuments({ producto: { $exists: true } })).toBe(0)
        expect(await db().collection('detallepedidos').countDocuments({ _migracion06: { $exists: true } })).toBe(0)
    })

    it('si un código no tiene producto, no adivina: no escribe nada y lo lista', async () => {
        await sembrarAntiguos()
        await db().collection('detallepedidos').insertOne({ pedido: new mongoose.Types.ObjectId(), productoId: 99, nombreProducto: 'Borrado', precioProducto: 1, cantidad: 1, subtotal: 1 })
        const res = await up(db())
        expect(res).toMatchObject({ puedeAplicar: false, aplicado: false })
        expect(res.detallepedidos.sinProducto).toEqual([{ productoId: 99, documentos: 1, nombre: 'Borrado' }])
        expect(await db().collection('detallepedidos').countDocuments({ _migracion06: { $exists: true } })).toBe(0)
    })
})
