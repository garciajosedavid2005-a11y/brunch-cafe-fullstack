import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import Estado from '../src/models/estado.model.js'
import { recolorearAmarillo } from '../src/migraciones/recolorear-amarillo.js'

const db = () => mongoose.connection.db

describe('Recolorear estados (#b78103 → #7a5000)', () => {
    it('solo cambia el color anterior exacto, respeta los personalizados y es idempotente', async () => {
        await Estado.updateOne({ tipo: 'pedido', codigo: 'pendiente' }, { color: '#b78103' })
        await Estado.updateOne({ tipo: 'reserva', codigo: 'pendiente' }, { color: '#B78103' })
        await Estado.updateOne({ tipo: 'pedido', codigo: 'listo' }, { color: '#b78104' }) // personalizado
        const antes = await Estado.find().lean()

        const simulacro = await recolorearAmarillo(db(), { dryRun: true })
        expect(simulacro.afectados).toHaveLength(2)
        expect(await Estado.find().lean()).toEqual(antes)

        const real = await recolorearAmarillo(db())
        expect(real.afectados.map((e) => `${e.tipo}.${e.codigo}`).sort()).toEqual(['pedido.pendiente', 'reserva.pendiente'])
        expect((await Estado.findOne({ tipo: 'pedido', codigo: 'pendiente' })).color).toBe('#7a5000')
        expect((await Estado.findOne({ tipo: 'pedido', codigo: 'listo' })).color).toBe('#b78104')

        expect((await recolorearAmarillo(db())).afectados).toHaveLength(0)
    })
})
