// 0.16: la confirmación de reserva la envía el backend por SMTP (antes, EmailJS desde el navegador)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import { datosReserva } from './helpers/datos.js'
import Reserva from '../src/modulos/salon/reserva.model.js'
import { config } from '../src/config.js'
import { logger } from '../src/modulos/compartido/logger.js'
import { esperarNotificacionesReserva } from '../src/modulos/salon/reservas.correo.js'

const smtp = vi.hoisted(() => ({ enviar: vi.fn(), configurado: vi.fn() }))
vi.mock('../src/modulos/compartido/correo.js', () => ({ enviarCorreo: smtp.enviar, smtpConfigurado: smtp.configurado }))

const entornoOriginal = config.NODE_ENV

describe('Confirmación de reserva por correo (0.16)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        smtp.configurado.mockReturnValue(true)
        smtp.enviar.mockResolvedValue(undefined)
    })

    afterEach(async () => {
        config.NODE_ENV = entornoOriginal
        await esperarNotificacionesReserva()
    })

    it('se envía al correo de la reserva, con sus datos, después de guardarla', async () => {
        const { sesion } = await crearConSesion('cliente')
        const res = await sesion.post('/api/v1/cliente/reservas').send(datosReserva({ correo: 'ana.reserva@example.com', personas: 3 }))
        expect(res.status).toBe(201)
        await esperarNotificacionesReserva()

        expect(smtp.enviar).toHaveBeenCalledOnce()
        const correo = smtp.enviar.mock.calls[0][0]
        expect(correo.para).toBe('ana.reserva@example.com')
        expect(correo.asunto).toMatch(/reserva/i)
        expect(correo.texto).toMatch(/Ana Pérez/)
        expect(correo.texto).toMatch(/3 personas/)
        expect(correo.texto).toMatch(/9:00 a\.\s?m\./)
        expect(correo.texto).toMatch(/pendiente de confirmación/i)
    })

    it('responde sin esperar el envío', async () => {
        const { sesion } = await crearConSesion('cliente')
        let liberar
        smtp.enviar.mockImplementation(() => new Promise((resolver) => { liberar = resolver }))
        const res = await sesion.post('/api/v1/cliente/reservas').send(datosReserva()).timeout(2000)
        expect(res.status).toBe(201)
        await vi.waitFor(() => expect(smtp.enviar).toHaveBeenCalledOnce())
        liberar()
    })

    it('no se envía si la reserva no tiene correo (registrada por el personal)', async () => {
        const { sesion } = await crearConSesion('mesero')
        const res = await sesion.post('/api/v1/staff/reservas').send(datosReserva({ correo: '' }))
        expect(res.status).toBe(201)
        await esperarNotificacionesReserva()
        expect(smtp.enviar).not.toHaveBeenCalled()
    })

    it('un fallo de SMTP no rompe la reserva: se guarda y el error queda en el log sin el correo', async () => {
        const { sesion } = await crearConSesion('cliente')
        const errorLog = vi.spyOn(logger, 'error')
        smtp.enviar.mockRejectedValue(Object.assign(new Error('SMTP caído'), { code: 'ECONNECTION' }))

        const res = await sesion.post('/api/v1/cliente/reservas').send(datosReserva({ correo: 'falla@example.com' }))
        expect(res.status).toBe(201)
        await esperarNotificacionesReserva()

        expect(await Reserva.countDocuments({ _id: res.body.reservation._id })).toBe(1)
        expect(errorLog).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'ECONNECTION', reservaId: String(res.body.reservation._id) }), expect.any(String))
        expect(JSON.stringify(errorLog.mock.calls)).not.toContain('falla@example.com')
    })

    it('en desarrollo y sin SMTP, el contenido del correo va al log (sin la dirección) y no se envía', async () => {
        config.NODE_ENV = 'development'
        smtp.configurado.mockReturnValue(false)
        const infoLog = vi.spyOn(logger, 'info')
        const { sesion } = await crearConSesion('cliente')

        await sesion.post('/api/v1/cliente/reservas').send(datosReserva({ correo: 'dev@example.com' }))
        await esperarNotificacionesReserva()

        expect(smtp.enviar).not.toHaveBeenCalled()
        const llamada = infoLog.mock.calls.find(([datos]) => datos?.contenido)
        expect(llamada?.[0].contenido).toMatch(/Ana Pérez/)
        expect(JSON.stringify(llamada)).not.toContain('dev@example.com')
    })

    it('fuera de desarrollo y sin SMTP, no se envía ni se escribe el contenido en el log', async () => {
        config.NODE_ENV = 'production'
        smtp.configurado.mockReturnValue(false)
        const infoLog = vi.spyOn(logger, 'info')
        const { sesion } = await crearConSesion('cliente')

        expect((await sesion.post('/api/v1/cliente/reservas').send(datosReserva())).status).toBe(201)
        await esperarNotificacionesReserva()

        expect(smtp.enviar).not.toHaveBeenCalled()
        expect(infoLog.mock.calls.some(([datos]) => datos?.contenido)).toBe(false)
    })
})
