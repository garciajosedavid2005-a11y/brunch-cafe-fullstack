import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { up, down, MARCA } from '../src/migraciones/m15-permisos-mesero.js'

const roles = () => mongoose.connection.db.collection('rols')
const mesero = () => roles().findOne({ nombre: 'mesero' })
const ANTIGUOS = ['pedido:ver', 'pedido:cambiar_estado']

// El setup siembra los roles con los permisos nuevos; aquí se simula una BD anterior a la rama developers
const dejarMesero = (permisos) => roles().updateOne({ nombre: 'mesero' }, { $set: { permisos }, $unset: { [MARCA]: 1 } })

describe('Migración 0.15 (permisos del mesero en BDs existentes)', () => {
    it('--dry-run informa sin escribir', async () => {
        await dejarMesero(ANTIGUOS)
        const plan = await up(mongoose.connection.db, { dryRun: true })
        expect(plan).toMatchObject({ aplicado: false, accion: 'agregar', agregar: ['reserva:ver', 'reserva:crear'] })
        expect((await mesero()).permisos).toEqual(ANTIGUOS)
    })

    it('up agrega reserva:ver y reserva:crear; down deja el rol como estaba', async () => {
        await dejarMesero(ANTIGUOS)
        expect((await up(mongoose.connection.db)).aplicado).toBe(true)
        expect((await mesero()).permisos).toEqual([...ANTIGUOS, 'reserva:ver', 'reserva:crear'])
        expect((await up(mongoose.connection.db, { dryRun: true })).accion).toBe('ya-aplicada')

        expect(await down(mongoose.connection.db)).toMatchObject({ aplicado: true, quitar: ['reserva:ver', 'reserva:crear'] })
        const restaurado = await mesero()
        expect(restaurado.permisos).toEqual(ANTIGUOS)
        expect(restaurado[MARCA]).toBeUndefined()
    })

    it('no toca un rol que el admin personalizó', async () => {
        await dejarMesero(['pedido:ver'])
        const plan = await up(mongoose.connection.db)
        expect(plan).toMatchObject({ aplicado: false, accion: 'personalizado' })
        expect((await mesero()).permisos).toEqual(['pedido:ver'])
    })

    it('si ya tiene los permisos nuevos (BD nueva) no hace nada, y down solo quita lo que puso up', async () => {
        // Desde 1.1 el seed también le da los permisos de salón: se compara con lo que había antes de down
        const sembrados = (await mesero()).permisos
        expect(sembrados).toEqual(expect.arrayContaining([...ANTIGUOS, 'reserva:ver', 'reserva:crear']))
        expect((await up(mongoose.connection.db)).accion).toBe('sin-cambios')
        expect(await down(mongoose.connection.db)).toMatchObject({ aplicado: false, quitar: [] })
        expect((await mesero()).permisos).toEqual(sembrados)
    })
})
