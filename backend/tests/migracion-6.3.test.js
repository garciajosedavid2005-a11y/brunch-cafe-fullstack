import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { up, down, MARCA, INDICE_NUEVO, INDICE_VIEJO } from '../src/migraciones/m63-para-llevar.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'

// 6.3 · Migración que solo agrega cuenta:para_llevar (mesero y cajero) y deja el índice de mesa abierta solo para el
// salón: dry-run no escribe, up → down → up, idempotente y no toca ningún documento de cuentas
const db = () => mongoose.connection.db
const roles = () => db().collection('rols')
const nombresIndices = async () => (await db().collection('cuentas').indexes()).map((i) => i.name)

beforeEach(async () => {
    // Una BD anterior a 6.3: los roles sin el permiso y el índice viejo, sin canal
    await roles().updateMany({ nombre: { $in: ['mesero', 'cajero'] } }, { $pull: { permisos: 'cuenta:para_llevar' } })
    await Cuenta.createIndexes()
    await db().collection('cuentas').dropIndex(INDICE_NUEVO.nombre)
    await db().collection('cuentas').createIndex({ 'mesas.mesa': 1 }, { unique: true, partialFilterExpression: INDICE_VIEJO.filtro, name: INDICE_VIEJO.nombre })
    await db().collection('cuentas').insertOne({ codigo: 'C-000001', canal: 'salon', estado: 'cerrada', mesas: [] })
})

describe('Migración 6.3 (para llevar)', () => {
    it('dry-run no escribe; up → down → up; repetir up no hace nada; las cuentas no cambian', async () => {
        const cuentasAntes = await db().collection('cuentas').find().toArray()
        const permisosDe = async (nombre) => (await roles().findOne({ nombre })).permisos
        const meseroAntes = await permisosDe('mesero')

        const simulacro = await up(db(), { dryRun: true })
        expect(simulacro.roles.map((r) => [r.nombre, r.accion])).toEqual([['mesero', 'agregar'], ['cajero', 'agregar']])
        expect(simulacro.indice).toEqual({ crear: true, quitar: true, aplicado: false })
        expect(await permisosDe('mesero')).toEqual(meseroAntes)
        expect(await nombresIndices()).toContain(INDICE_VIEJO.nombre)

        const r = await up(db())
        expect(r.indice.aplicado).toBe(true)
        expect(await permisosDe('mesero')).toContain('cuenta:para_llevar')
        expect(await permisosDe('cajero')).toContain('cuenta:para_llevar')
        expect(await nombresIndices()).toEqual(expect.arrayContaining([INDICE_NUEVO.nombre]))
        expect(await nombresIndices()).not.toContain(INDICE_VIEJO.nombre)
        expect((await up(db())).roles.map((x) => x.accion)).toEqual(['ya-aplicada', 'ya-aplicada'])

        const d = await down(db())
        expect(d.indice.aplicado).toBe(true)
        expect(await permisosDe('mesero')).toEqual(meseroAntes)
        expect((await roles().findOne({ nombre: 'mesero' }))[MARCA]).toBeUndefined()
        expect(await nombresIndices()).toContain(INDICE_VIEJO.nombre)
        expect(await nombresIndices()).not.toContain(INDICE_NUEVO.nombre)

        expect((await up(db())).indice.aplicado).toBe(true)
        expect(await db().collection('cuentas').find().toArray()).toEqual(cuentasAntes)
    })

    it('no agrega a un rol que ya lo tiene; down no revierte nada con dos para llevar abiertas', async () => {
        await roles().updateOne({ nombre: 'cajero' }, { $addToSet: { permisos: 'cuenta:para_llevar' } })
        const r = await up(db())
        expect(r.roles.find((x) => x.nombre === 'cajero').accion).toBe('sin-cambios')
        await db().collection('cuentas').insertMany([
            { codigo: 'C-000002', canal: 'para_llevar', estado: 'abierta', mesas: [] },
            { codigo: 'C-000003', canal: 'para_llevar', estado: 'abierta', mesas: [] },
        ])
        const d = await down(db())
        expect(d.indice).toMatchObject({ aplicado: false, bloqueo: 'hay varias cuentas para llevar abiertas' })
        expect(await nombresIndices()).toContain(INDICE_NUEVO.nombre)
        // Bloqueado: no revierte nada, tampoco los permisos que agregó up (el mesero lo conserva)
        expect((await roles().findOne({ nombre: 'mesero' })).permisos).toContain('cuenta:para_llevar')
        expect((await roles().findOne({ nombre: 'mesero' }))[MARCA]).toBeDefined()
        expect((await roles().findOne({ nombre: 'cajero' })).permisos).toContain('cuenta:para_llevar')
    })

    it('up no cambia el índice si hay una cuenta abierta sin canal (no la rellena)', async () => {
        await db().collection('cuentas').insertOne({ codigo: 'C-000009', estado: 'abierta', mesas: [] })
        const r = await up(db())
        expect(r.indice).toMatchObject({ aplicado: false, bloqueo: '1 cuenta(s) abierta(s) sin canal' })
        expect(await nombresIndices()).toContain(INDICE_VIEJO.nombre)
        expect(await db().collection('cuentas').findOne({ codigo: 'C-000009' })).not.toHaveProperty('canal')
    })
})
