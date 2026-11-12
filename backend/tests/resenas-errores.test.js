// 1.15 · Errores de reseñas con el formato estándar de las cuentas y del pedido:
// { error: { code, message, details } }, validación como VALIDATION_ERROR con [{ campo, mensaje }].
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import Comentario from '../src/modulos/catalogo/comentario.model.js'

const RUTA = '/api/v1/cliente/comentarios'
let cliente, admin

beforeEach(async () => {
    ;({ sesion: cliente } = await crearConSesion('cliente'))
    ;({ sesion: admin } = await crearConSesion('admin'))
})

describe('Errores de reseñas con el formato estándar (1.15)', () => {
    it('validación → 400 VALIDATION_ERROR con el mensaje del primer campo y details [{ campo, mensaje }]', async () => {
        const res = await cliente.post(RUTA).send({ tipo: 'general', calificacion: 9, comentario: 'Muy rico y bien servido' })
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('VALIDATION_ERROR')
        expect(Array.isArray(res.body.error.details)).toBe(true)
        expect(res.body.error.details[0]).toEqual({ campo: 'calificacion', mensaje: 'La calificación debe ser un número entero de 1 a 5.' })
        expect(res.body.error.message).toBe(res.body.error.details[0].mensaje)
    })

    it('mensajes en español también para el comentario y al editar', async () => {
        const corto = await cliente.post(RUTA).send({ tipo: 'general', calificacion: 5, comentario: 'Rico' })
        expect(corto.status).toBe(400)
        expect(corto.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'El comentario debe tener al menos 10 caracteres.' })
        const edicion = await cliente.patch(`${RUTA}/${new mongoose.Types.ObjectId()}`).send({ calificacion: 0, comentario: 'Muy rico y bien servido' })
        expect(edicion.status).toBe(400)
        expect(edicion.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'La calificación debe ser un número entero de 1 a 5.' })
    })

    it('un producto que no existe → 404 PRODUCTO_NO_ENCONTRADO (como el pedido y las cuentas)', async () => {
        const res = await cliente.post(RUTA).send({
            tipo: 'producto', productoRef: String(new mongoose.Types.ObjectId()), calificacion: 5, comentario: 'Muy rico y bien servido',
        })
        expect(res.status).toBe(404)
        expect(res.body.error).toMatchObject({ code: 'PRODUCTO_NO_ENCONTRADO', message: 'El producto seleccionado no existe en el menú.' })
        expect(await Comentario.countDocuments()).toBe(0)
    })

    it.each([
        ['sin tipo', { calificacion: 5, comentario: 'Muy rico y bien servido' }],
        ['con un tipo desconocido', { tipo: 'otro', calificacion: 5, comentario: 'Muy rico y bien servido' }],
    ])('%s → el mensaje en español del tipo', async (_caso, cuerpo) => {
        const res = await cliente.post(RUTA).send(cuerpo)
        expect(res.status).toBe(400)
        const mensaje = 'Elige si la reseña es general o de un producto.'
        expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: mensaje })
        expect(res.body.error.details[0]).toEqual({ campo: 'tipo', mensaje })
    })

    it('un productoRef mal formado → 400 en el campo productoRef', async () => {
        const res = await cliente.post(RUTA).send({ tipo: 'producto', productoRef: 'no-es-un-id', calificacion: 5, comentario: 'Muy rico y bien servido' })
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('VALIDATION_ERROR')
        expect(res.body.error.details[0].campo).toBe('productoRef')
    })

    it('admin: ocultar o borrar una reseña que no existe → 404 NOT_FOUND con el formato estándar', async () => {
        const id = new mongoose.Types.ObjectId()
        for (const res of [
            await admin.patch(`/api/v1/admin/comentarios/${id}/visibilidad`).send({ visible: false }),
            await admin.delete(`/api/v1/admin/comentarios/${id}`),
            await admin.delete('/api/v1/admin/comentarios/no-es-un-id'),
        ]) {
            expect(res.status).toBe(404)
            expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Comentario no encontrado.' } })
        }
    })
})
