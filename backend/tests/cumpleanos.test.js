// 6.7 (F6-6, F6-7, F6-d) · Cumpleaños: 10 % del consumo (hacia abajo) en UNA compra durante el mes de cumpleaños
// (Bogotá), un uso vigente por usuario y año; en la caja (cobro completo, antes del canje de puntos) y en el carrito del
// domicilio. Se libera si se cancela el domicilio o se anula el comprobante. Los descuentos quedan en el comprobante
// (total = subtotal − descuentos + propina) y en los reportes por tipo.
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba, crearPedido, entregarPedido } from './helpers/datos.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Comprobante from '../src/modulos/caja/comprobante.model.js'
import Pedido from '../src/modulos/pedidos/pedido.model.js'
import Usuario from '../src/modulos/identidad/usuario.model.js'
import MovimientoPuntos from '../src/modulos/fidelizacion/movimientoPuntos.model.js'
import UsoCumpleanos from '../src/modulos/fidelizacion/usoCumpleanos.model.js'
import { abrirTurno } from '../src/modulos/caja/turno.service.js'
import { fechaLocal } from '../src/modulos/compartido/fechas.js'
import { estadoCumpleanos } from '../src/modulos/fidelizacion/cumpleanos.service.js'

const { ObjectId } = mongoose.Types
const SALON = '/api/v1/staff/salon'
const CAJA = '/api/v1/staff/caja'
const admin = { id: String(new ObjectId()), rol: 'admin', permisos: ['*'] }

// Nacimiento el día 1 del mes de hoy (Bogotá, con la fecha fija de las pruebas) o del mes siguiente
const nacido = (mes) => new Date(`1990-${mes}-01T00:00:00.000Z`)

let huevos, cajero, cliente, clienteSesion, hoy, mesDeHoy, otroMes
beforeEach(async () => {
    hoy = fechaLocal()
    mesDeHoy = hoy.slice(5, 7)
    otroMes = String((Number(mesDeHoy) % 12) + 1).padStart(2, '0')
    huevos = await Producto.create({ codigo: 1, nombre: 'Huevos pericos', precio: 15000, categoria: (await categoriaDePrueba('Desayunos'))._id })
    await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Comprobante.createIndexes(), MovimientoPuntos.createIndexes(), UsoCumpleanos.createIndexes()])
    await abrirTurno({ base: 0 }, admin)
    ;({ sesion: cajero } = await crearConSesion('cajero'))
    ;({ usuario: cliente, sesion: clienteSesion } = await crearConSesion('cliente'))
    await Usuario.updateOne({ _id: cliente._id }, { $set: { fechaNacimiento: nacido(mesDeHoy) } })
})

const version = async (id) => (await Cuenta.findById(id).lean()).version
const saldo = async () => (await Usuario.findById(cliente._id).lean()).puntos

/** Para llevar de 2 × huevos ($30.000) en caja, del cliente de prueba. */
const cuentaEnCaja = async () => {
    const { id } = (await cajero.post(`${SALON}/para-llevar`).send({ nombre: 'Ana' })).body
    expect((await cajero.put(`${SALON}/cuentas/${id}/cliente`).send({ clienteId: String(cliente._id) })).status).toBe(200)
    await cajero.post(`${SALON}/cuentas/${id}/items`).send({ productoId: String(huevos._id), cantidad: 2 })
    await cajero.post(`${SALON}/cuentas/${id}/rondas/1/enviar`).send({ versionEsperada: await version(id) })
    await cajero.post(`${SALON}/cuentas/${id}/solicitar`).send({ versionEsperada: await version(id) })
    return id
}
const cobrar = async (id, { propina = 0, total, ...extra }) => cajero.post(`${CAJA}/cuentas/${id}/cobrar`).send({
    versionEsperada: await version(id), propina, pagos: [{ metodo: 'tarjeta', monto: total }], ...extra,
})

describe('6.7 · Cumpleaños en la caja', () => {
    it('el detalle de cobro dice si el cliente tiene el descuento disponible', async () => {
        const id = await cuentaEnCaja()
        const r = await cajero.get(`${CAJA}/cuentas/${id}`)
        expect(r.body.cumpleanosCliente).toEqual({ disponible: true, porcentaje: 10, monto: 3000 })
    })

    it('10 % del consumo, sin tocar la propina; gana puntos sobre lo pagado; queda un uso vigente del año', async () => {
        const id = await cuentaEnCaja()
        const r = await cobrar(id, { propina: 3000, total: 30000, aplicarCumpleanos: true })
        expect(r.status, JSON.stringify(r.body)).toBe(201)
        expect(r.body.comprobante).toMatchObject({
            subtotal: 30000, descuentos: [{ tipo: 'cumpleanos', monto: 3000 }], propina: 3000, total: 30000, puntos: { ganados: 27 },
        })
        expect(await saldo()).toBe(27)
        const usos = await UsoCumpleanos.find({ usuario: cliente._id }).lean()
        expect(usos).toHaveLength(1)
        expect(usos[0]).toMatchObject({ anio: Number(hoy.slice(0, 4)), vigente: true, monto: 3000, referencia: { modelo: 'Comprobante', codigo: r.body.comprobante.codigo } })
        expect((await cajero.get(`${CAJA}/cuentas/${await cuentaEnCaja()}`)).body.cumpleanosCliente).toMatchObject({ disponible: false })
    })

    it('se aplica antes del canje: el canje no supera lo que queda del consumo', async () => {
        await Usuario.updateOne({ _id: cliente._id }, { $set: { puntos: 300 } })
        const id = await cuentaEnCaja() // 30.000 − 3.000 = 27.000: caben 2 bloques, no 3
        expect((await cobrar(id, { total: 1, aplicarCumpleanos: true, canjearPuntos: 300 })).body.error.code).toBe('CANJE_SUPERA_CONSUMO')
        const r = await cobrar(id, { total: 7000, aplicarCumpleanos: true, canjearPuntos: 200 })
        expect(r.status, JSON.stringify(r.body)).toBe(201)
        expect(r.body.comprobante.descuentos.map((d) => [d.tipo, d.monto])).toEqual([['cumpleanos', 3000], ['puntos', 20000]])
        expect(r.body.comprobante).toMatchObject({ total: 7000, puntos: { canjeados: 200, ganados: 7 } })
    })

    it('una sola vez al año: el segundo intento recibe 409 y no cobra', async () => {
        await cobrar(await cuentaEnCaja(), { total: 27000, aplicarCumpleanos: true })
        const otra = await cuentaEnCaja()
        const r = await cobrar(otra, { total: 27000, aplicarCumpleanos: true })
        expect(r.status).toBe(409)
        expect(r.body.error.code).toBe('CUMPLEANOS_NO_DISPONIBLE')
        expect((await Cuenta.findById(otra).lean()).estado).toBe('cuenta_pedida')
    })

    it('el uso de un año no bloquea el del año siguiente (año de Bogotá)', async () => {
        await cobrar(await cuentaEnCaja(), { total: 27000, aplicarCumpleanos: true })
        expect(await estadoCumpleanos(cliente._id)).toBe('usado')
        const enUnAnio = new Date(Date.now() + 365 * 24 * 3600 * 1000) // (la sesión del test caducaría: se consulta el servicio)
        expect(await estadoCumpleanos(cliente._id, { ahora: enUnAnio })).toBe('disponible')
    })

    it('dos cobros a la vez con el descuento: solo uno lo usa', async () => {
        const [a, b] = [await cuentaEnCaja(), await cuentaEnCaja()]
        const rs = await Promise.all([cobrar(a, { total: 27000, aplicarCumpleanos: true }), cobrar(b, { total: 27000, aplicarCumpleanos: true })])
        expect(rs.map((r) => r.status).sort()).toEqual([201, 409])
        expect(await UsoCumpleanos.countDocuments({ usuario: cliente._id, vigente: true })).toBe(1)
    })

    it('fuera del mes de cumpleaños, sin fecha, sin cliente o en el cobro por partes: no se aplica', async () => {
        await Usuario.updateOne({ _id: cliente._id }, { $set: { fechaNacimiento: nacido(otroMes) } })
        const id = await cuentaEnCaja()
        expect((await cajero.get(`${CAJA}/cuentas/${id}`)).body.cumpleanosCliente).toMatchObject({ disponible: false })
        expect((await cobrar(id, { total: 27000, aplicarCumpleanos: true })).body.error.code).toBe('CUMPLEANOS_NO_DISPONIBLE')
        await Usuario.updateOne({ _id: cliente._id }, { $unset: { fechaNacimiento: 1 } })
        expect((await cobrar(id, { total: 27000, aplicarCumpleanos: true })).body.error.code).toBe('CUMPLEANOS_NO_DISPONIBLE')

        const { id: sinCliente } = (await cajero.post(`${SALON}/para-llevar`).send({ nombre: 'Luis' })).body
        await cajero.post(`${SALON}/cuentas/${sinCliente}/items`).send({ productoId: String(huevos._id), cantidad: 1 })
        await cajero.post(`${SALON}/cuentas/${sinCliente}/rondas/1/enviar`).send({ versionEsperada: await version(sinCliente) })
        await cajero.post(`${SALON}/cuentas/${sinCliente}/solicitar`).send({ versionEsperada: await version(sinCliente) })
        expect((await cobrar(sinCliente, { total: 13500, aplicarCumpleanos: true })).body.error.code).toBe('CUMPLEANOS_SIN_CLIENTE')

        await Usuario.updateOne({ _id: cliente._id }, { $set: { fechaNacimiento: nacido(mesDeHoy) } })
        const parte = await cajero.post(`${CAJA}/cuentas/${id}/cobrar-parte`).send({
            versionEsperada: await version(id), propina: 0, pagos: [{ metodo: 'tarjeta', monto: 15000 }], division: { modo: 'iguales', partes: 2 }, aplicarCumpleanos: true,
        })
        expect(parte.body.error.code).toBe('CUMPLEANOS_SOLO_COMPLETO')
        expect(await UsoCumpleanos.countDocuments()).toBe(0)
    })

    it('la nota crédito libera el descuento del año', async () => {
        const { comprobante } = (await cobrar(await cuentaEnCaja(), { total: 27000, aplicarCumpleanos: true })).body
        const { sesion: adminS } = await crearConSesion('admin')
        expect((await adminS.post(`${CAJA}/comprobantes/${comprobante.id}/anular`).send({ motivo: 'Error de cobro' })).status).toBe(201)
        expect(await UsoCumpleanos.findOne({ usuario: cliente._id }).lean()).toMatchObject({ vigente: false, liberado: { motivo: 'anulado' } })
        expect((await cobrar(await cuentaEnCaja(), { total: 27000, aplicarCumpleanos: true })).status).toBe(201)
    })

    it('el comprobante rechaza un descuento de cumpleaños que no es el 10 % del consumo', async () => {
        const { comprobante } = (await cobrar(await cuentaEnCaja(), { total: 27000, aplicarCumpleanos: true })).body
        const doc = await Comprobante.findById(comprobante.id).lean()
        const copia = (extra) => new Comprobante({ ...doc, _id: undefined, numero: 999, codigo: 'CI-000999', cuenta: new ObjectId(), ...extra })
        await expect(copia({ descuentos: [{ tipo: 'cumpleanos', monto: 5000 }], total: 25000 }).validate()).rejects.toThrow('10 % del consumo')
        await expect(copia({ descuentos: [{ tipo: 'cumpleanos', monto: 3000 }, { tipo: 'cumpleanos', monto: 3000 }], total: 24000 }).validate()).rejects.toThrow('Un solo descuento de cumpleaños')
        await expect(copia({ puntos: null }).validate()).rejects.toThrow('cliente identificado')
    })

    it('el uso no se modifica ni se borra; solo se libera', async () => {
        await cobrar(await cuentaEnCaja(), { total: 27000, aplicarCumpleanos: true })
        await expect(UsoCumpleanos.updateOne({}, { $set: { monto: 1 } })).rejects.toThrow('solo se libera')
        await expect(UsoCumpleanos.deleteMany({})).rejects.toThrow('solo se libera')
        await expect(UsoCumpleanos.updateOne({ vigente: false }, { $set: { vigente: false } })).rejects.toThrow('solo se libera')
    })
})

describe('6.7 · Cumpleaños en el domicilio', () => {
    it('GET /cliente/puntos dice si está disponible', async () => {
        expect((await clienteSesion.get('/api/v1/cliente/puntos')).body.cumpleanos).toEqual({ estado: 'disponible', porcentaje: 10 })
        await Usuario.updateOne({ _id: cliente._id }, { $set: { fechaNacimiento: nacido(otroMes) } })
        expect((await clienteSesion.get('/api/v1/cliente/puntos')).body.cumpleanos.estado).toBe('fuera_de_mes')
        await Usuario.updateOne({ _id: cliente._id }, { $unset: { fechaNacimiento: 1 } })
        expect((await clienteSesion.get('/api/v1/cliente/puntos')).body.cumpleanos.estado).toBe('sin_fecha')
    })

    it('el carrito lo aplica: el pedido guarda el descuento y su total es lo que se paga; el cobro cuadra', async () => {
        const pedido = await crearPedido(clienteSesion, { usarCumpleanos: true }) // latte de $9.000
        const doc = await Pedido.findById(pedido).lean()
        expect(doc).toMatchObject({ total: 8100, descuentos: [{ tipo: 'cumpleanos', monto: 900 }] })
        const visto = (await clienteSesion.get(`/api/v1/cliente/pedidos/${pedido}`)).body.order
        expect(visto).toMatchObject({ subtotal: 9000, total: 8100, descuentos: [{ tipo: 'cumpleanos', monto: 900 }] })
        expect((await clienteSesion.get('/api/v1/cliente/puntos')).body.cumpleanos.estado).toBe('usado')

        const { sesion: adminS } = await crearConSesion('admin')
        await entregarPedido(adminS, pedido)
        const r = await adminS.post(`${CAJA}/domicilios/${pedido}/cobrar`).send({ propina: 0, pagos: [{ metodo: 'tarjeta', monto: 8100 }] })
        expect(r.status, JSON.stringify(r.body)).toBe(201)
        expect(r.body.comprobante).toMatchObject({ subtotal: 9000, descuentos: [{ tipo: 'cumpleanos', monto: 900 }], total: 8100, puntos: { ganados: 8 } })
    })

    it('dos pedidos a la vez con el descuento: uno lo usa y el otro recibe 409', async () => {
        // Las dos peticiones directas (el ayudante crearPedido no admite llamadas en paralelo: crea un producto por pedido)
        const metodos = (await clienteSesion.get('/api/v1/cliente/metodos-pago')).body
        const cuerpo = {
            items: [{ productoRef: String(huevos._id), cantidad: 1 }], nombre: 'Ana Pérez', telefono: '3001234567',
            direccion: 'Carrera 36B #30-06', hora: '10:00', barrio: 'Centro', metodoPagoId: metodos[0].id, usarCumpleanos: true,
        }
        const rs = await Promise.all([clienteSesion.post('/api/v1/cliente/pedidos').send(cuerpo), clienteSesion.post('/api/v1/cliente/pedidos').send(cuerpo)])
        expect(rs.map((r) => r.status).sort(), JSON.stringify(rs.map((r) => r.body))).toEqual([201, 409])
        expect(rs.find((r) => r.status === 409).body.error.code).toBe('CUMPLEANOS_NO_DISPONIBLE')
        expect(await Pedido.countDocuments({ usuario: cliente._id })).toBe(1)
        expect(await UsoCumpleanos.countDocuments({ usuario: cliente._id, vigente: true })).toBe(1)
    })

    it('sin derecho al descuento, el pedido no se crea (409) y no queda nada', async () => {
        await Usuario.updateOne({ _id: cliente._id }, { $set: { fechaNacimiento: nacido(otroMes) } })
        await expect(crearPedido(clienteSesion, { usarCumpleanos: true })).rejects.toThrow('CUMPLEANOS_NO_DISPONIBLE')
        expect(await Pedido.countDocuments({ usuario: cliente._id })).toBe(0)
    })

    it('anular el comprobante de un domicilio no libera el uso (el pedido conserva su descuento)', async () => {
        const pedido = await crearPedido(clienteSesion, { usarCumpleanos: true })
        const { sesion: adminS } = await crearConSesion('admin')
        await entregarPedido(adminS, pedido)
        const { comprobante } = (await adminS.post(`${CAJA}/domicilios/${pedido}/cobrar`).send({ propina: 0, pagos: [{ metodo: 'tarjeta', monto: 8100 }] })).body
        expect((await adminS.post(`${CAJA}/comprobantes/${comprobante.id}/anular`).send({ motivo: 'Error de cobro' })).status).toBe(201)
        expect(await UsoCumpleanos.findOne({ 'referencia.id': pedido }).lean()).toMatchObject({ vigente: true })
        expect((await clienteSesion.get('/api/v1/cliente/puntos')).body.cumpleanos.estado).toBe('usado')
    })

    it('cancelar el domicilio (cliente o staff) libera el descuento', async () => {
        const pedido = await crearPedido(clienteSesion, { usarCumpleanos: true })
        expect((await clienteSesion.patch(`/api/v1/cliente/pedidos/${pedido}/cancelar`).send({ motivo: 'Me equivoqué' })).status).toBe(200)
        expect(await UsoCumpleanos.findOne({ 'referencia.id': pedido }).lean()).toMatchObject({ vigente: false, liberado: { motivo: 'cancelado' } })

        const otro = await crearPedido(clienteSesion, { usarCumpleanos: true })
        const { sesion: adminS } = await crearConSesion('admin')
        expect((await adminS.patch(`/api/v1/staff/pedidos/${otro}/cancelar`).send({ motivo: 'Sin repartidor' })).status).toBe(200)
        expect(await UsoCumpleanos.countDocuments({ usuario: cliente._id, vigente: true })).toBe(0)
    })
})

describe('6.7 · Reportes', () => {
    it('ventas: el descuento de un domicilio entregado cuenta con su venta', async () => {
        const pedido = await crearPedido(clienteSesion, { usarCumpleanos: true })
        const { sesion: adminS } = await crearConSesion('admin')
        await entregarPedido(adminS, pedido) // entregado, sin cobrar aún
        const r = await adminS.get(`/api/v1/admin/reportes/ventas?desde=${hoy}&hasta=${hoy}`)
        expect(r.body.resumen).toMatchObject({ ventas: 9000, descuentos: 900, ventasNetas: 8100 })
    })

    it('ventas: descuentos por tipo y ventas netas', async () => {
        await Usuario.updateOne({ _id: cliente._id }, { $set: { puntos: 100 } })
        const cobro = await cobrar(await cuentaEnCaja(), { total: 17000, aplicarCumpleanos: true, canjearPuntos: 100 })
        expect(cobro.status, JSON.stringify(cobro.body)).toBe(201)
        const { sesion: adminS } = await crearConSesion('admin')
        const r = await adminS.get(`/api/v1/admin/reportes/ventas?desde=${hoy}&hasta=${hoy}`)
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        expect(r.body.resumen).toMatchObject({ ventas: 30000, descuentos: 13000, ventasNetas: 17000 })
        expect(r.body.porDescuento).toEqual([
            { tipo: 'puntos', etiqueta: 'Puntos', monto: 10000, cantidad: 1 },
            { tipo: 'cumpleanos', etiqueta: 'Cumpleaños', monto: 3000, cantidad: 1 },
        ])
    })
})
