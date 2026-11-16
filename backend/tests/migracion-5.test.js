import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { up, down, INDICES, MARCA } from '../src/migraciones/m5-inventario.js'

// Fase 5 · Migración 5 (solo agrega): rol compras e índices. dry-run no escribe; up → down → up; idempotente
const db = () => mongoose.connection.db
const roles = () => db().collection('rols')
const nombres = async (coleccion) => {
    try {
        return (await db().collection(coleccion).indexes()).map((i) => i.name)
    } catch {
        return []
    }
}

beforeEach(async () => {
    // BD como antes de la Fase 5: sin el rol compras ni los índices (el seed de los tests lo crea)
    await roles().deleteMany({ nombre: 'compras' })
    for (const { coleccion, nombre } of INDICES) {
        await db().createCollection(coleccion).catch(() => {})
        if ((await nombres(coleccion)).includes(nombre)) await db().collection(coleccion).dropIndex(nombre)
    }
})

describe('Migración 5 (inventario)', () => {
    it('dry-run no escribe; up crea el rol marcado y los índices; down los quita; up otra vez', async () => {
        const simulacro = await up(db(), { dryRun: true })
        expect(simulacro).toMatchObject({ rol: 'crear', aplicado: false })
        expect(simulacro.crear).toHaveLength(INDICES.length)
        expect(await roles().findOne({ nombre: 'compras' })).toBeNull()

        expect(await up(db())).toMatchObject({ rol: 'crear', aplicado: true })
        const rol = await roles().findOne({ nombre: 'compras' })
        expect(rol).toMatchObject({ [MARCA]: true, permisos: ['inventario:ver', 'inventario:gestionar', 'inventario:ajustar', 'compra:gestionar', 'compra:recibir'] })
        expect(await nombres('insumos')).toContain('nombre_unico')
        expect(await up(db())).toMatchObject({ rol: 'ya-existe', crear: [], aplicado: false })

        expect(await down(db())).toMatchObject({ rol: 'quitar' })
        expect(await roles().findOne({ nombre: 'compras' })).toBeNull()
        expect(await nombres('insumos')).not.toContain('nombre_unico')
        expect(await up(db())).toMatchObject({ rol: 'crear', aplicado: true })
    })

    it('down no quita un rol compras que no creó ni uno que ya tiene usuarios', async () => {
        await roles().insertOne({ nombre: 'compras', permisos: ['inventario:ver'] })
        expect(await up(db())).toMatchObject({ rol: 'ya-existe' })
        expect(await down(db())).toMatchObject({ rol: 'no-lo-creo' })
        expect(await roles().findOne({ nombre: 'compras' })).toBeTruthy()

        await roles().deleteMany({ nombre: 'compras' })
        await up(db())
        const rol = await roles().findOne({ nombre: 'compras' })
        await db().collection('usuarios').insertOne({ nombre: 'C', correo: 'c@example.com', rol: rol._id })
        expect(await down(db())).toMatchObject({ rol: 'en-uso:1' })
        expect(await roles().findOne({ nombre: 'compras' })).toBeTruthy()
    })
})
