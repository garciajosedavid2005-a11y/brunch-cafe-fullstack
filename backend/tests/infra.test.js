import { describe, it, expect } from 'vitest'
import { api } from './helpers/app.js'

describe('Infraestructura HTTP', () => {
    it('GET /api/health responde ok', async () => {
        const res = await api().get('/api/health')
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ status: 'ok', entorno: 'test' })
    })

    it('ruta inexistente → 404 con formato único', async () => {
        const res = await api().get('/api/no-existe')
        expect(res.status).toBe(404)
        expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' })
        expect(typeof res.body.error.message).toBe('string')
    })

    it('JSON mal formado → 400 INVALID_JSON', async () => {
        const res = await api()
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .send('{"correo": ')
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('INVALID_JSON')
    })

    it('validación Zod → 400 VALIDATION_ERROR con details por campo', async () => {
        const res = await api().post('/api/auth/login').send({ correo: 'no-es-correo', contraseña: '123456' })
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('VALIDATION_ERROR')
        expect(res.body.error.details).toEqual(
            expect.arrayContaining([expect.objectContaining({ campo: 'correo' })])
        )
    })

    it('respuestas heredadas { message } salen con formato único', async () => {
        const res = await api().get('/api/customer/profile')
        expect(res.status).toBe(401)
        expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED', message: expect.any(String) } })
    })

    it('las respuestas exitosas no se alteran', async () => {
        const res = await api().get('/api/productos/menu')
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ categorias: [], productos: [] })
    })
})
