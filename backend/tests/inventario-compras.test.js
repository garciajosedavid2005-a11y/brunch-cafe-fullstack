// Fase 5 · 5.4 (F5-5) · Proveedores, órdenes de compra y recepción (suma stock, recalcula el costo promedio,
// lotes con vencimiento y reactivación de lo agotado por el sistema).
import { describe, it, expect, beforeEach } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba } from './helpers/datos.js'
import Insumo from '../src/modulos/inventario/insumo.model.js'
import Receta from '../src/modulos/inventario/receta.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import MovimientoInventario from '../src/modulos/inventario/movimiento.model.js'
import { Proveedor, OrdenCompra, Lote, Recepcion } from '../src/modulos/inventario/compras.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import Rol from '../src/modulos/identidad/rol.model.js'

const BASE = '/api/v1/inventario'
let cafe, leche, sesion

beforeEach(async () => {
    await Promise.all([Insumo.createIndexes(), Proveedor.createIndexes(), OrdenCompra.createIndexes(), MovimientoInventario.createIndexes()])
    ;[cafe, leche] = await Insumo.create([
        { nombre: 'Café', unidad: 'g', existencia: 1000, costoPromedio: 40 },
        { nombre: 'Leche', unidad: 'ml', existencia: 0, costoPromedio: 4 },
    ])
    ;({ sesion } = await crearConSesion('compras'))
})

const proveedorYOrden = async () => {
    const proveedor = (await sesion.post(`${BASE}/proveedores`).send({ nombre: 'Tostadores del Huila', nit: '900123456', telefono: '3001234567' })).body
    const orden = await sesion.post(`${BASE}/ordenes`).send({
        proveedorId: proveedor.id,
        lineas: [{ insumoId: String(cafe._id), cantidad: 1000, costoUnitario: 50 }, { insumoId: String(leche._id), cantidad: 10000, costoUnitario: 4.5 }],
    })
    expect(orden.status, JSON.stringify(orden.body)).toBe(201)
    return orden.body
}

describe('5.4 · Proveedores y órdenes', () => {
    it('crea proveedor y orden con consecutivo OC-000001 y total entero; nombres repetidos → 409', async () => {
        const orden = await proveedorYOrden()
        expect(orden).toMatchObject({ codigo: 'OC-000001', estado: 'abierta', total: 95000, proveedor: { nombre: 'Tostadores del Huila' } })
        expect((await sesion.post(`${BASE}/proveedores`).send({ nombre: 'TOSTADORES DEL HUILA' })).body.error.code).toBe('PROVEEDOR_DUPLICADO')
        expect(await Evento.exists({ entidad: 'orden_compra', tipo: 'orden_creada' })).toBeTruthy()
    })

    it('cancelar exige motivo y la versión; una orden cancelada no se recibe', async () => {
        const orden = await proveedorYOrden()
        expect((await sesion.post(`${BASE}/ordenes/${orden.id}/cancelar`).send({ versionEsperada: orden.version })).body.error.code).toBe('VALIDATION_ERROR')
        const cancelada = await sesion.post(`${BASE}/ordenes/${orden.id}/cancelar`).send({ motivo: 'el proveedor no tiene', versionEsperada: orden.version })
        expect(cancelada.body.estado).toBe('cancelada')
        const r = await sesion.post(`${BASE}/ordenes/${orden.id}/recepciones`).send({ versionEsperada: cancelada.body.version, lineas: [{ lineaId: orden.lineas[0].id, cantidad: 1 }] })
        expect(r.body.error.code).toBe('ORDEN_CERRADA')
    })
})

describe('5.4 · Recepción', () => {
    it('parcial y luego total: suma existencias, recalcula el costo promedio y guarda el lote con vencimiento', async () => {
        const orden = await proveedorYOrden()
        const [lCafe, lLeche] = orden.lineas
        const parcial = await sesion.post(`${BASE}/ordenes/${orden.id}/recepciones`).send({
            versionEsperada: orden.version, lineas: [{ lineaId: lCafe.id, cantidad: 1000, costoUnitario: 60 }, { lineaId: lLeche.id, cantidad: 4000, vencimiento: '2026-11-10' }],
        })
        expect(parcial.status, JSON.stringify(parcial.body)).toBe(201)
        expect(parcial.body.orden.estado).toBe('parcial')
        // Café: (1000 × 40 + 1000 × 60) / 2000 = 50; leche: de 0 a 4000 al costo de la orden
        expect(await Insumo.findById(cafe._id).lean()).toMatchObject({ existencia: 2000, costoPromedio: 50 })
        expect(await Insumo.findById(leche._id).lean()).toMatchObject({ existencia: 4000, costoPromedio: 4.5 })
        expect(await Lote.findOne().lean()).toMatchObject({ cantidad: 4000, vencimiento: '2026-11-10', descartado: false })

        // Más de lo pendiente → 409; con la versión vieja → 409
        expect((await sesion.post(`${BASE}/ordenes/${orden.id}/recepciones`).send({ versionEsperada: parcial.body.orden.version, lineas: [{ lineaId: lLeche.id, cantidad: 6001 }] })).body.error.code).toBe('RECEPCION_EXCEDE')
        expect((await sesion.post(`${BASE}/ordenes/${orden.id}/recepciones`).send({ versionEsperada: orden.version, lineas: [{ lineaId: lLeche.id, cantidad: 1 }] })).body.error.code).toBe('ORDEN_CAMBIADA')

        const total = await sesion.post(`${BASE}/ordenes/${orden.id}/recepciones`).send({ versionEsperada: parcial.body.orden.version, lineas: [{ lineaId: lLeche.id, cantidad: 6000 }] })
        expect(total.body.orden.estado).toBe('recibida')
        expect(await Recepcion.countDocuments()).toBe(2)
        expect(await MovimientoInventario.countDocuments({ tipo: 'recepcion' })).toBe(3)
        expect(await Evento.countDocuments({ tipo: 'compra_recibida' })).toBe(2)
    })

    it('recibir reactiva el producto que el sistema agotó por falta de ese insumo', async () => {
        const bebidas = await categoriaDePrueba('Bebidas')
        const latte = await Producto.create({ nombre: 'Latte', precio: 9000, categoria: bebidas._id, disponible: false, agotadoAuto: true })
        await Receta.create({ tipo: 'producto', producto: latte._id, lineas: [{ insumo: leche._id, cantidad: 200 }] })
        const orden = await proveedorYOrden()
        await sesion.post(`${BASE}/ordenes/${orden.id}/recepciones`).send({ versionEsperada: orden.version, lineas: [{ lineaId: orden.lineas[1].id, cantidad: 1000 }] })
        expect(await Producto.findById(latte._id).lean()).toMatchObject({ disponible: true, agotadoAuto: false })
    })

    it('quien solo recibe no cambia el costo pactado (403); con el costo de la orden sí recibe', async () => {
        const orden = await proveedorYOrden()
        await Rol.create({ nombre: 'bodega', etiqueta: 'Bodega', permisos: ['inventario:ver', 'compra:recibir'] })
        const { sesion: bodega } = await crearConSesion('bodega')
        const url = `${BASE}/ordenes/${orden.id}/recepciones`
        expect((await bodega.post(url).send({ versionEsperada: orden.version, lineas: [{ lineaId: orden.lineas[0].id, cantidad: 10, costoUnitario: 1 }] })).status).toBe(403)
        expect((await bodega.post(url).send({ versionEsperada: orden.version, lineas: [{ lineaId: orden.lineas[0].id, cantidad: 10, costoUnitario: 50 }] })).status).toBe(201)
    })

    it('permisos: sin compra:recibir no se recibe; el cajero no ve compras', async () => {
        const orden = await proveedorYOrden()
        const { sesion: cajero } = await crearConSesion('cajero')
        expect((await cajero.get(`${BASE}/ordenes`)).status).toBe(403)
        expect((await cajero.post(`${BASE}/ordenes/${orden.id}/recepciones`).send({ versionEsperada: 0, lineas: [] })).status).toBe(403)
    })
})

describe('5.5 · Alertas', () => {
    it('stock bajo y lotes que vencen en 7 días (con lo que queda estimado); descartar registra el vencimiento', async () => {
        await Insumo.updateOne({ _id: cafe._id }, { minimo: 1500 }) // 1000 ≤ 1500
        const orden = await proveedorYOrden()
        await sesion.post(`${BASE}/ordenes/${orden.id}/recepciones`).send({
            versionEsperada: orden.version, lineas: [{ lineaId: orden.lineas[1].id, cantidad: 3000, vencimiento: '2026-11-09' }],
        })
        // Hoy (reloj de los tests) es 2026-11-05: vence en 4 días; luego se consumieron 1000 ml → quedan 2000 del lote
        await sesion.post(`${BASE}/movimientos`).send({ insumoId: String(leche._id), tipo: 'ajuste', cantidad: -1000, motivo: 'conteo' })
        const alertas = (await sesion.get(`${BASE}/alertas`)).body
        // Café: 1000 ≤ 1500; Leche: 2000 sobre un mínimo de 0
        expect(alertas.stockBajo).toEqual([expect.objectContaining({ nombre: 'Café', existencia: 1000, minimo: 1500, nivel: 'bajo' })])
        expect(alertas.vencimientos).toEqual([expect.objectContaining({ insumo: 'Leche', vencimiento: '2026-11-09', vencido: false, recibido: 3000, restante: 2000 })])

        const descarte = await sesion.post(`${BASE}/lotes/${alertas.vencimientos[0].id}/descartar`).send({ motivo: 'leche vencida' })
        expect(descarte.body).toMatchObject({ descartado: 2000, existencia: 0 })
        expect((await sesion.get(`${BASE}/alertas`)).body.vencimientos).toEqual([])
        expect((await sesion.post(`${BASE}/lotes/${alertas.vencimientos[0].id}/descartar`).send({ motivo: 'otra vez' })).body.error.code).toBe('LOTE_YA_DESCARTADO')
    })
})
