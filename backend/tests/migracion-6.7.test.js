import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { up, down, NOMBRES } from '../src/migraciones/m67-cumpleanos.js'

// 6.7 · Migración que solo crea los índices de `usos_cumpleanos`: dry-run no escribe, up → down → up, idempotente;
// down no los quita si ya hay usos (el único protege «una vez al año»)
const usos = () => mongoose.connection.db.collection('usos_cumpleanos')
const indices = async () => ((await mongoose.connection.db.listCollections({ name: 'usos_cumpleanos' }).toArray()).length
    ? (await usos().indexes()).map((i) => i.name) : [])

describe('Migración 6.7 (cumpleaños)', () => {
    it('dry-run no escribe; up → down → up; repetir up no hace nada', async () => {
        for (const n of (await indices()).filter((x) => x !== '_id_')) await usos().dropIndex(n)
        const simulacro = await up(mongoose.connection.db, { dryRun: true })
        expect(simulacro.crear).toEqual(NOMBRES)
        expect(await indices()).not.toContain('un_uso_vigente_por_anio')

        await up(mongoose.connection.db)
        expect(await indices()).toEqual(expect.arrayContaining(NOMBRES))
        const unico = (await usos().indexes()).find((i) => i.name === 'un_uso_vigente_por_anio')
        expect(unico).toMatchObject({ unique: true, partialFilterExpression: { vigente: true } })
        expect((await up(mongoose.connection.db)).crear).toEqual([])

        const simulacroDown = await down(mongoose.connection.db, { dryRun: true })
        expect(simulacroDown.quitar).toEqual(NOMBRES)
        expect(await indices()).toContain('un_uso_vigente_por_anio')
        await down(mongoose.connection.db)
        expect(await indices()).not.toContain('un_uso_vigente_por_anio')
        expect((await up(mongoose.connection.db)).aplicado).toBe(true)
    })

    it('si un índice existe con el mismo nombre pero sin el filtro parcial, se detiene sin crear nada', async () => {
        for (const n of (await indices()).filter((x) => x !== '_id_')) await usos().dropIndex(n)
        await usos().createIndex({ usuario: 1, anio: 1 }, { unique: true, name: 'un_uso_vigente_por_anio' })
        await expect(up(mongoose.connection.db)).rejects.toThrow('otras opciones')
        expect(await indices()).not.toContain('una_vez_por_referencia')
        await usos().dropIndex('un_uso_vigente_por_anio')
    })

    it('con usos registrados, down no quita los índices', async () => {
        await up(mongoose.connection.db)
        await usos().insertOne({ usuario: new mongoose.Types.ObjectId(), anio: 2026, vigente: true })
        const d = await down(mongoose.connection.db)
        expect(d).toMatchObject({ quitar: [], bloqueo: 'la colección tiene usos' })
        expect(await indices()).toContain('un_uso_vigente_por_anio')
    })
})
