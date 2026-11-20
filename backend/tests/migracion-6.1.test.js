import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { up, down, COLECCION_REGISTRO } from '../src/migraciones/m61-canal-pedidos.js'

// 6.1 · Migración que SOLO rellena Pedido.canal donde falta: dry-run no escribe, up → down → up exacto (ausente y
// null vuelven a ser ausente y null), idempotente y sin tocar pedidos con canal ni otros campos
const db = () => mongoose.connection.db
const pedidos = () => db().collection('pedidos')
const { ObjectId } = mongoose.Types
const base = { total: 30000, direccion: 'Carrera 36B #30-06', barrio: 'Centro' }
let ausente, nulo, conCanal

beforeEach(async () => {
    ;[ausente, nulo, conCanal] = [new ObjectId(), new ObjectId(), new ObjectId()]
    await pedidos().insertMany([
        { _id: ausente, ...base },
        { _id: nulo, ...base, canal: null },
        { _id: conCanal, ...base, canal: 'domicilio', total: 12000 },
    ])
})

const sinCanal = (p) => {
    const copia = { ...p }
    delete copia.canal
    return copia
}
const todos = () => pedidos().find({}).sort({ _id: 1 }).toArray()

describe('Migración 6.1 (Pedido.canal)', () => {
    it('dry-run no escribe; up rellena solo los vacíos; down deja todo exactamente igual; up de nuevo', async () => {
        const antes = await todos()
        expect(await up(db(), { dryRun: true })).toEqual({ rellenar: 2, aplicado: false })
        expect(await todos()).toEqual(antes)
        expect(await db().listCollections({ name: COLECCION_REGISTRO }).toArray()).toHaveLength(0)

        expect(await up(db())).toEqual({ rellenar: 2, aplicado: true })
        const despues = await todos()
        expect(despues.map((p) => p.canal)).toEqual(['domicilio', 'domicilio', 'domicilio'])
        // Ningún otro campo cambió
        expect(despues.map(sinCanal)).toEqual(antes.map(sinCanal))
        expect(await up(db())).toEqual({ rellenar: 0, aplicado: false })

        expect(await down(db(), { dryRun: true })).toEqual({ revertir: 2, aplicado: false })
        expect(await down(db())).toEqual({ revertir: 2, aplicado: true })
        expect(await todos()).toEqual(antes)
        expect(await db().listCollections({ name: COLECCION_REGISTRO }).toArray()).toHaveLength(0)
        expect(await down(db())).toEqual({ revertir: 0, aplicado: false })

        expect((await up(db())).aplicado).toBe(true)
        expect(await pedidos().countDocuments({ canal: 'domicilio' })).toBe(3)
    })
})
