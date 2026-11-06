// Los limitadores viven en memoria y se comparten dentro de este archivo:
// cada caso usa correos distintos para no interferir con los demás.
import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'
import { api } from './helpers/app.js'
import Usuario from '../src/modulos/identidad/usuario.model.js'
import Rol from '../src/modulos/identidad/rol.model.js'

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

describe('Rate limit de registro (10 / hora por IP)', () => {
    it('bloquea el undécimo registro', async () => {
        for (let i = 0; i < 10; i++) {
            const res = await api().post('/api/v1/auth/registro').send({
                nombre: 'N', apellido: 'A', correo: `r${i}@example.com`, contraseña: 'secreta123',
            })
            expect(res.status).toBe(200)
        }
        const once = await api().post('/api/v1/auth/registro').send({
            nombre: 'N', apellido: 'A', correo: 'r10@example.com', contraseña: 'secreta123',
        })
        expect(once.status).toBe(429)
        expect(once.body.error.code).toBe('TOO_MANY_REQUESTS')
    })
})

describe('Rate limit de recuperación de contraseña (5 / hora por IP)', () => {
    it('bloquea la sexta solicitud con 429 y formato único', async () => {
        for (let i = 0; i < 5; i++) {
            const res = await api().post('/api/v1/auth/recuperar-contrasena').send({ correo: `rec${i}@example.com` })
            expect(res.status).toBe(202)
        }
        const sexta = await api().post('/api/v1/auth/recuperar-contrasena').send({ correo: 'rec5@example.com' })
        expect(sexta.status).toBe(429)
        expect(sexta.body.error.code).toBe('TOO_MANY_REQUESTS')
    })
})
