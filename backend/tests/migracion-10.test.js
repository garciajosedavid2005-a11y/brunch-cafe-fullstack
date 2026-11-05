import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { up, down } from '../src/migraciones/m10-fechas.js'

const db = () => mongoose.connection.db
const id = () => new mongoose.Types.ObjectId()

// Documentos anteriores a 0.10: sin inicio / sin entregaEn
const sembrar = async () => {
    await db().collection('reservas').insertMany([
        { usuario: id(), estado: id(), cantidadPersonas: 2, fecha: new Date('2026-12-01T12:00:00Z'), hora: '08:00' },
        { usuario: id(), estado: id(), cantidadPersonas: 2, fecha: new Date('2026-12-02T12:00:00Z'), hora: '09:00', inicio: new Date('2026-12-02T14:00:00Z') },
    ])
    await db().collection('pedidos').insertMany([
        // Creado a las 22:30 de Bogotá del 5 (en UTC ya es el 6): la entrega es el 5
        { usuario: id(), estado: id(), total: 1, horaEntrega: '10:00', createdAt: new Date('2026-11-06T03:30:00Z') },
        { usuario: id(), estado: id(), total: 1, createdAt: new Date('2026-11-01T15:00:00Z') }, // sin hora: no hay nada que calcular
    ])
}

describe('Migración 0.10 (instantes UTC)', () => {
    it('--dry-run informa sin escribir', async () => {
        await sembrar()
        const plan = await up(db(), { dryRun: true })
        expect(plan).toMatchObject({ puedeAplicar: true, aplicado: false })
        expect(plan.reservas).toMatchObject({ completar: 1, yaTenian: 1, invalidos: [] })
        expect(plan.pedidos).toMatchObject({ completar: 1, yaTenian: 0, sinHora: 1, invalidos: [] })
        expect(await db().collection('reservas').countDocuments({ inicio: { $exists: true } })).toBe(1)
    })

    it('up calcula los instantes en Bogotá; down deja todo como estaba', async () => {
        await sembrar()
        expect((await up(db())).aplicado).toBe(true)
        const reserva = await db().collection('reservas').findOne({ hora: '08:00' })
        expect(reserva.inicio.toISOString()).toBe('2026-12-01T13:00:00.000Z')
        const pedido = await db().collection('pedidos').findOne({ horaEntrega: '10:00' })
        expect(pedido.entregaEn.toISOString()).toBe('2026-11-05T15:00:00.000Z')
        expect((await up(db(), { dryRun: true })).reservas.completar).toBe(0)

        expect(await down(db())).toMatchObject({ aplicado: true, reservas: 1, pedidos: 1 })
        expect(await db().collection('reservas').countDocuments({ inicio: { $exists: true } })).toBe(1) // la que ya lo tenía
        expect(await db().collection('pedidos').countDocuments({ entregaEn: { $exists: true } })).toBe(0)
        expect(await db().collection('reservas').countDocuments({ _migracion10: { $exists: true } })).toBe(0)
    })

    it('si una hora no es válida no adivina: no escribe y la lista', async () => {
        await sembrar()
        await db().collection('reservas').insertOne({ usuario: id(), estado: id(), cantidadPersonas: 1, fecha: new Date('2026-12-03T12:00:00Z'), hora: '9 am' })
        const res = await up(db())
        expect(res).toMatchObject({ puedeAplicar: false, aplicado: false })
        expect(res.reservas.invalidos).toHaveLength(1)
        expect(res.reservas.invalidos[0]).toMatchObject({ hora: '9 am' })
        expect(await db().collection('pedidos').countDocuments({ _migracion10: { $exists: true } })).toBe(0)
    })
})
