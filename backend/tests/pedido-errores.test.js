// 1.14 · POST /api/v1/cliente/pedidos con el formato de errores de las cuentas: { error: { code, message, details } }
// con VALIDATION_ERROR y details [{ campo, mensaje }] (ruta completa, también la anidada), los mismos códigos
// que las cuentas para producto inexistente o agotado, y `details.lineas` (índices del carrito) en todo
// error que dependa de una línea, para que el carrito la marque.
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba } from './helpers/datos.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import GrupoModificadores from '../src/modulos/catalogo/grupoModificadores.model.js'
import Pedido from '../src/modulos/pedidos/pedido.model.js'
import { MENSAJE_DIRECCION } from '../src/modulos/compartido/direccion.js'

let cliente
let jugo
let huevos
let agotado
let termino
let metodoPagoId

beforeEach(async () => {
    ;({ sesion: cliente } = await crearConSesion('cliente'))
    const categoria = await categoriaDePrueba('Desayunos')
    termino = await GrupoModificadores.create({ nombre: 'Término', obligatorio: true, min: 1, max: 1, opciones: [{ nombre: 'Fritos' }] })
    jugo = await Producto.create({ codigo: 601, nombre: 'Jugo', precio: 7000, categoria: categoria._id })
    huevos = await Producto.create({ codigo: 602, nombre: 'Huevos', precio: 15000, categoria: categoria._id, gruposModificadores: [termino._id] })
    agotado = await Producto.create({ codigo: 603, nombre: 'Pan', precio: 3000, categoria: categoria._id, disponible: false })
    metodoPagoId = (await cliente.get('/api/v1/cliente/metodos-pago')).body[0].id
})

const pedir = (items, extra = {}) => cliente.post('/api/v1/cliente/pedidos').send({
    items, nombre: 'Ana Pérez', telefono: '3001234567', direccion: 'Cra 36b Oriente #30-06', hora: '10:00', barrio: 'Centro', metodoPagoId, ...extra,
})
const linea = (producto, extra = {}) => ({ productoRef: String(producto._id), cantidad: 1, ...extra })

describe('Errores del pedido con el formato de las cuentas (1.14)', () => {
    it('validación → 400 VALIDATION_ERROR, mensaje del primer campo y details [{ campo, mensaje }]', async () => {
        const res = await pedir([linea(jugo)], { direccion: 'Barrio Centro' })
        expect(res.status).toBe(400)
        expect(res.body.error).toEqual({
            code: 'VALIDATION_ERROR', message: MENSAJE_DIRECCION, details: [{ campo: 'direccion', mensaje: MENSAJE_DIRECCION }],
        })
    })

    it('la ruta anidada de una línea llega completa (items.N.campo)', async () => {
        const res = await pedir([linea(jugo), linea(jugo, { nota: 'x'.repeat(141) })])
        expect(res.body.error.code).toBe('VALIDATION_ERROR')
        expect(res.body.error.details).toEqual([{ campo: 'items.1.nota', mensaje: 'La nota no puede superar 140 caracteres' }])
    })

    it('un producto inexistente → 404 PRODUCTO_NO_ENCONTRADO con las líneas', async () => {
        const res = await pedir([linea(jugo), { productoRef: String(new mongoose.Types.ObjectId()), cantidad: 1 }])
        expect(res.status).toBe(404)
        expect(res.body.error).toMatchObject({ code: 'PRODUCTO_NO_ENCONTRADO', details: { lineas: [1] } })
    })

    it('un producto agotado → 409 PRODUCT_UNAVAILABLE (como las cuentas) con códigos y líneas', async () => {
        const res = await pedir([linea(agotado), linea(jugo), linea(agotado, { nota: 'tostado' })])
        expect(res.status).toBe(409)
        expect(res.body.error).toMatchObject({ code: 'PRODUCT_UNAVAILABLE', details: { productos: [603], lineas: [0, 2] } })
    })

    it('una opción inválida lleva también details.lineas', async () => {
        const res = await pedir([linea(jugo), linea(huevos)])
        expect(res.status).toBe(400)
        expect(res.body.error).toMatchObject({ code: 'MODIFICADOR_REQUERIDO', details: { linea: 1, lineas: [1], producto: 'Huevos' } })
    })

    it('un método de pago inactivo → 400 METODO_PAGO_NO_DISPONIBLE', async () => {
        const res = await pedir([linea(jugo)], { metodoPagoId: String(new mongoose.Types.ObjectId()) })
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('METODO_PAGO_NO_DISPONIBLE')
        expect(await Pedido.countDocuments()).toBe(0)
    })
})
