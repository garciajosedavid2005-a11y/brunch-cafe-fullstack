// Pendiente aprobado tras 1.12: GET /staff/salon/meseros filtra usuarios por rol (y activo) y debe usar un índice
import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import Usuario from '../src/modulos/identidad/usuario.model.js'

describe('Índice de usuarios por rol', () => {
    it('Usuario declara { rol: 1, activo: 1 } y existe en la BD', async () => {
        expect(Usuario.schema.indexes().map(([campos]) => campos)).toContainEqual({ rol: 1, activo: 1 })
        await Usuario.init()
        const indices = await Usuario.collection.indexes()
        expect(indices.map((i) => i.key)).toContainEqual({ rol: 1, activo: 1 })
        expect(Usuario.collection.collectionName).toBe('usuarios') // no es la colección heredada `users`
    })

    it('la consulta de la lista de meseros usa el índice (sin recorrer la colección)', async () => {
        await Usuario.init()
        const plan = await Usuario.find({ rol: { $in: [new mongoose.Types.ObjectId()] }, activo: { $ne: false } })
            .collation({ locale: 'es' }).explain('queryPlanner') // como GET /meseros
        expect(JSON.stringify(plan)).toMatch(/rol_1_activo_1/)
    })
})
