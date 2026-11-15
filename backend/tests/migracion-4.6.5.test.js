import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { up, down, DESCRIPCION_ANTERIOR, DESCRIPCION_NUEVA } from '../src/migraciones/m465-texto-no-show.js'
import { CATALOGO_ESTADOS } from '../src/modulos/compartido/estados.js'

// 4.6.5 · Migración que SOLO cambia la descripción de «No asistió»: dry-run no escribe, up → down → up, idempotente,
// no pisa un texto editado y no toca ningún otro campo ni otro estado
const estados = () => mongoose.connection.db.collection('estados')
const noShow = () => estados().findOne({ tipo: 'reserva', codigo: 'no_show' })

beforeEach(async () => {
    // Una BD anterior a 4.6.5 tiene el texto anterior
    await estados().updateOne({ tipo: 'reserva', codigo: 'no_show' }, { $set: { descripcion: DESCRIPCION_ANTERIOR } })
})

describe('Migración 4.6.5 (descripción de «No asistió»)', () => {
    it('el catálogo del código ya trae el texto nuevo (BD nuevas)', () => {
        expect(CATALOGO_ESTADOS.reserva.find((e) => e.codigo === 'no_show').descripcion).toBe(DESCRIPCION_NUEVA)
    })

    it('dry-run no escribe; up → down → up; repetir up no hace nada; solo cambia ese texto', async () => {
        const antes = await noShow()
        const otros = await estados().find({ codigo: { $ne: 'no_show' } }).toArray()
        expect(await up(mongoose.connection.db, { dryRun: true })).toEqual({ cambiar: 1, aplicado: false })
        expect((await noShow()).descripcion).toBe(DESCRIPCION_ANTERIOR)
        expect(await up(mongoose.connection.db)).toEqual({ cambiar: 1, aplicado: true })
        expect(await noShow()).toEqual({ ...antes, descripcion: DESCRIPCION_NUEVA })
        expect(await up(mongoose.connection.db)).toEqual({ cambiar: 0, aplicado: false })
        expect(await down(mongoose.connection.db, { dryRun: true })).toEqual({ cambiar: 1, aplicado: false })
        expect(await down(mongoose.connection.db)).toEqual({ cambiar: 1, aplicado: true })
        expect(await noShow()).toEqual(antes)
        expect((await up(mongoose.connection.db)).aplicado).toBe(true)
        expect(await estados().find({ codigo: { $ne: 'no_show' } }).toArray()).toEqual(otros)
    })

    it('no pisa una descripción editada a mano', async () => {
        await estados().updateOne({ tipo: 'reserva', codigo: 'no_show' }, { $set: { descripcion: 'Texto propio del café.' } })
        expect(await up(mongoose.connection.db)).toEqual({ cambiar: 0, aplicado: false })
        expect(await down(mongoose.connection.db)).toEqual({ cambiar: 0, aplicado: false })
        expect((await noShow()).descripcion).toBe('Texto propio del café.')
    })
})
