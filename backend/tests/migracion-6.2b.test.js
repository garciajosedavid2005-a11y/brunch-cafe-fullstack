import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { up, down, DESCRIPCION_ANTERIOR, DESCRIPCION_NUEVA } from '../src/migraciones/m62b-descripcion-cobro.js'
import { PERMISOS } from '../src/modulos/identidad/permisos.js'

// 6.2b · Migración que SOLO cambia la descripción del permiso pedido:cobrar: dry-run no escribe, up → down → up,
// idempotente, no pisa un texto editado y no toca ningún otro campo ni otro permiso
const permisos = () => mongoose.connection.db.collection('permisos')
const cobrar = () => permisos().findOne({ clave: 'pedido:cobrar' })

beforeEach(async () => {
    // Una BD anterior a 6.2b tiene el texto anterior
    await permisos().updateOne({ clave: 'pedido:cobrar' }, { $set: { descripcion: DESCRIPCION_ANTERIOR } })
})

describe('Migración 6.2b (descripción de pedido:cobrar)', () => {
    it('el catálogo del código ya trae el texto nuevo (BD nuevas)', () => {
        expect(PERMISOS.find((p) => p.clave === 'pedido:cobrar').descripcion).toBe(DESCRIPCION_NUEVA)
    })

    it('dry-run no escribe; up → down → up; repetir up no hace nada; solo cambia ese texto', async () => {
        const antes = await cobrar()
        expect(antes).not.toBeNull()
        const otros = await permisos().find({ clave: { $ne: 'pedido:cobrar' } }).sort({ clave: 1 }).toArray()
        const db = mongoose.connection.db
        expect(await up(db, { dryRun: true })).toEqual({ cambiar: 1, aplicado: false })
        expect((await cobrar()).descripcion).toBe(DESCRIPCION_ANTERIOR)
        expect(await up(db)).toEqual({ cambiar: 1, aplicado: true })
        expect(await cobrar()).toEqual({ ...antes, descripcion: DESCRIPCION_NUEVA })
        expect(await up(db)).toEqual({ cambiar: 0, aplicado: false })
        expect(await down(db, { dryRun: true })).toEqual({ cambiar: 1, aplicado: false })
        expect(await down(db)).toEqual({ cambiar: 1, aplicado: true })
        expect(await cobrar()).toEqual(antes)
        expect((await up(db)).aplicado).toBe(true)
        expect(await permisos().find({ clave: { $ne: 'pedido:cobrar' } }).sort({ clave: 1 }).toArray()).toEqual(otros)
    })

    it('no pisa una descripción editada a mano', async () => {
        await permisos().updateOne({ clave: 'pedido:cobrar' }, { $set: { descripcion: 'Texto propio del café.' } })
        expect(await up(mongoose.connection.db)).toEqual({ cambiar: 0, aplicado: false })
        expect(await down(mongoose.connection.db)).toEqual({ cambiar: 0, aplicado: false })
        expect((await cobrar()).descripcion).toBe('Texto propio del café.')
    })
})
