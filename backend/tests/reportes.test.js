// Fase 5 · 5.6 y 5.7 (F5-9, F5-h) · Reportes de ventas y de operación (solo reporte:ver).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Estado from '../src/modulos/compartido/estado.model.js'
import Pedido from '../src/modulos/pedidos/pedido.model.js'
import DetallePedido from '../src/modulos/pedidos/detallePedido.model.js'
import MetodoPago from '../src/modulos/pedidos/metodoPago.model.js'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba } from './helpers/datos.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Comprobante from '../src/modulos/caja/comprobante.model.js'
import TurnoCaja from '../src/modulos/caja/turno.model.js'
import Insumo from '../src/modulos/inventario/insumo.model.js'
import Receta from '../src/modulos/inventario/receta.model.js'
import { abrirCuenta, agregarItem, enviarRonda, solicitarCuenta, cobrarCuenta } from '../src/modulos/salon/cuentas.service.js'
import { abrirTurno } from '../src/modulos/caja/turno.service.js'
import { PERMISOS_SALON, PERMISOS_CAJA } from '../src/modulos/identidad/permisos.js'

const BASE = '/api/v1/admin/reportes'
const HOY = '2026-11-05' // reloj de los tests (setup.js)
let mesero, huevos, zona
const cajero = { id: String(new mongoose.Types.ObjectId()), rol: 'cajero', permisos: PERMISOS_CAJA.cajero }

beforeEach(async () => {
    const { usuario } = await crearConSesion('mesero')
    mesero = { id: String(usuario._id), rol: 'mesero', permisos: PERMISOS_SALON.mesero }
    const platos = await categoriaDePrueba('Desayunos')
    huevos = await Producto.create({ codigo: 1, nombre: 'Huevos pericos', precio: 15000, categoria: platos._id })
    zona = await Zona.create({ nombre: 'Interior' })
    const huevo = await Insumo.create({ nombre: 'Huevo', unidad: 'unidad', existencia: 100, costoPromedio: 600 })
    await Receta.create({ tipo: 'producto', producto: huevos._id, lineas: [{ insumo: huevo._id, cantidad: 2 }] })
    await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes(), Comprobante.createIndexes(), TurnoCaja.createIndexes()])
    await abrirTurno({ base: 0 }, cajero)
})

const version = async (id) => (await Cuenta.findById(id).lean()).version
/** Cuenta de la mesa `numero` con `cantidad` × Huevos, cobrada con `pagos` y `propina`. */
const cuentaCobrada = async (numero, cantidad, propina, metodo) => {
    const mesa = await Mesa.create({ numero, zona: zona._id, capacidad: 4 })
    const cuenta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, mesero)
    await agregarItem(cuenta.id, { productoId: String(huevos._id), cantidad }, mesero)
    await enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: await version(cuenta.id) }, mesero)
    await solicitarCuenta(cuenta.id, { versionEsperada: await version(cuenta.id) }, mesero)
    const total = cantidad * 15000 + propina
    await cobrarCuenta(cuenta.id, { versionEsperada: await version(cuenta.id), propina, pagos: [{ metodo, monto: total, ...(metodo === 'efectivo' ? { recibido: total } : {}) }] }, cajero)
    return cuenta
}

describe('5.6 · Reporte de ventas', () => {
    it('resumen, día, franja, producto, categoría, canal, mesero y método de pago', async () => {
        await cuentaCobrada(1, 2, 3000, 'efectivo')
        await cuentaCobrada(2, 1, 0, 'tarjeta')
        const { sesion } = await crearConSesion('admin')
        const res = await sesion.get(`${BASE}/ventas?desde=${HOY}&hasta=${HOY}`)
        expect(res.status, JSON.stringify(res.body)).toBe(200)
        const r = res.body
        expect(r.resumen).toMatchObject({ ventas: 45000, tickets: 2, cuentas: 2, pedidos: 0, ticketPromedio: 22500, propinas: 3000, notasCredito: 0 })
        expect(r.porDia).toEqual([expect.objectContaining({ fecha: HOY, salon: 45000, total: 45000, tickets: 2 })])
        expect(r.porFranja).toEqual([expect.objectContaining({ hora: 7, franja: '07:00–08:00', ventas: 45000, tickets: 2 })])
        expect(r.porProducto).toEqual([expect.objectContaining({ nombre: 'Huevos pericos', categoria: 'Desayunos', cantidad: 3, ventas: 45000 })])
        expect(r.porCategoria).toEqual([{ categoria: 'Desayunos', cantidad: 3, ventas: 45000 }])
        expect(r.porCanal.find((c) => c.canal === 'salon')).toMatchObject({ ventas: 45000, tickets: 2 })
        expect(r.porCanal.find((c) => c.canal === 'para_llevar')).toMatchObject({ ventas: 0, disponible: false })
        expect(r.porMesero).toEqual([expect.objectContaining({ id: mesero.id, cuentas: 2, ventas: 45000, propinas: 3000, ticketPromedio: 22500 })])
        expect(r.porMetodo.find((m) => m.metodo === 'efectivo')).toMatchObject({ cobrado: 33000, neto: 33000, pagos: 1 })
        expect(r.porMetodo.find((m) => m.metodo === 'tarjeta')).toMatchObject({ cobrado: 15000 })
    })

    it('otro día no trae nada; el rango se valida; sin reporte:ver → 403', async () => {
        await cuentaCobrada(1, 1, 0, 'efectivo')
        const { sesion } = await crearConSesion('admin')
        expect((await sesion.get(`${BASE}/ventas?desde=2026-11-06&hasta=2026-11-06`)).body.resumen.ventas).toBe(0)
        expect((await sesion.get(`${BASE}/ventas?desde=2026-11-06&hasta=2026-11-05`)).body.error.code).toBe('RANGO_INVALIDO')
        expect((await sesion.get(`${BASE}/ventas?desde=2025-01-01&hasta=2026-11-05`)).body.error.code).toBe('RANGO_INVALIDO')
        expect((await sesion.get(`${BASE}/ventas?desde=5-11-2026&hasta=2026-11-05`)).body.error.code).toBe('VALIDATION_ERROR')
        for (const rol of ['cajero', 'compras', 'mesero']) {
            const { sesion: otra } = await crearConSesion(rol)
            expect((await otra.get(`${BASE}/ventas?desde=${HOY}&hasta=${HOY}`)).status, rol).toBe(403)
        }
    })
})

describe('5.6 · Fechas de Bogotá y domicilio', () => {
    it('un cobro a las 11:30 p. m. de Bogotá (04:30 UTC del día siguiente) cuenta en su día; un domicilio entregado suma al canal', async () => {
        vi.setSystemTime(new Date('2026-11-06T04:30:00Z'))
        await cuentaCobrada(1, 1, 0, 'tarjeta')
        vi.setSystemTime(new Date('2026-11-06T15:00:00Z')) // el domicilio se pide el 6 a las 10:00 a. m.
        const { usuario } = await crearConSesion('cliente')
        const entregado = await Estado.findOne({ tipo: 'pedido', codigo: 'entregado' })
        const pedido = await Pedido.create({
            usuario: usuario._id, estado: entregado._id, metodoPago: (await MetodoPago.findOne())._id, total: 30000,
            nombreEntrega: 'Cliente', direccion: 'Carrera 36B #30-06', barrio: 'Centro', horaEntrega: '10:00',
        })
        await DetallePedido.create({ pedido: pedido._id, producto: huevos._id, productoId: 1, nombreProducto: 'Huevos pericos', precioProducto: 15000, precioUnitario: 15000, cantidad: 2, subtotal: 30000 })
        const { sesion } = await crearConSesion('admin')
        const dia5 = (await sesion.get(`${BASE}/ventas?desde=${HOY}&hasta=${HOY}`)).body
        expect(dia5.porFranja.find((f) => f.hora === 23)).toMatchObject({ ventas: 15000, tickets: 1 })
        expect(dia5.porCanal.find((c) => c.canal === 'salon')).toMatchObject({ ventas: 15000 })
        const dia6 = (await sesion.get(`${BASE}/ventas?desde=2026-11-06&hasta=2026-11-06`)).body
        expect(dia6.porCanal.find((c) => c.canal === 'salon').ventas).toBe(0)
        expect(dia6.porCanal.find((c) => c.canal === 'domicilio')).toMatchObject({ ventas: 30000, tickets: 1 })
        expect(dia6.resumen).toMatchObject({ ventas: 30000, pedidos: 1, ticketPromedio: 30000 })
    })
})

describe('5.7 · Reporte de operación', () => {
    it('rotación por mesa, tiempos por estación (mediana y p90) y costo frente a venta', async () => {
        const cuenta = await cuentaCobrada(1, 2, 0, 'efectivo')
        // La ronda quedó lista 12 min después de enviarse (preparación de 8 min)
        const comanda = await Comanda.findOne({ cuenta: cuenta.id }).lean()
        const listo = new Date(comanda.enviadaEn.getTime() + 12 * 60000)
        await Comanda.collection.updateOne({ _id: comanda._id }, { $set: {
            'items.0.estado': 'servido', 'items.0.iniciadoEn': new Date(listo.getTime() - 8 * 60000), 'items.0.listoEn': listo,
        } })
        const { sesion } = await crearConSesion('admin')
        const r = (await sesion.get(`${BASE}/operacion?desde=${HOY}&hasta=${HOY}`)).body
        expect(r.rotacion).toEqual([expect.objectContaining({ mesa: 1, zona: 'Interior', cuentas: 1, cuentasPorDia: 1 })])
        expect(r.tiempos).toEqual([expect.objectContaining({ codigo: 'cocina', items: 1, espera: { mediana: 12, p90: 12 }, preparacion: { mediana: 8, p90: 8 } })])
        // 2 huevos × $600 por plato × 2 platos = 2.400 de costo frente a 30.000 de venta
        expect(r.margenes).toEqual([expect.objectContaining({ nombre: 'Huevos pericos', cantidad: 2, ventas: 30000, costo: 2400, margen: 27600, margenPct: 92, conReceta: true })])
        expect(r.totalesMargen).toMatchObject({ ventas: 30000, costo: 2400, margen: 27600 })
    })
})
