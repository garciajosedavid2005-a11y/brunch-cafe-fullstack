import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { up, down, INDICES } from '../src/migraciones/m4-indices-reservas.js'

// Fase 4 · Migración de índices (solo agrega): dry-run no escribe, up → down → up y es idempotente
const db = () => mongoose.connection.db
const nombres = async (coleccion) => {
    try {
        return (await db().collection(coleccion).indexes()).map((i) => i.name)
    } catch {
        return []
    }
}

beforeEach(async () => {
    // Parte de una BD como antes de la Fase 4 (Mongoose pudo haber creado el índice al cargar el modelo)
    for (const { coleccion, nombre } of INDICES) {
        await db().createCollection(coleccion).catch(() => {})
        if ((await nombres(coleccion)).includes(nombre)) await db().collection(coleccion).dropIndex(nombre)
    }
})

describe('Migración 4 (índices de reservas en el salón)', () => {
    it('incluye el índice parcial { mesa, inicio } de reservas', () => {
        expect(INDICES).toContainEqual(expect.objectContaining({ coleccion: 'reservas', nombre: 'mesa_inicio', clave: { mesa: 1, inicio: 1 } }))
    })

    it('dry-run no escribe; up → down → up; up repetido no hace nada', async () => {
        expect(await up(db(), { dryRun: true })).toEqual({ crear: ['reservas.mesa_inicio'], aplicado: false })
        expect(await nombres('reservas')).not.toContain('mesa_inicio')
        expect((await up(db())).aplicado).toBe(true)
        const indice = (await db().collection('reservas').indexes()).find((i) => i.name === 'mesa_inicio')
        expect(indice.partialFilterExpression).toEqual({ mesa: { $type: 'objectId' } })
        expect(await up(db())).toEqual({ crear: [], aplicado: false })
        expect(await down(db(), { dryRun: true })).toEqual({ quitar: ['reservas.mesa_inicio'], aplicado: false })
        expect((await down(db())).aplicado).toBe(true)
        expect(await nombres('reservas')).not.toContain('mesa_inicio')
        expect((await up(db())).aplicado).toBe(true)
    })

    it('no toca documentos', async () => {
        await db().collection('reservas').insertOne({ nombre: 'Antes de la Fase 4', hora: '09:00' })
        await up(db())
        await down(db())
        expect(await db().collection('reservas').findOne({}, { projection: { _id: 0 } })).toEqual({ nombre: 'Antes de la Fase 4', hora: '09:00' })
    })
})
