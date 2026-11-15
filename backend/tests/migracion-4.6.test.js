import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { up, down } from '../src/migraciones/m46-apartar-mesa.js'

// 4.6 · Migración que solo agrega `reservas.apartarMesaMin: 60`: dry-run no escribe, up → down → up, idempotente
// y no toca otros campos ni un valor que el admin ya cambió
const col = () => mongoose.connection.db.collection('configuraciones')
const reservas = async () => (await col().findOne({ clave: 'horarios' })).reservas

beforeEach(async () => {
    await col().updateOne({ clave: 'horarios' }, { $unset: { 'reservas.apartarMesaMin': '' } })
})

describe('Migración 4.6 (apartar la mesa)', () => {
    it('dry-run no escribe; up → down → up; repetir up no hace nada; el resto de los horarios no cambia', async () => {
        const antes = await reservas()
        expect(antes.apartarMesaMin).toBeUndefined()
        expect(await up(mongoose.connection.db, { dryRun: true })).toEqual({ agregar: 1, aplicado: false })
        expect((await reservas()).apartarMesaMin).toBeUndefined()
        expect(await up(mongoose.connection.db)).toEqual({ agregar: 1, aplicado: true })
        expect(await reservas()).toEqual({ ...antes, apartarMesaMin: 60 })
        expect(await up(mongoose.connection.db)).toEqual({ agregar: 0, aplicado: false })
        expect(await down(mongoose.connection.db, { dryRun: true })).toEqual({ quitar: 1, aplicado: false })
        expect(await down(mongoose.connection.db)).toEqual({ quitar: 1, aplicado: true })
        expect(await reservas()).toEqual(antes)
        expect((await up(mongoose.connection.db)).aplicado).toBe(true)
    })

    it('up no pisa un valor guardado y down no quita uno distinto de 60', async () => {
        await col().updateOne({ clave: 'horarios' }, { $set: { 'reservas.apartarMesaMin': 45 } })
        expect(await up(mongoose.connection.db)).toEqual({ agregar: 0, aplicado: false })
        expect(await down(mongoose.connection.db)).toEqual({ quitar: 0, aplicado: false })
        expect((await reservas()).apartarMesaMin).toBe(45)
    })
})
