import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { up, down, MARCA, POR_DEFECTO } from '../src/migraciones/m37-opcion-por-defecto.js'

// 3.7 · Migración: opción por defecto (Leche → Entera y Tamaño → Normal) en los grupos ya guardados
const db = () => mongoose.connection.db
const grupos = () => db().collection('grupos_modificadores')
const porGrupo = (resultado) => Object.fromEntries(resultado.grupos.map((g) => [g.grupo, g]))
const marcas = async (nombre) => (await grupos().findOne({ nombre })).opciones.map((o) => o.porDefecto)
const opciones = (...nombres) => nombres.map((nombre) => ({ _id: new mongoose.Types.ObjectId(), nombre, precioExtra: 0, disponible: true }))

beforeEach(async () => {
    // Grupos como los dejó el seed antes de 3.7 (sin el campo porDefecto)
    await grupos().insertMany([
        { nombre: 'Leche', obligatorio: false, min: 0, max: 1, activo: true, ejemplo: true, opciones: opciones('Entera', 'Deslactosada', 'Almendra'), __v: 0 },
        { nombre: 'Tamaño', obligatorio: false, min: 0, max: 1, activo: true, ejemplo: true, opciones: opciones('Normal', 'Grande'), __v: 0 },
        { nombre: 'Extras', obligatorio: false, min: 0, max: 4, activo: true, ejemplo: true, opciones: opciones('Queso', 'Tocineta'), __v: 0 },
    ])
})

describe('Migración 3.7 (opción por defecto)', () => {
    it('down revierte aunque el admin haya renombrado el grupo después de up', async () => {
        await up(db())
        await grupos().updateOne({ nombre: 'Leche' }, { $set: { nombre: 'Leches' } })
        expect(porGrupo(await down(db())).Leches).toMatchObject({ opcion: 'Entera', aplicado: true })
        expect(await marcas('Leches')).toEqual([undefined, undefined, undefined])
    })

    it('solo asigna Leche → Entera y Tamaño → Normal', () => {
        expect(POR_DEFECTO).toEqual([{ grupo: 'Leche', opcion: 'Entera' }, { grupo: 'Tamaño', opcion: 'Normal' }])
    })

    it('--dry-run informa sin escribir', async () => {
        const antes = await grupos().find().sort({ nombre: 1 }).toArray()
        const r = porGrupo(await up(db(), { dryRun: true }))
        expect(r.Leche).toMatchObject({ accion: 'asignar', aplicado: false })
        expect(r['Tamaño']).toMatchObject({ accion: 'asignar', aplicado: false })
        expect(await grupos().find().sort({ nombre: 1 }).toArray()).toEqual(antes)
    })

    it('up marca solo esas opciones, es idempotente y down deja todo como estaba; up → down → up', async () => {
        const antes = await grupos().find().sort({ nombre: 1 }).toArray()
        const r = porGrupo(await up(db()))
        expect(r.Leche.aplicado && r['Tamaño'].aplicado).toBe(true)
        expect(await marcas('Leche')).toEqual([true, undefined, undefined])
        expect(await marcas('Tamaño')).toEqual([true, undefined])
        expect(await marcas('Extras')).toEqual([undefined, undefined])
        expect(porGrupo(await up(db())).Leche.accion).toBe('ya-aplicada')

        expect(porGrupo(await down(db())).Leche).toMatchObject({ aplicado: true, quitar: true })
        expect((await grupos().findOne({ nombre: 'Leche' }))[MARCA]).toBeUndefined()
        const despues = await grupos().find().sort({ nombre: 1 }).toArray()
        // Igual que antes salvo __v (sube en cada paso para que una edición abierta entre en conflicto)
        const sinVersion = (lista) => lista.map(({ __v, ...g }) => g)
        expect(sinVersion(despues)).toEqual(sinVersion(antes))

        expect(porGrupo(await up(db())).Leche.aplicado).toBe(true)
        expect(await marcas('Leche')).toEqual([true, undefined, undefined])
    })

    it('si el admin ya eligió otra opción por defecto o el grupo admite varias, no lo toca', async () => {
        await grupos().updateOne({ nombre: 'Leche' }, { $set: { 'opciones.1.porDefecto': true } })
        await grupos().updateOne({ nombre: 'Tamaño' }, { $set: { max: 2 } })
        const r = porGrupo(await up(db()))
        expect(r.Leche).toMatchObject({ accion: 'ya-tiene', aplicado: false })
        expect(r['Tamaño']).toMatchObject({ accion: 'no-unica', aplicado: false })
        expect(await marcas('Leche')).toEqual([undefined, true, undefined])
        expect(porGrupo(await down(db())).Leche).toBeUndefined() // up no marcó nada: down no toca nada
    })
})
