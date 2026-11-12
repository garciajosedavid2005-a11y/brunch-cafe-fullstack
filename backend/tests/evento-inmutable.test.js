// 1.15 · Los Eventos son inmutables: el modelo no deja actualizarlos, reemplazarlos ni borrarlos. Una
// migración que de verdad lo necesite lo hace de forma explícita con la opción `modificarEventos`
// (un motivo no vacío), documentada en el modelo.
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import Evento from '../src/modulos/compartido/evento.model.js'

const INMUTABLE = /Los Eventos no se pueden modificar ni borrar/
let evento

beforeEach(async () => {
    evento = await Evento.create({ entidad: 'pedido', entidadId: new mongoose.Types.ObjectId(), a: 'pendiente', actor: 'cliente' })
})

const intactoYUnico = async () => {
    const leido = await Evento.findById(evento._id).lean()
    expect(leido).toMatchObject({ a: 'pendiente', actor: 'cliente', motivo: '' })
    expect(await Evento.countDocuments()).toBe(1)
}

describe('Eventos inmutables (1.15)', () => {
    it('crear sigue funcionando (create e insertMany)', async () => {
        await Evento.insertMany([{ entidad: 'mesa', entidadId: new mongoose.Types.ObjectId(), a: 'libre', actor: 'sistema' }])
        expect(await Evento.countDocuments()).toBe(2)
    })

    it.each([
        ['updateOne', () => Evento.updateOne({ _id: evento._id }, { motivo: 'x' })],
        ['updateMany', () => Evento.updateMany({}, { motivo: 'x' })],
        ['findOneAndUpdate', () => Evento.findOneAndUpdate({ _id: evento._id }, { motivo: 'x' })],
        ['findByIdAndUpdate', () => Evento.findByIdAndUpdate(evento._id, { motivo: 'x' })],
        ['replaceOne', () => Evento.replaceOne({ _id: evento._id }, { entidad: 'pedido', entidadId: evento.entidadId, a: 'x', actor: 'x' })],
        ['findOneAndReplace', () => Evento.findOneAndReplace({ _id: evento._id }, { entidad: 'pedido', entidadId: evento.entidadId, a: 'x', actor: 'x' })],
        ['deleteOne', () => Evento.deleteOne({ _id: evento._id })],
        ['deleteMany', () => Evento.deleteMany({})],
        ['findOneAndDelete', () => Evento.findOneAndDelete({ _id: evento._id })],
        ['findByIdAndDelete', () => Evento.findByIdAndDelete(evento._id)],
        ['bulkWrite con updateOne', () => Evento.bulkWrite([{ updateOne: { filter: { _id: evento._id }, update: { motivo: 'x' } } }])],
        ['bulkWrite con deleteOne', () => Evento.bulkWrite([{ deleteOne: { filter: { _id: evento._id } } }])],
        ['save() de un Evento ya guardado', async () => { const doc = await Evento.findById(evento._id); doc.motivo = 'x'; return doc.save() }],
        ['deleteOne() del documento', async () => (await Evento.findById(evento._id)).deleteOne()],
        ['updateOne() del documento', async () => (await Evento.findById(evento._id)).updateOne({ motivo: 'x' })],
        ['replaceOne() del documento', async () => (await Evento.findById(evento._id)).replaceOne({ entidad: 'pedido', entidadId: evento.entidadId, a: 'x', actor: 'x' })],
        ['bulkSave con un documento cambiado', async () => { const doc = await Evento.findById(evento._id); doc.motivo = 'x'; return Evento.bulkSave([doc]) }],
    ])('%s → rechazado y el Evento sigue igual', async (_caso, operacion) => {
        await expect(operacion()).rejects.toMatchObject({ status: 500, code: 'EVENTO_INMUTABLE', message: expect.stringMatching(INMUTABLE) })
        await intactoYUnico()
    })

    it('un bulkWrite que solo inserta sí se permite', async () => {
        await Evento.bulkWrite([{ insertOne: { document: { entidad: 'mesa', entidadId: new mongoose.Types.ObjectId(), a: 'libre', actor: 'sistema' } } }])
        expect(await Evento.countDocuments()).toBe(2)
    })

    it('con un motivo explícito (modificarEventos) una migración sí puede; sin motivo, no', async () => {
        await expect(Evento.updateOne({ _id: evento._id }, { motivo: 'x' }, { modificarEventos: '' })).rejects.toThrow(INMUTABLE)
        await expect(Evento.updateOne({ _id: evento._id }, { motivo: 'x' }, { modificarEventos: '   ' })).rejects.toThrow(INMUTABLE)
        await Evento.updateOne({ _id: evento._id }, { motivo: 'corregido' }, { modificarEventos: 'migración de prueba' })
        expect((await Evento.findById(evento._id).lean()).motivo).toBe('corregido')
        // bulkWrite también admite el motivo (y lo exige no vacío)
        await expect(Evento.bulkWrite([{ updateOne: { filter: { _id: evento._id }, update: { motivo: 'y' } } }], { modificarEventos: '' })).rejects.toThrow(INMUTABLE)
        await Evento.bulkWrite([{ updateOne: { filter: { _id: evento._id }, update: { motivo: 'por bulkWrite' } } }], { modificarEventos: 'migración de prueba' })
        expect((await Evento.findById(evento._id).lean()).motivo).toBe('por bulkWrite')
        await Evento.deleteMany({}).setOptions({ modificarEventos: 'migración de prueba: --down' })
        expect(await Evento.countDocuments()).toBe(0)
    })
})
