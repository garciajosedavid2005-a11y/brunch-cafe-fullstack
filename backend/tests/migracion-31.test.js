import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { up, down, MARCA, PERMISOS_FASE_3 } from '../src/migraciones/m31-permiso-cobro.js'
import { CLAVES_ASIGNABLES } from '../src/modulos/identidad/permisos.js'

// 3.1 · Migración: permiso de cobro (cuenta:cobrar) para el rol cajero en BDs existentes (F3-1)
const db = () => mongoose.connection.db
const roles = () => db().collection('rols')
const permisosDe = async (nombre) => (await roles().findOne({ nombre })).permisos
const porRol = (resultado) => Object.fromEntries(resultado.roles.map((r) => [r.nombre, r]))
// Una BD anterior a 3.1: el cajero sin la clave
const comoAntes = () => roles().updateOne({ nombre: 'cajero' }, { $pull: { permisos: 'cuenta:cobrar' }, $unset: { [MARCA]: 1 } })

describe('Migración 3.1 (permiso de cobro del cajero)', () => {
    it('solo toca al cajero y solo agrega cuenta:cobrar, que es asignable', () => {
        expect(PERMISOS_FASE_3).toEqual({ cajero: ['cuenta:cobrar'] })
        expect(CLAVES_ASIGNABLES).toContain('cuenta:cobrar')
    })

    it('--dry-run informa sin escribir', async () => {
        await comoAntes()
        const antes = await permisosDe('cajero')
        const r = porRol(await up(db(), { dryRun: true }))
        expect(r.cajero).toMatchObject({ accion: 'agregar', agregar: ['cuenta:cobrar'], aplicado: false })
        expect(await permisosDe('cajero')).toEqual(antes)
    })

    it('up agrega la clave conservando lo demás, es idempotente y down deja todo como estaba; los otros roles no cambian', async () => {
        await comoAntes()
        const otros = await roles().find({ nombre: { $ne: 'cajero' } }).sort({ nombre: 1 }).toArray()
        const antes = await permisosDe('cajero')

        expect(porRol(await up(db())).cajero.aplicado).toBe(true)
        expect(await permisosDe('cajero')).toEqual([...antes, 'cuenta:cobrar'])
        expect(porRol(await up(db())).cajero.accion).toBe('ya-aplicada')

        expect(porRol(await down(db())).cajero).toMatchObject({ aplicado: true, quitar: ['cuenta:cobrar'] })
        expect(await permisosDe('cajero')).toEqual(antes)
        expect((await roles().findOne({ nombre: 'cajero' }))[MARCA]).toBeUndefined()

        expect(porRol(await up(db())).cajero.aplicado).toBe(true) // up → down → up
        expect(await roles().find({ nombre: { $ne: 'cajero' } }).sort({ nombre: 1 }).toArray()).toEqual(otros)
    })

    it('si el cajero ya tiene la clave (sembrado con 3.1 o asignada a mano), no lo toca', async () => {
        await comoAntes()
        await roles().updateOne({ nombre: 'cajero' }, { $addToSet: { permisos: 'cuenta:cobrar' } })
        expect(porRol(await up(db())).cajero).toMatchObject({ accion: 'sin-cambios', aplicado: false })
        expect(porRol(await down(db())).cajero).toMatchObject({ aplicado: false, quitar: [] })
        expect(await permisosDe('cajero')).toContain('cuenta:cobrar')
    })
})
