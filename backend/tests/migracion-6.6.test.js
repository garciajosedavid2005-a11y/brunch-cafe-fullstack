import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { up, down, MARCA } from '../src/migraciones/m66-puntos.js'

// 6.6 · Migración que solo agrega puntos:canjear (cajero) y los índices de movimientos_puntos: dry-run no escribe,
// up → down → up, idempotente; down no quita los índices si ya hay movimientos
const roles = () => mongoose.connection.db.collection('rols')
const permisosDe = async (nombre) => (await roles().findOne({ nombre })).permisos

beforeEach(async () => {
    await roles().updateMany({ nombre: 'cajero' }, { $pull: { permisos: 'puntos:canjear' } })
})

describe('Migración 6.6 (puntos)', () => {
    it('dry-run no escribe; up → down → up; repetir up no hace nada', async () => {
        const cajeroAntes = await permisosDe('cajero')
        const simulacro = await up(mongoose.connection.db, { dryRun: true })
        expect(simulacro.roles.map((r) => [r.nombre, r.accion])).toEqual([['cajero', 'agregar']])
        expect(simulacro.indices.crear).toEqual(['una_vez_por_referencia', 'usuario_1_createdAt_-1'])
        expect(await permisosDe('cajero')).toEqual(cajeroAntes)

        await up(mongoose.connection.db)
        expect(await permisosDe('cajero')).toContain('puntos:canjear')
        const indices = (await mongoose.connection.db.collection('movimientos_puntos').indexes()).map((i) => i.name)
        expect(indices).toEqual(expect.arrayContaining(['una_vez_por_referencia', 'usuario_1_createdAt_-1']))
        expect((await up(mongoose.connection.db)).roles.map((r) => r.accion)).toEqual(['ya-aplicada'])

        await down(mongoose.connection.db)
        expect(await permisosDe('cajero')).toEqual(cajeroAntes)
        expect((await roles().findOne({ nombre: 'cajero' }))[MARCA]).toBeUndefined()
        expect((await up(mongoose.connection.db)).roles.every((r) => r.aplicado)).toBe(true)
    })

    it('no agrega a un rol que ya lo tiene y down no se lo quita', async () => {
        await roles().updateOne({ nombre: 'cajero' }, { $addToSet: { permisos: 'puntos:canjear' } })
        expect((await up(mongoose.connection.db)).roles.find((r) => r.nombre === 'cajero').accion).toBe('sin-cambios')
        await mongoose.connection.db.collection('movimientos_puntos').insertOne({ tipo: 'acumula', referencia: { id: 1 } })
        const d = await down(mongoose.connection.db)
        expect(d.indices).toMatchObject({ quitar: [], bloqueo: 'la colección tiene movimientos' })
        expect(await permisosDe('cajero')).toContain('puntos:canjear')
    })
})
