// Los limitadores viven en memoria y se comparten dentro de este archivo:
// cada caso usa correos distintos para no interferir con los demás.
import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { api } from './helpers/app.js'
import Usuario from '../src/modulos/identidad/usuario.model.js'
import Rol from '../src/modulos/identidad/rol.model.js'
import { crearLimiteRegistro, crearLimitesRecuperacion, crearLimitesRestablecimiento } from '../src/modulos/identidad/rateLimit.js'

const crearUsuario = async (correo) => {
    const rol = await Rol.findOne({ nombre: 'cliente' })
    return Usuario.create({
        nombre: 'Test', apellido: 'Rate', correo, contraseña: await bcrypt.hash('secreta123', 4), rol: rol._id,
    })
}

describe('Rate limit de login (5 fallidos / 15 min por IP+correo)', () => {
    it('bloquea el sexto intento fallido con 429 y formato único', async () => {
        await crearUsuario('bloqueo@example.com')
        for (let i = 0; i < 5; i++) {
            const res = await api().post('/api/v1/auth/login').send({ correo: 'bloqueo@example.com', contraseña: 'mala-clave' })
            expect(res.status).toBe(401)
        }
        const sexto = await api().post('/api/v1/auth/login').send({ correo: 'bloqueo@example.com', contraseña: 'secreta123' })
        expect(sexto.status).toBe(429)
        expect(sexto.body.error.code).toBe('TOO_MANY_REQUESTS')

        // Otro correo desde la misma IP no queda bloqueado
        const otro = await api().post('/api/v1/auth/login').send({ correo: 'otro@example.com', contraseña: 'x' })
        expect(otro.status).toBe(401)
    })

    it('los inicios de sesión exitosos no consumen intentos', async () => {
        await crearUsuario('exitoso@example.com')
        for (let i = 0; i < 7; i++) {
            const res = await api().post('/api/v1/auth/login').send({ correo: 'exitoso@example.com', contraseña: 'secreta123' })
            expect(res.status).toBe(200)
        }
    })
})

// 2.8 · Todas las tablets del local salen por la misma IP: lo que se pide con un correo (o un enlace) cuenta
// por IP + correo (o enlace), con un tope más alto por IP para todo el local
const appCon = (limitadores, estado = 202) => {
    const app = express()
    app.use(express.json())
    app.post('/x', ...limitadores, (req, res) => res.status(estado).json({ ok: true }))
    return app
}
const pedir = (app, cuerpo) => request(app).post('/x').send(cuerpo)

describe('Rate limit de registro (30 / hora por IP, 2.8)', () => {
    it('admite 30 registros desde la misma IP (clientes en el wifi del local) y bloquea el 31', async () => {
        const app = appCon([crearLimiteRegistro()], 200)
        for (let i = 0; i < 30; i++) expect((await pedir(app, { correo: `r${i}@example.com` })).status).toBe(200)
        const r = await pedir(app, { correo: 'r30@example.com' })
        expect(r.status).toBe(429)
        expect(r.body.error.code).toBe('TOO_MANY_REQUESTS')
    })

    it('la ruta real lo aplica', async () => {
        const res = await api().post('/api/v1/auth/registro').send({ nombre: 'N', apellido: 'A', correo: 'real@example.com', contraseña: 'secreta123' })
        expect(res.status).toBe(200)
        expect(res.headers.ratelimit).toMatch(/r=29\b/)
    })
})

describe('Rate limit de recuperación de contraseña (3 / hora por IP + correo; 30 / hora por IP, 2.8)', () => {
    it('el cuarto pedido del mismo correo se bloquea, pero otra persona del local sigue pudiendo pedirlo', async () => {
        const app = appCon(crearLimitesRecuperacion())
        for (let i = 0; i < 3; i++) expect((await pedir(app, { correo: 'Ana@Example.com' })).status).toBe(202)
        const cuarta = await pedir(app, { correo: ' ana@example.com ' })
        expect(cuarta.status).toBe(429)
        expect(cuarta.body.error.code).toBe('TOO_MANY_REQUESTS')
        expect((await pedir(app, { correo: 'beto@example.com' })).status).toBe(202)
    })

    it('tope de 30 por IP aunque cada pedido sea de un correo distinto', async () => {
        const app = appCon(crearLimitesRecuperacion())
        for (let i = 0; i < 30; i++) expect((await pedir(app, { correo: `rec${i}@example.com` })).status).toBe(202)
        const r = await pedir(app, { correo: 'rec30@example.com' })
        expect(r.status).toBe(429)
        expect(r.body.error).toMatchObject({ code: 'TOO_MANY_REQUESTS', message: expect.stringMatching(/desde esta conexión/) })
    })

    it('los 429 de una persona que insiste no gastan el tope del local', async () => {
        const app = appCon(crearLimitesRecuperacion())
        for (let i = 0; i < 40; i++) await pedir(app, { correo: 'ana@example.com' })
        expect((await pedir(app, { correo: 'beto@example.com' })).status).toBe(202)
    })

    it('la clave usa como mucho 254 caracteres del correo y solo si es texto (no crece con el cuerpo)', async () => {
        const app = appCon(crearLimitesRecuperacion())
        const largo = 'a'.repeat(300)
        for (let i = 0; i < 3; i++) expect((await pedir(app, { correo: `${largo}${i}` })).status).toBe(202)
        expect((await pedir(app, { correo: `${largo}x` })).status).toBe(429)
        const otra = appCon(crearLimitesRecuperacion())
        for (let i = 0; i < 3; i++) expect((await pedir(otra, { correo: { i } })).status).toBe(202)
        expect((await pedir(otra, { correo: ['x'] })).status).toBe(429)
    })

    it('la ruta real lo aplica', async () => {
        for (let i = 0; i < 3; i++) {
            expect((await api().post('/api/v1/auth/recuperar-contrasena').send({ correo: 'ruta@example.com' })).status).toBe(202)
        }
        expect((await api().post('/api/v1/auth/recuperar-contrasena').send({ correo: 'ruta@example.com' })).status).toBe(429)
        expect((await api().post('/api/v1/auth/recuperar-contrasena').send({ correo: 'otra@example.com' })).status).toBe(202)
    })
})

describe('Rate limit de restablecimiento (5 / hora por IP + enlace; 30 / hora por IP, 2.8)', () => {
    const token = (n) => String(n).padStart(64, 'a')
    it('el sexto intento con el mismo enlace se bloquea; otro enlace desde el local sigue', async () => {
        const app = appCon(crearLimitesRestablecimiento(), 400)
        for (let i = 0; i < 5; i++) expect((await pedir(app, { token: token(1) })).status).toBe(400)
        expect((await pedir(app, { token: token(1) })).status).toBe(429)
        expect((await pedir(app, { token: token(2) })).status).toBe(400)
    })

    it('tope de 30 por IP con enlaces distintos', async () => {
        const app = appCon(crearLimitesRestablecimiento(), 400)
        for (let i = 0; i < 30; i++) expect((await pedir(app, { token: token(i) })).status).toBe(400)
        const r = await pedir(app, { token: token(99) })
        expect(r.status).toBe(429)
        expect(r.body.error).toMatchObject({ code: 'TOO_MANY_REQUESTS', message: expect.stringMatching(/para restablecer/) })
    })

    it('los 429 de un enlace repetido no gastan el tope del local', async () => {
        const app = appCon(crearLimitesRestablecimiento(), 400)
        for (let i = 0; i < 40; i++) await pedir(app, { token: token(1) })
        expect((await pedir(app, { token: token(2) })).status).toBe(400)
    })

    it('la ruta real lo aplica', async () => {
        const ruta = '/api/v1/auth/restablecer-contrasena'
        for (let i = 0; i < 5; i++) {
            const r = await api().post(ruta).send({ token: token(7), nueva: 'secreta123' })
            expect(r.status).toBe(400)
        }
        expect((await api().post(ruta).send({ token: token(7), nueva: 'secreta123' })).status).toBe(429)
        expect((await api().post(ruta).send({ token: token(8), nueva: 'secreta123' })).status).toBe(400)
    })
})
