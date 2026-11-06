// El límite de recuperación (5 solicitudes por hora por IP) se comparte dentro de cada archivo:
// por eso los casos se reparten entre recuperacion-contrasena y recuperacion-envio.test.js.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './helpers/app.js'
import { crearConSesion } from './helpers/usuarios.js'
import Usuario from '../src/modulos/identidad/usuario.model.js'
import { config } from '../src/config.js'
import { esperarRecuperacionesPendientes } from '../src/modulos/identidad/recuperacion.service.js'

const correoMock = vi.hoisted(() => ({ enviar: vi.fn(), configurado: vi.fn() }))
vi.mock('../src/modulos/identidad/recuperacion.email.js', () => ({
    enviarCorreoRecuperacion: correoMock.enviar,
    smtpConfigurado: correoMock.configurado,
}))

const solicitar = (correo) => api().post('/api/v1/auth/recuperar-contrasena').send({ correo })
const restablecer = (token, nueva = 'nueva-clave-segura') =>
    api().post('/api/v1/auth/restablecer-contrasena').send({ token, nueva })
const tokenDe = (url) => new URL(url).searchParams.get('token')

const entornoOriginal = config.NODE_ENV

describe('Recuperación de contraseña por correo', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        correoMock.configurado.mockReturnValue(true)
        correoMock.enviar.mockResolvedValue(undefined)
    })

    afterEach(async () => {
        config.NODE_ENV = entornoOriginal
        await esperarRecuperacionesPendientes()
    })

    it('responde igual si el correo existe o no y permite usar el enlace una sola vez', async () => {
        const { usuario, sesion } = await crearConSesion('cliente')
        const respuestaDesconocido = await solicitar('no-existe@example.com')
        const respuestaConocido = await solicitar(usuario.correo)

        expect(respuestaDesconocido.status).toBe(202)
        expect(respuestaConocido.status).toBe(202)
        expect(respuestaConocido.body).toEqual(respuestaDesconocido.body)
        await esperarRecuperacionesPendientes()
        expect(correoMock.enviar).toHaveBeenCalledOnce()

        const token = tokenDe(correoMock.enviar.mock.calls[0][0].url)
        expect(token).toMatch(/^[a-f0-9]{64}$/)

        expect((await restablecer(token)).status).toBe(200)

        const usuarioActualizado = await Usuario.findById(usuario._id)
        expect(usuarioActualizado.tokenVersion).toBe(usuario.tokenVersion + 1)
        expect(usuarioActualizado.passwordResetTokenHash).toBeUndefined()
        expect(usuarioActualizado.passwordResetExpiresAt).toBeUndefined()
        expect((await sesion.get('/api/v1/auth/me')).status).toBe(401)

        expect((await restablecer(token, 'otra-clave-segura')).status).toBe(400)

        const login = await api()
            .post('/api/v1/auth/login')
            .send({ correo: usuario.correo, contraseña: 'nueva-clave-segura' })
        expect(login.status).toBe(200)
    })

    it('el enlace vence a los 30 minutos', async () => {
        const { usuario } = await crearConSesion('cliente')
        await solicitar(usuario.correo)
        await esperarRecuperacionesPendientes()
        const token = tokenDe(correoMock.enviar.mock.calls[0][0].url)

        vi.setSystemTime(Date.now() + 31 * 60 * 1000)
        const res = await restablecer(token)
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('RESET_TOKEN_INVALID')
    })

    it('el hash del token tiene índice (la búsqueda no recorre toda la colección)', () => {
        const indices = Usuario.schema.indexes().map(([campos]) => Object.keys(campos))
        expect(indices).toContainEqual(['passwordResetTokenHash'])
    })
})
