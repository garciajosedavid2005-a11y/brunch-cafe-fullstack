// El límite de recuperación (5 solicitudes por hora por IP) se comparte dentro de cada archivo:
// por eso los casos se reparten entre recuperacion-contrasena y recuperacion-envio.test.js.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './helpers/app.js'
import { crearConSesion } from './helpers/usuarios.js'
import Usuario from '../src/modulos/identidad/usuario.model.js'
import { config } from '../src/config.js'
import { logger } from '../src/modulos/compartido/logger.js'
import { esperarRecuperacionesPendientes } from '../src/modulos/identidad/recuperacion.service.js'

const correoMock = vi.hoisted(() => ({ enviar: vi.fn(), configurado: vi.fn(), crear: vi.fn() }))
vi.mock('../src/modulos/identidad/recuperacion.email.js', () => ({
    enviarCorreoRecuperacion: correoMock.enviar,
    enviarCorreoCreacion: correoMock.crear,
    smtpConfigurado: correoMock.configurado,
}))

const solicitar = (correo) => api().post('/api/v1/auth/recuperar-contrasena').send({ correo })
const restablecer = (token, nueva = 'nueva-clave-segura') =>
    api().post('/api/v1/auth/restablecer-contrasena').send({ token, nueva })
const tokenDe = (url) => new URL(url).searchParams.get('token')
const conToken = (id) => Usuario.findById(id).select('+passwordResetTokenHash +passwordResetExpiresAt')

const entornoOriginal = config.NODE_ENV

describe('Recuperación de contraseña: envío del enlace (0.15c)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        correoMock.configurado.mockReturnValue(true)
        correoMock.enviar.mockResolvedValue(undefined)
        correoMock.crear.mockResolvedValue(undefined)
    })

    afterEach(async () => {
        config.NODE_ENV = entornoOriginal
        await esperarRecuperacionesPendientes()
    })

    // 0.15c: si se esperara al SMTP, el tiempo de respuesta revelaría qué correos tienen cuenta
    it('responde sin esperar el envío del correo', async () => {
        const { usuario } = await crearConSesion('cliente')
        let liberar
        correoMock.enviar.mockImplementation(() => new Promise((resolver) => { liberar = resolver }))

        const res = await solicitar(usuario.correo).timeout(2000)
        expect(res.status).toBe(202)

        await vi.waitFor(() => expect(correoMock.enviar).toHaveBeenCalledOnce())
        liberar()
    })

    // Pendiente de 2.8: espera mínima de 60 s entre correos a la misma cuenta (también desde varias IP).
    // La respuesta no cambia (no revela si la cuenta existe) y el enlace ya enviado sigue valiendo.
    it('dentro de los 60 s no envía otro correo ni cambia el enlace; pasado el minuto, sí', async () => {
        const { usuario } = await crearConSesion('cliente')
        expect((await solicitar(usuario.correo)).status).toBe(202)
        await esperarRecuperacionesPendientes()
        const primero = (await conToken(usuario._id)).passwordResetTokenHash
        expect(correoMock.enviar).toHaveBeenCalledOnce()

        expect((await solicitar(usuario.correo)).status).toBe(202)
        await esperarRecuperacionesPendientes()
        expect(correoMock.enviar).toHaveBeenCalledOnce()
        expect((await conToken(usuario._id)).passwordResetTokenHash).toBe(primero)

        // Pasa el minuto (se atrasa la marca de la última solicitud)
        await Usuario.updateOne({ _id: usuario._id }, { $set: { passwordResetSolicitadoEn: new Date(Date.now() - 61_000) } })
        expect((await solicitar(usuario.correo)).status).toBe(202)
        await esperarRecuperacionesPendientes()
        expect(correoMock.enviar).toHaveBeenCalledTimes(2)
        expect((await conToken(usuario._id)).passwordResetTokenHash).not.toBe(primero)
    })

    // 2.10d (Brayan) · Quien aún no creó su contraseña recibe otra vez «Crea tu contraseña» (24 h), no un
    // enlace de recuperación de 30 min que acortaría el que le mandó el admin
    it('con «Crea tu contraseña» pendiente envía de nuevo ese enlace de 24 h, no uno de recuperación', async () => {
        const { usuario } = await crearConSesion('mesero', { contraseñaPendiente: true })
        const antes = Date.now()
        expect((await solicitar(usuario.correo)).status).toBe(202)
        await esperarRecuperacionesPendientes()
        expect(correoMock.enviar).not.toHaveBeenCalled()
        expect(correoMock.crear).toHaveBeenCalledOnce()
        const url = new URL(correoMock.crear.mock.calls[0][0].url)
        expect(url.searchParams.get('tipo')).toBe('crear')
        const guardado = await conToken(usuario._id)
        // La espera de 60 s también vale aquí: otra solicitud no reenvía ni cambia el enlace
        await solicitar(usuario.correo)
        await esperarRecuperacionesPendientes()
        expect(correoMock.crear).toHaveBeenCalledOnce()
        expect((await conToken(usuario._id)).passwordResetTokenHash).toBe(guardado.passwordResetTokenHash)
        expect(guardado.passwordResetExpiresAt.getTime() - antes).toBeGreaterThan(23 * 60 * 60 * 1000)
        expect((await restablecer(url.searchParams.get('token'))).status).toBe(200)
        expect((await Usuario.findById(usuario._id).lean()).contraseñaPendiente).toBeUndefined()
    })

    it('dos solicitudes a la vez: un solo correo y un solo enlace', async () => {
        const { usuario } = await crearConSesion('cliente')
        const [r1, r2] = await Promise.all([solicitar(usuario.correo), solicitar(usuario.correo)])
        expect([r1.status, r2.status]).toEqual([202, 202])
        await esperarRecuperacionesPendientes()
        expect(correoMock.enviar).toHaveBeenCalledOnce()
        expect(tokenDe(correoMock.enviar.mock.calls[0][0].url)).toBeTruthy()
    })

    it('si el envío falla se puede volver a pedir enseguida; tras restablecer, también', async () => {
        const { usuario } = await crearConSesion('cliente')
        correoMock.enviar.mockRejectedValueOnce(Object.assign(new Error('SMTP caído'), { code: 'ECONNECTION' }))
        await solicitar(usuario.correo)
        await esperarRecuperacionesPendientes()
        await solicitar(usuario.correo)
        await esperarRecuperacionesPendientes()
        expect(correoMock.enviar).toHaveBeenCalledTimes(2)
        expect((await restablecer(tokenDe(correoMock.enviar.mock.calls[1][0].url))).status).toBe(200)
        await solicitar(usuario.correo)
        await esperarRecuperacionesPendientes()
        expect(correoMock.enviar).toHaveBeenCalledTimes(3)
    })

    it('si el envío falla, invalida el enlace y la respuesta sigue siendo la genérica', async () => {
        const { usuario } = await crearConSesion('cliente')
        const errorLog = vi.spyOn(logger, 'error')
        correoMock.enviar.mockRejectedValue(Object.assign(new Error('SMTP caído'), { code: 'ECONNECTION' }))

        const res = await solicitar(usuario.correo)
        expect(res.status).toBe(202)
        await esperarRecuperacionesPendientes()

        const guardado = await conToken(usuario._id)
        expect(guardado.passwordResetTokenHash).toBeUndefined()
        expect(errorLog).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'ECONNECTION' }), expect.any(String))
        expect(JSON.stringify(errorLog.mock.calls)).not.toContain(usuario.correo)
    })

    it('en desarrollo y sin SMTP, el enlace se muestra en el log (sin el correo) y sigue siendo válido', async () => {
        const { usuario } = await crearConSesion('cliente')
        config.NODE_ENV = 'development'
        correoMock.configurado.mockReturnValue(false)
        const infoLog = vi.spyOn(logger, 'info')

        await solicitar(usuario.correo)
        await esperarRecuperacionesPendientes()

        expect(correoMock.enviar).not.toHaveBeenCalled()
        const llamada = infoLog.mock.calls.find(([datos]) => datos?.enlace)
        expect(llamada).toBeDefined()
        expect(JSON.stringify(llamada)).not.toContain(usuario.correo)
        expect((await restablecer(tokenDe(llamada[0].enlace))).status).toBe(200)
    })

    it('fuera de desarrollo y sin SMTP, el enlace nunca se escribe en el log', async () => {
        const { usuario } = await crearConSesion('cliente')
        config.NODE_ENV = 'production'
        correoMock.configurado.mockReturnValue(false)
        correoMock.enviar.mockRejectedValue(Object.assign(new Error('sin SMTP'), { code: 'SMTP_CONFIG_MISSING' }))
        const infoLog = vi.spyOn(logger, 'info')

        await solicitar(usuario.correo)
        await esperarRecuperacionesPendientes()

        expect(infoLog.mock.calls.some(([datos]) => datos?.enlace)).toBe(false)
        expect((await conToken(usuario._id)).passwordResetTokenHash).toBeUndefined()
    })
})
