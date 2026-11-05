import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import mongoose from 'mongoose'
import { traducirError } from '../src/middlewares/errorHandler.js'
import { AppError, MENSAJE_INTERNO } from '../src/libs/errors.js'

describe('traducirError', () => {
    it('AppError conserva status, code, message y details', () => {
        const r = traducirError(new AppError(409, 'TRANSICION_INVALIDA', 'No permitido', { de: 'a' }))
        expect(r).toEqual({ status: 409, code: 'TRANSICION_INVALIDA', message: 'No permitido', details: { de: 'a' } })
    })

    it('ZodError → VALIDATION_ERROR con campos', () => {
        const err = z.object({ edad: z.number() }).safeParse({ edad: 'x' }).error
        const r = traducirError(err)
        expect(r.status).toBe(400)
        expect(r.code).toBe('VALIDATION_ERROR')
        expect(r.details[0].campo).toBe('edad')
    })

    it('CastError → INVALID_ID', () => {
        const err = new mongoose.Error.CastError('ObjectId', 'abc', '_id')
        expect(traducirError(err)).toMatchObject({ status: 400, code: 'INVALID_ID' })
    })

    it('duplicado 11000 → 409 DUPLICATE sin exponer valores', () => {
        const r = traducirError({ code: 11000, keyValue: { correo: 'a@b.co' } })
        expect(r).toMatchObject({ status: 409, code: 'DUPLICATE', details: { campos: ['correo'] } })
        expect(JSON.stringify(r)).not.toContain('a@b.co')
    })

    it('error genérico → 500 sin filtrar el mensaje interno', () => {
        const r = traducirError(new Error('connection string mongodb://user:pass@host'))
        expect(r).toEqual({ status: 500, code: 'INTERNAL_ERROR', message: MENSAJE_INTERNO })
    })
})
