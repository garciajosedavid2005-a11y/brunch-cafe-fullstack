import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './helpers/app.js'
import { crearConSesion } from './helpers/usuarios.js'
import Usuario from '../src/modulos/identidad/usuario.model.js'

const correoMock = vi.hoisted(() => ({ enviar: vi.fn() }))
vi.mock('../src/modulos/identidad/recuperacion.email.js', () => ({
    enviarCorreoRecuperacion: correoMock.enviar,
}))

describe('Recuperación de contraseña por correo', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('responde igual si el correo existe o no y permite usar el enlace una sola vez', async () => {
        const { usuario, sesion } = await crearConSesion('cliente')
        const respuestaDesconocido = await api()
            .post('/api/v1/auth/recuperar-contrasena')
            .send({ correo: 'no-existe@example.com' })
        const respuestaConocido = await api()
            .post('/api/v1/auth/recuperar-contrasena')
            .send({ correo: usuario.correo })

        expect(respuestaDesconocido.status).toBe(202)
        expect(respuestaConocido.status).toBe(202)
        expect(respuestaConocido.body).toEqual(respuestaDesconocido.body)
        expect(correoMock.enviar).toHaveBeenCalledOnce()

        const { url } = correoMock.enviar.mock.calls[0][0]
        const token = new URL(url).searchParams.get('token')
        expect(token).toMatch(/^[a-f0-9]{64}$/)

        const restablecida = await api()
            .post('/api/v1/auth/restablecer-contrasena')
            .send({ token, nueva: 'nueva-clave-segura' })
        expect(restablecida.status).toBe(200)

        const usuarioActualizado = await Usuario.findById(usuario._id)
        expect(usuarioActualizado.tokenVersion).toBe(usuario.tokenVersion + 1)
        expect(usuarioActualizado.passwordResetTokenHash).toBeUndefined()
        expect(usuarioActualizado.passwordResetExpiresAt).toBeUndefined()
        expect((await sesion.get('/api/v1/auth/me')).status).toBe(401)

        const repetida = await api()
            .post('/api/v1/auth/restablecer-contrasena')
            .send({ token, nueva: 'otra-clave-segura' })
        expect(repetida.status).toBe(400)

        const login = await api()
            .post('/api/v1/auth/login')
            .send({ correo: usuario.correo, contraseña: 'nueva-clave-segura' })
        expect(login.status).toBe(200)
    })
})
