// Cuenta del usuario: datos (GET /api/v1/cliente/perfil) y cambio de contraseña
import { describe, it, expect } from 'vitest'
import { agente } from './helpers/app.js'
import { crearConSesion } from './helpers/usuarios.js'

describe('Mi cuenta', () => {
    it('GET /api/v1/cliente/perfil trae rol y fecha de registro, sin contraseña', async () => {
        const { sesion } = await crearConSesion('mesero')
        const res = await sesion.get('/api/v1/cliente/perfil')
        expect(res.status).toBe(200)
        expect(res.body.perfil.rol).toMatchObject({ nombre: 'mesero', etiqueta: 'Mesero' })
        expect(new Date(res.body.perfil.createdAt).getTime()).not.toBeNaN()
        expect(res.body.perfil).not.toHaveProperty('contraseña')
    })

    it('cambiar contraseña exige la actual correcta y luego permite entrar con la nueva', async () => {
        const { usuario, sesion } = await crearConSesion('cliente')
        const mala = await sesion.put('/api/v1/cliente/perfil/contrasena').send({ actual: 'otra-cosa', nueva: 'nueva12345' })
        expect(mala.status).toBe(400)
        expect(mala.body.error.message).toBe('La contraseña actual no es correcta.')

        const corta = await sesion.put('/api/v1/cliente/perfil/contrasena').send({ actual: 'secreta123', nueva: '123' })
        expect(corta.status).toBe(400)

        const ok = await sesion.put('/api/v1/cliente/perfil/contrasena').send({ actual: 'secreta123', nueva: 'nueva12345' })
        expect(ok.status).toBe(200)

        const login = await agente().post('/api/v1/auth/login').send({ correo: usuario.correo, contraseña: 'nueva12345' })
        expect(login.status).toBe(200)
        const vieja = await agente().post('/api/v1/auth/login').send({ correo: usuario.correo, contraseña: 'secreta123' })
        expect(vieja.status).toBe(401)
    })

    it('sin sesión → 401', async () => {
        expect((await agente().put('/api/v1/cliente/perfil/contrasena').send({ actual: 'a', nueva: 'b12345' })).status).toBe(401)
    })
})

describe('Etiqueta del rol en la sesión (0.7b)', () => {
    it('/auth/me y el login incluyen la etiqueta del rol', async () => {
        const { usuario, sesion } = await crearConSesion('mesero')
        const me = await sesion.get('/api/v1/auth/me')
        expect(me.body.user).toMatchObject({ role: 'mesero', roleLabel: 'Mesero' })
        const login = await agente().post('/api/v1/auth/login').send({ correo: usuario.correo, contraseña: 'secreta123' })
        expect(login.body).toMatchObject({ rol: 'mesero', rolEtiqueta: 'Mesero' })
    })
})
