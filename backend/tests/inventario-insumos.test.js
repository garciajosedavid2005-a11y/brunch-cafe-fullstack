// Fase 5 · 5.1 · Insumos (F5-1), permisos de inventario y rol compras (F5-8, F5-a), libro de movimientos.
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import Insumo from '../src/modulos/inventario/insumo.model.js'
import MovimientoInventario from '../src/modulos/inventario/movimiento.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import Rol from '../src/modulos/identidad/rol.model.js'
import { conTransaccion } from '../src/modulos/compartido/transacciones.js'
import { aplicarMovimientos } from '../src/modulos/inventario/movimientos.service.js'

const BASE = '/api/v1/inventario/insumos'

beforeEach(async () => {
    await Promise.all([Insumo.createIndexes(), MovimientoInventario.createIndexes()])
})

describe('5.1 · Insumos', () => {
    it('compras crea un insumo; la existencia inicial queda como movimiento «inicial» con su Evento', async () => {
        const { sesion, usuario } = await crearConSesion('compras')
        const res = await sesion.post(BASE).send({ nombre: 'Café en grano', unidad: 'g', minimo: 500, costoPromedio: 45.5, existenciaInicial: 2000 })
        expect(res.status, JSON.stringify(res.body)).toBe(201)
        expect(res.body).toMatchObject({ nombre: 'Café en grano', unidad: 'g', existencia: 2000, minimo: 500, costoPromedio: 45.5, valor: 91000, nivel: 'ok', activo: true })
        const movs = await MovimientoInventario.find().lean()
        expect(movs).toHaveLength(1)
        expect(movs[0]).toMatchObject({ tipo: 'inicial', cantidad: 2000, existenciaDespues: 2000, costoUnitario: 45.5, motivo: 'existencia inicial', actor: 'compras' })
        expect(String(movs[0].usuario)).toBe(String(usuario._id))
        expect(await Evento.exists({ entidad: 'insumo', tipo: 'insumo_creado' })).toBeTruthy()
    })

    it('rechaza nombres repetidos sin distinguir mayúsculas ni tildes, unidades inválidas y más de 3 decimales', async () => {
        const { sesion } = await crearConSesion('compras')
        expect((await sesion.post(BASE).send({ nombre: 'Café', unidad: 'g' })).status).toBe(201)
        expect((await sesion.post(BASE).send({ nombre: 'cafe', unidad: 'g' })).body.error.code).toBe('INSUMO_DUPLICADO')
        expect((await sesion.post(BASE).send({ nombre: 'Leche', unidad: 'litro' })).body.error.code).toBe('VALIDATION_ERROR')
        expect((await sesion.post(BASE).send({ nombre: 'Leche', unidad: 'ml', minimo: 1.2345 })).body.error.code).toBe('VALIDATION_ERROR')
        // Campos que no se aceptan del cliente (la existencia solo cambia con movimientos)
        expect((await sesion.post(BASE).send({ nombre: 'Leche', unidad: 'ml', existencia: 50 })).body.error.code).toBe('VALIDATION_ERROR')
    })

    it('editar deja el Evento con antes y después; una versión vieja → 409; la unidad no cambia con movimientos', async () => {
        const { sesion } = await crearConSesion('compras')
        const creado = (await sesion.post(BASE).send({ nombre: 'Leche entera', unidad: 'ml', existenciaInicial: 1000 })).body
        const editado = await sesion.put(`${BASE}/${creado.id}`).send({ minimo: 2000, versionEsperada: creado.version })
        expect(editado.status, JSON.stringify(editado.body)).toBe(200)
        expect(editado.body).toMatchObject({ minimo: 2000, nivel: 'bajo' })
        const evento = await Evento.findOne({ tipo: 'insumo_editado' }).lean()
        expect(evento.datos).toMatchObject({ antes: { minimo: 0 }, despues: { minimo: 2000 } })
        expect((await sesion.put(`${BASE}/${creado.id}`).send({ minimo: 1, versionEsperada: creado.version })).body.error.code).toBe('INSUMO_CAMBIADO')
        expect((await sesion.put(`${BASE}/${creado.id}`).send({ minimo: 1 })).body.error.code).toBe('VALIDATION_ERROR') // sin versión
        const v = editado.body.version
        expect((await sesion.put(`${BASE}/${creado.id}`).send({ unidad: 'g', versionEsperada: v })).body.error.code).toBe('UNIDAD_CON_MOVIMIENTOS')
        const inactivo = await sesion.put(`${BASE}/${creado.id}`).send({ activo: false, versionEsperada: v })
        expect(inactivo.body.activo).toBe(false)
        // Renombrar a un nombre que ya existe; ids mal formados o inexistentes
        await sesion.post(BASE).send({ nombre: 'Leche de almendra', unidad: 'ml' })
        expect((await sesion.put(`${BASE}/${creado.id}`).send({ nombre: 'LECHE DE ALMENDRA', versionEsperada: inactivo.body.version })).body.error.code).toBe('INSUMO_DUPLICADO')
        expect((await sesion.put(`${BASE}/no-es-un-id`).send({ minimo: 1, versionEsperada: 0 })).body.error.code).toBe('INSUMO_NO_ENCONTRADO')
        expect((await sesion.get(`${BASE}/${new mongoose.Types.ObjectId()}/movimientos`)).body.error.code).toBe('INSUMO_NO_ENCONTRADO')
    })

    it('kárdex: lista los movimientos con autor y motivo', async () => {
        const { sesion } = await crearConSesion('compras')
        const creado = (await sesion.post(BASE).send({ nombre: 'Aguacate', unidad: 'unidad', existenciaInicial: 12 })).body
        const res = await sesion.get(`${BASE}/${creado.id}/movimientos`)
        expect(res.status).toBe(200)
        expect(res.body.movimientos[0]).toMatchObject({ tipo: 'inicial', cantidad: 12, motivo: 'existencia inicial', autor: expect.stringContaining('compras') })
    })
})

describe('5.1 · Permisos y rol compras', () => {
    it('el mesero, la cocina y el cajero no ven el inventario; el admin sí', async () => {
        for (const rol of ['mesero', 'cocina', 'cajero']) {
            const { sesion } = await crearConSesion(rol)
            expect((await sesion.get(BASE)).status, rol).toBe(403)
        }
        const { sesion } = await crearConSesion('admin')
        expect((await sesion.get(BASE)).status).toBe(200)
        expect((await sesion.post(BASE).send({ nombre: 'Pan', unidad: 'unidad' })).status).toBe(201)
    })

    it('un rol solo con inventario:ver consulta pero no crea ni edita (403)', async () => {
        await Rol.create({ nombre: 'auditor', etiqueta: 'Auditor', permisos: ['inventario:ver'] })
        const { sesion } = await crearConSesion('auditor')
        expect((await sesion.get(BASE)).status).toBe(200)
        expect((await sesion.post(BASE).send({ nombre: 'Pan', unidad: 'unidad' })).status).toBe(403)
        const insumo = await Insumo.create({ nombre: 'Pan', unidad: 'unidad' })
        expect((await sesion.put(`${BASE}/${insumo._id}`).send({ minimo: 1, versionEsperada: 0 })).status).toBe(403)
    })

    it('compras no entra a caja, salón ni cocina', async () => {
        const { sesion } = await crearConSesion('compras')
        expect((await sesion.get('/api/v1/staff/caja/cuentas')).status).toBe(403)
        expect((await sesion.get('/api/v1/staff/salon/mesas')).status).toBe(403)
        expect((await sesion.get('/api/v1/staff/cocina/cola?estacion=cocina')).status).toBe(403)
    })
})

describe('5.1 · Libro de movimientos', () => {
    it('suma decimales sin arrastrar error y no deja modificar ni borrar movimientos', async () => {
        const insumo = await Insumo.create({ nombre: 'Leche', unidad: 'ml' })
        const sesion = { id: String(new mongoose.Types.ObjectId()), rol: 'compras' }
        await conTransaccion((session) => aplicarMovimientos([
            { insumo: insumo._id, cantidad: 0.1, tipo: 'ajuste' },
        ], { motivo: 'prueba', sesion, referencia: { tipo: 'manual' }, session }))
        await conTransaccion((session) => aplicarMovimientos([
            { insumo: insumo._id, cantidad: 0.2, tipo: 'ajuste' },
        ], { motivo: 'prueba', sesion, referencia: { tipo: 'manual' }, session }))
        expect((await Insumo.findById(insumo._id).lean()).existencia).toBe(0.3)
        await expect(MovimientoInventario.updateMany({}, { motivo: 'x' })).rejects.toMatchObject({ code: 'MOVIMIENTO_INMUTABLE' })
        await expect(MovimientoInventario.deleteMany({})).rejects.toMatchObject({ code: 'MOVIMIENTO_INMUTABLE' })
        const mov = await MovimientoInventario.findOne()
        mov.motivo = 'otro'
        await expect(mov.save()).rejects.toMatchObject({ code: 'MOVIMIENTO_INMUTABLE' })
        await expect(MovimientoInventario.bulkWrite([{ deleteOne: { filter: { _id: mov._id } } }])).rejects.toMatchObject({ code: 'MOVIMIENTO_INMUTABLE' })
    })

    it('la existencia no pasa del tope (409) y dos recepciones del mismo insumo se juntan con el costo ponderado', async () => {
        const insumo = await Insumo.create({ nombre: 'Azúcar', unidad: 'g' })
        const sesion = { id: String(new mongoose.Types.ObjectId()), rol: 'compras' }
        const aplicar = (lineas, referencia = { tipo: 'manual' }) => conTransaccion((session) => aplicarMovimientos(lineas, { motivo: 'prueba', sesion, referencia, session }))
        await expect(aplicar([{ insumo: insumo._id, cantidad: 10_000_001, tipo: 'ajuste' }])).rejects.toMatchObject({ code: 'EXISTENCIA_FUERA_DE_RANGO' })
        await aplicar([
            { insumo: insumo._id, cantidad: 1000, tipo: 'recepcion', costoUnitario: 4 },
            { insumo: insumo._id, cantidad: 3000, tipo: 'recepcion', costoUnitario: 8 },
        ], { tipo: 'recepcion', id: new mongoose.Types.ObjectId() })
        expect(await Insumo.findById(insumo._id).lean()).toMatchObject({ existencia: 4000, costoPromedio: 7 })
        expect(await MovimientoInventario.countDocuments({ tipo: 'recepcion' })).toBe(1)
    })

    it('un consumo debe ser negativo y una recepción recalcula el costo promedio ponderado', async () => {
        const insumo = await Insumo.create({ nombre: 'Café', unidad: 'g', costoPromedio: 40 })
        const sesion = { id: String(new mongoose.Types.ObjectId()), rol: 'compras' }
        const aplicar = (lineas) => conTransaccion((session) => aplicarMovimientos(lineas, { motivo: 'prueba', sesion, referencia: { tipo: 'manual' }, session }))
        await expect(aplicar([{ insumo: insumo._id, cantidad: 5, tipo: 'consumo' }])).rejects.toThrow(/negativo/)
        await aplicar([{ insumo: insumo._id, cantidad: 1000, tipo: 'ajuste' }])
        await aplicar([{ insumo: insumo._id, cantidad: 1000, tipo: 'recepcion', costoUnitario: 50 }])
        expect(await Insumo.findById(insumo._id).lean()).toMatchObject({ existencia: 2000, costoPromedio: 45 })
    })
})
