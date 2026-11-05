// Migración 0.7 sobre datos con el formato anterior (estados sin código)
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { up, down, MOTIVO, ACTOR } from '../src/migraciones/m07-estados.js'
import { sembrarEstados, MigracionPendienteError } from '../src/seeds/estados.js'

const db = () => mongoose.connection.db
const col = (nombre) => db().collection(nombre)
const fecha = new Date('2026-10-30T15:49:40.041Z')

// Reproduce la BD local antes de 0.7
const sembrarLegado = async ({ extra = [] } = {}) => {
    const estados = [
        { nombre: 'Pendiente', tipo: 'pedido' },
        { nombre: 'Confirmado', tipo: 'pedido', esFinal: false },
        { nombre: 'Recibido', tipo: 'pedido', esFinal: true, descripcion: 'El cliente recibió su pedido.' },
        { nombre: 'Pendiente', tipo: 'reserva' },
        { nombre: 'Cancelada', tipo: 'reserva' },
        ...extra,
    ].map((e) => ({ _id: new mongoose.Types.ObjectId(), color: '#b78103', createdAt: fecha, updatedAt: fecha, ...e }))
    await col('estados').insertMany(estados)
    const id = (tipo, nombre) => estados.find((e) => e.tipo === tipo && e.nombre === nombre)._id
    const usuario = new mongoose.Types.ObjectId()
    await col('pedidos').insertMany([
        { usuario, estado: id('pedido', 'Pendiente'), total: 1000 },
        { usuario, estado: id('pedido', 'Recibido'), total: 2000 },
    ])
    await col('reservas').insertOne({ usuario, estado: id('reserva', 'Pendiente'), cantidadPersonas: 2 })
    return estados
}

const instantanea = async () => (await col('estados').find().sort({ _id: 1 }).toArray())

describe('Migración 0.7 (estados)', () => {
    beforeEach(async () => {
        // setup.js siembra el catálogo nuevo; aquí partimos de la BD antigua
        await col('estados').deleteMany({})
    })

    it('el servidor no arranca con estados sin código', async () => {
        await sembrarLegado()
        await expect(sembrarEstados()).rejects.toBeInstanceOf(MigracionPendienteError)
    })

    it('dry-run reporta equivalencias, inserciones y eventos sin escribir', async () => {
        await sembrarLegado()
        const antes = await instantanea()
        const plan = await up(db(), { dryRun: true })

        expect(plan.aplicado).toBe(false)
        expect(plan.puedeAplicar).toBe(true)
        expect(plan.equivalencias.map((e) => [e.tipo, e.nombre, e.codigo, e.renombrarA])).toEqual(expect.arrayContaining([
            ['pedido', 'Recibido', 'entregado', 'Entregado'],
            ['pedido', 'Pendiente', 'pendiente', null],
            ['reserva', 'Cancelada', 'cancelada', null],
        ]))
        expect(plan.insertar).toHaveLength(13 - 5)
        expect(plan.eventos).toHaveLength(3)
        expect(await instantanea()).toEqual(antes)
        expect(await col('eventos').countDocuments()).toBe(0)
    })

    it('up asigna códigos, crea eventos de sistema y deja el seed sin cambios pendientes', async () => {
        await sembrarLegado()
        const r = await up(db())
        expect(r.aplicado).toBe(true)

        const recibido = await col('estados').findOne({ tipo: 'pedido', codigo: 'entregado' })
        expect(recibido).toMatchObject({ nombre: 'Entregado', esFinal: true, descripcion: 'El cliente recibió su pedido.' })
        expect(await col('estados').countDocuments({ codigo: { $exists: true } })).toBe(13)

        const eventos = await col('eventos').find().toArray()
        expect(eventos).toHaveLength(3)
        for (const e of eventos) expect(e).toMatchObject({ motivo: MOTIVO, actor: ACTOR, usuario: null, de: null })
        expect(eventos.map((e) => e.a).sort()).toEqual(['entregado', 'pendiente', 'pendiente'])

        // Pedidos y reservas siguen apuntando al mismo _id
        expect(await col('pedidos').countDocuments({ estado: recibido._id })).toBe(1)
        await expect(sembrarEstados()).resolves.toBeTruthy()

        // Idempotente
        const otraVez = await up(db(), { dryRun: true })
        expect([otraVez.equivalencias.length, otraVez.insertar.length, otraVez.eventos.length]).toEqual([0, 0, 0])
    })

    it('down deja los estados idénticos al original y se puede volver a aplicar', async () => {
        await sembrarLegado()
        const original = await instantanea()
        await up(db())
        const r = await down(db())
        expect(r.aplicado).toBe(true)
        expect(await instantanea()).toEqual(original)
        expect(await col('eventos').countDocuments()).toBe(0)

        const otraVez = await up(db())
        expect(otraVez.aplicado).toBe(true)
        expect(await col('estados').countDocuments({ codigo: { $exists: true } })).toBe(13)
    })

    it('estados que no encajan: no se adivinan y no se escribe nada', async () => {
        await sembrarLegado({ extra: [{ nombre: 'Rechazada', tipo: 'reserva' }, { nombre: 'En espera', tipo: 'pedido' }] })
        const antes = await instantanea()
        const r = await up(db())
        expect(r.aplicado).toBe(false)
        expect(r.puedeAplicar).toBe(false)
        expect(r.sinEquivalencia.map((e) => e.nombre).sort()).toEqual(['En espera', 'Rechazada'])
        expect(await instantanea()).toEqual(antes)
    })

    it('dos estados viejos con el mismo código → conflicto', async () => {
        await sembrarLegado({ extra: [{ nombre: 'Entregado', tipo: 'pedido' }] })
        const r = await up(db(), { dryRun: true })
        expect(r.puedeAplicar).toBe(false)
        expect(r.conflictos[0]).toMatchObject({ tipo: 'pedido', codigo: 'entregado' })
    })

    it('down se bloquea si un estado insertado ya está en uso', async () => {
        await sembrarLegado()
        await up(db())
        const listo = await col('estados').findOne({ tipo: 'pedido', codigo: 'listo' })
        await col('pedidos').updateOne({}, { $set: { estado: listo._id } })

        const r = await down(db())
        expect(r.aplicado).toBe(false)
        expect(r.bloqueados).toEqual([expect.objectContaining({ codigo: 'listo', pedidos: 1 })])
        expect(await col('estados').countDocuments({ codigo: { $exists: true } })).toBe(13)
    })
})
