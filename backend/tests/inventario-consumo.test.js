// Fase 5 · 5.3 · Descuento al enviar la ronda o confirmar el domicilio, devolución al anular o cancelar (F5-3),
// movimientos manuales (F5-4) y agotado automático con reactivación (F5-7).
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba } from './helpers/datos.js'
import Insumo from '../src/modulos/inventario/insumo.model.js'
import Receta from '../src/modulos/inventario/receta.model.js'
import MovimientoInventario from '../src/modulos/inventario/movimiento.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Pedido from '../src/modulos/pedidos/pedido.model.js'
import DetallePedido from '../src/modulos/pedidos/detallePedido.model.js'
import MetodoPago from '../src/modulos/pedidos/metodoPago.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { abrirCuenta, agregarItem, enviarRonda, anularItem } from '../src/modulos/salon/cuentas.service.js'
import { estadoPorCodigo } from '../src/modulos/compartido/estados.service.js'
import { marcarProducto } from '../src/modulos/catalogo/agotados.service.js'
import { conTransaccion } from '../src/modulos/compartido/transacciones.js'
import { PERMISOS_SALON } from '../src/modulos/identidad/permisos.js'

const { ObjectId } = mongoose.Types
const mesero = { id: String(new ObjectId()), rol: 'mesero', permisos: PERMISOS_SALON.mesero }
const admin = { id: String(new ObjectId()), rol: 'admin', permisos: ['*'] }
let huevos, huevo, pan, zona

beforeEach(async () => {
    const platos = await categoriaDePrueba('Desayunos')
    huevos = await Producto.create({ codigo: 1, nombre: 'Huevos pericos', precio: 15000, categoria: platos._id })
    zona = await Zona.create({ nombre: 'Interior' })
    ;[huevo, pan] = await Insumo.create([
        { nombre: 'Huevo', unidad: 'unidad', existencia: 10, costoPromedio: 600 },
        { nombre: 'Pan', unidad: 'unidad', existencia: 10, costoPromedio: 1200 },
    ])
    await Receta.create({ tipo: 'producto', producto: huevos._id, lineas: [{ insumo: huevo._id, cantidad: 2 }, { insumo: pan._id, cantidad: 1 }] })
    await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes(), MovimientoInventario.createIndexes()])
})

const existencia = async (insumo) => (await Insumo.findById(insumo._id).lean()).existencia
const version = async (id) => (await Cuenta.findById(id).lean()).version

/** Cuenta con `cantidad` × Huevos en la ronda 1 enviada. */
const rondaEnviada = async (cantidad, numero = 1) => {
    const mesa = await Mesa.create({ numero, zona: zona._id, capacidad: 4 })
    const cuenta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, mesero)
    await agregarItem(cuenta.id, { productoId: String(huevos._id), cantidad }, mesero)
    await enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: await version(cuenta.id) }, mesero)
    return cuenta
}

describe('5.3 · Salón: descuento al enviar, devolución al anular', () => {
    it('enviar la ronda descuenta en la misma transacción, con movimiento por insumo y Evento en la cuenta', async () => {
        const cuenta = await rondaEnviada(2)
        expect(await existencia(huevo)).toBe(6)
        expect(await existencia(pan)).toBe(8)
        const movs = await MovimientoInventario.find({ tipo: 'consumo' }).lean()
        expect(movs).toHaveLength(2)
        expect(movs[0]).toMatchObject({ referencia: { tipo: 'item' }, motivo: 'ronda 1 enviada', actor: 'mesero' })
        expect(await Evento.exists({ entidad: 'cuenta', entidadId: cuenta.id, tipo: 'inventario_descontado' })).toBeTruthy()
    })

    it('anular el ítem devuelve lo consumido una sola vez', async () => {
        const cuenta = await rondaEnviada(2)
        const comanda = await Comanda.findOne({ cuenta: cuenta.id }).lean()
        await anularItem(cuenta.id, String(comanda.items[0]._id), { motivo: 'error_toma', versionEsperada: await version(cuenta.id) }, admin)
        expect(await existencia(huevo)).toBe(10)
        expect(await existencia(pan)).toBe(10)
        expect(await MovimientoInventario.countDocuments({ tipo: 'devolucion' })).toBe(2)
        expect(await Evento.exists({ tipo: 'inventario_devuelto' })).toBeTruthy()
    })

    it('si un insumo no alcanza, el envío NO se bloquea: la existencia queda negativa y el producto se agota solo', async () => {
        await rondaEnviada(6) // 12 huevos con 10 en existencia
        expect(await existencia(huevo)).toBe(-2)
        const producto = await Producto.findById(huevos._id).lean()
        expect(producto).toMatchObject({ disponible: false, agotadoAuto: true })
        const evento = await Evento.findOne({ entidad: 'producto', tipo: 'producto_agotado' }).lean()
        expect(evento).toMatchObject({ actor: 'sistema', motivo: 'sin Huevo' })
    })
})

describe('5.3 · Agotado automático y reactivación', () => {
    it('al entrar stock se reactiva solo lo que agotó el sistema; lo agotado a mano sigue agotado', async () => {
        const { sesion } = await crearConSesion('compras')
        await rondaEnviada(5) // deja 0 huevos: agotado por el sistema
        expect((await Producto.findById(huevos._id).lean()).disponible).toBe(false)
        const r = await sesion.post('/api/v1/inventario/movimientos').send({ insumoId: String(huevo._id), tipo: 'ajuste', cantidad: 30, motivo: 'llegó un pedido sin orden' })
        expect(r.status, JSON.stringify(r.body)).toBe(201)
        expect(await Producto.findById(huevos._id).lean()).toMatchObject({ disponible: true, agotadoAuto: false })
        expect(await Evento.exists({ entidad: 'producto', tipo: 'producto_reactivado', actor: 'sistema' })).toBeTruthy()

        // Agotado a mano: un ajuste positivo no lo reactiva
        await conTransaccion((session) => marcarProducto(huevos._id, false, admin, session))
        await sesion.post('/api/v1/inventario/movimientos').send({ insumoId: String(huevo._id), tipo: 'ajuste', cantidad: 5, motivo: 'conteo' })
        expect(await Producto.findById(huevos._id).lean()).toMatchObject({ disponible: false, agotadoAuto: false })
    })
})

describe('5.3 · Domicilio: descuento al confirmar, devolución al cancelar', () => {
    const pedidoPendiente = async () => {
        const { usuario } = await crearConSesion('cliente')
        const metodo = await MetodoPago.findOne()
        const pedido = await Pedido.create({
            usuario: usuario._id, estado: (await estadoPorCodigo('pedido', 'pendiente'))._id, metodoPago: metodo._id, total: 30000,
            nombreEntrega: 'Cliente', direccion: 'Carrera 36B #30-06', barrio: 'Centro', horaEntrega: '10:00',
        })
        await DetallePedido.create({ pedido: pedido._id, producto: huevos._id, productoId: 1, nombreProducto: 'Huevos pericos', precioProducto: 15000, precioUnitario: 15000, cantidad: 2, subtotal: 30000 })
        return pedido
    }

    it('confirmar descuenta y cancelar devuelve; cancelar un pendiente no mueve nada', async () => {
        const { sesion } = await crearConSesion('admin')
        const pedido = await pedidoPendiente()
        const confirmado = await sesion.patch(`/api/v1/staff/pedidos/${pedido._id}/estado`).send({ codigo: 'confirmado' })
        expect(confirmado.status, JSON.stringify(confirmado.body)).toBe(200)
        expect(await existencia(huevo)).toBe(6)
        expect(await Evento.exists({ entidad: 'pedido', tipo: 'inventario_descontado' })).toBeTruthy()

        const cancelado = await sesion.patch(`/api/v1/staff/pedidos/${pedido._id}/cancelar`).send({ motivo: 'cliente no contesta' })
        expect(cancelado.status, JSON.stringify(cancelado.body)).toBe(200)
        expect(await existencia(huevo)).toBe(10)

        const otro = await pedidoPendiente()
        await sesion.patch(`/api/v1/staff/pedidos/${otro._id}/cancelar`).send({ motivo: 'duplicado' })
        expect(await MovimientoInventario.countDocuments({ 'referencia.id': otro._id })).toBe(0)
    })
})

describe('5.3 · Movimientos manuales', () => {
    it('exigen motivo e inventario:ajustar; merma y vencimiento restan', async () => {
        const { sesion } = await crearConSesion('compras')
        const post = (datos) => sesion.post('/api/v1/inventario/movimientos').send({ insumoId: String(pan._id), ...datos })
        expect((await post({ tipo: 'merma', cantidad: 2 })).body.error.code).toBe('VALIDATION_ERROR')
        expect((await post({ tipo: 'merma', cantidad: -2, motivo: 'se quemó' })).body.error.code).toBe('VALIDATION_ERROR')
        expect((await post({ tipo: 'consumo', cantidad: 2, motivo: 'x x x' })).body.error.code).toBe('VALIDATION_ERROR')
        const merma = await post({ tipo: 'merma', cantidad: 2, motivo: 'se quemó' })
        expect(merma.status).toBe(201)
        expect(merma.body).toMatchObject({ cantidad: -2, existencia: 8 })
        expect((await post({ tipo: 'vencimiento', cantidad: 1, motivo: 'pan del martes' })).body.existencia).toBe(7)
        expect(await Evento.countDocuments({ entidad: 'insumo', tipo: 'inventario_ajustado' })).toBe(2)

        const { sesion: m } = await crearConSesion('mesero')
        expect((await m.post('/api/v1/inventario/movimientos').send({ insumoId: String(pan._id), tipo: 'ajuste', cantidad: 1, motivo: 'conteo' })).status).toBe(403)
    })
})
