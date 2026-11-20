import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { up, down, MARCA } from '../src/migraciones/m65-cliente-identificar.js'

// 6.5 · Migración que solo agrega cliente:identificar (mesero y cajero): dry-run no escribe, up → down → up, idempotente
const roles = () => mongoose.connection.db.collection('rols')
const permisosDe = async (nombre) => (await roles().findOne({ nombre })).permisos

beforeEach(async () => {
    await roles().updateMany({ nombre: { $in: ['mesero', 'cajero'] } }, { $pull: { permisos: 'cliente:identificar' } })
})

describe('Migración 6.5 (cliente:identificar)', () => {
    it('dry-run no escribe; up → down → up; repetir up no hace nada', async () => {
        const meseroAntes = await permisosDe('mesero')
        const simulacro = await up(mongoose.connection.db, { dryRun: true })
        expect(simulacro.roles.map((r) => [r.nombre, r.accion])).toEqual([['mesero', 'agregar'], ['cajero', 'agregar']])
        expect(await permisosDe('mesero')).toEqual(meseroAntes)

        await up(mongoose.connection.db)
        expect(await permisosDe('mesero')).toContain('cliente:identificar')
        expect(await permisosDe('cajero')).toContain('cliente:identificar')
        expect((await up(mongoose.connection.db)).roles.map((r) => r.accion)).toEqual(['ya-aplicada', 'ya-aplicada'])

        await down(mongoose.connection.db)
        expect(await permisosDe('mesero')).toEqual(meseroAntes)
        expect((await roles().findOne({ nombre: 'mesero' }))[MARCA]).toBeUndefined()
        expect((await up(mongoose.connection.db)).roles.every((r) => r.aplicado)).toBe(true)
    })

    it('no agrega a un rol que ya lo tiene y down no se lo quita', async () => {
        await roles().updateOne({ nombre: 'cajero' }, { $addToSet: { permisos: 'cliente:identificar' } })
        expect((await up(mongoose.connection.db)).roles.find((r) => r.nombre === 'cajero').accion).toBe('sin-cambios')
        await down(mongoose.connection.db)
        expect(await permisosDe('cajero')).toContain('cliente:identificar')
    })
})
