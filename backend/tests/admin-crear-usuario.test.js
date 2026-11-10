import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { api } from './helpers/app.js'
import { crearConSesion, rolId } from './helpers/usuarios.js'
import Usuario from '../src/modulos/identidad/usuario.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { config } from '../src/config.js'
import { logger } from '../src/modulos/compartido/logger.js'
import { esperarAltasPendientes } from '../src/modulos/identidad/altaUsuario.service.js'

// 1.5b · Admin › Usuarios › «Crear usuario» (usuario:gestionar). El admin no escribe la contraseña:
// la cuenta nace sin contraseña utilizable y recibe un enlace «Crea tu contraseña» (24 h, un solo
// uso) por el flujo de recuperación; en desarrollo sin SMTP el enlace sale en el log.
const correoMock = vi.hoisted(() => ({ enviar: vi.fn(), configurado: vi.fn() }))
vi.mock('../src/modulos/identidad/recuperacion.email.js', async (original) => ({
    ...(await original()),
    enviarCorreoCreacion: correoMock.enviar,
    smtpConfigurado: correoMock.configurado,
}))

const RUTA = '/api/v1/admin/usuarios'
const entornoOriginal = config.NODE_ENV
const tokenDe = (url) => new URL(url).searchParams.get('token')
const conToken = (correo) => Usuario.findOne({ correo }).select('+passwordResetTokenHash +passwordResetExpiresAt +contraseña')

let admin
let adminUsuario
let datos
beforeEach(async () => {
    vi.clearAllMocks()
    correoMock.configurado.mockReturnValue(true)
    correoMock.enviar.mockResolvedValue(undefined)
    await Usuario.init()
    ;({ sesion: admin, usuario: adminUsuario } = await crearConSesion('admin'))
    datos = { nombre: 'Laura', apellido: 'Gómez', correo: 'Laura.Gomez@Example.com', telefono: '3001234567', rolId: await rolId('mesero') }
})
afterEach(async () => {
    config.NODE_ENV = entornoOriginal
    await esperarAltasPendientes()
})

const crear = (cuerpo = datos, sesion = admin) => sesion.post(RUTA).send(cuerpo)

describe('Crear usuario desde el admin', () => {
    it('crea la cuenta sin contraseña utilizable, con el rol elegido y un Evento con quién la creó', async () => {
        const res = await crear()
        expect(res.status, JSON.stringify(res.body)).toBe(201)
        expect(res.body).toMatchObject({ nombre: 'Laura', apellido: 'Gómez', correo: 'laura.gomez@example.com', telefono: '3001234567', activo: true, rol: { codigo: 'mesero' } })
        expect(JSON.stringify(res.body)).not.toMatch(/token|contrase/i)

        const usuario = await conToken('laura.gomez@example.com')
        // Ninguna contraseña sirve para entrar (ni vacía ni el correo)
        for (const intento of ['', 'secreta123', 'laura.gomez@example.com']) {
            expect(await bcrypt.compare(intento, usuario.contraseña)).toBe(false)
        }
        const login = await api().post('/api/v1/auth/login').send({ correo: 'laura.gomez@example.com', contraseña: 'secreta123' })
        expect(login.status).toBe(401)

        const evento = await Evento.findOne({ entidad: 'usuario', entidadId: usuario._id }).lean()
        expect(evento).toMatchObject({ tipo: 'usuario_creado', usuario: adminUsuario._id, actor: 'admin' })
        expect(JSON.stringify(evento.datos)).not.toMatch(/laura/i) // sin el correo en la bitácora
    })

    it('envía «Crea tu contraseña» con un enlace de un solo uso que vence en 24 h', async () => {
        await crear()
        await esperarAltasPendientes()
        expect(correoMock.enviar).toHaveBeenCalledTimes(1)
        const { url, correo, nombre } = correoMock.enviar.mock.calls[0][0]
        expect({ correo, nombre }).toEqual({ correo: 'laura.gomez@example.com', nombre: 'Laura' })
        expect(new URL(url).searchParams.get('tipo')).toBe('crear')

        const usuario = await conToken('laura.gomez@example.com')
        const horas = (usuario.passwordResetExpiresAt - Date.now()) / 3_600_000
        expect(horas).toBeGreaterThan(23.9)
        expect(horas).toBeLessThanOrEqual(24)

        const definir = () => api().post('/api/v1/auth/restablecer-contrasena').send({ token: tokenDe(url), nueva: 'mi-clave-nueva-1' })
        expect((await definir()).status).toBe(200)
        expect((await api().post('/api/v1/auth/login').send({ correo: 'laura.gomez@example.com', contraseña: 'mi-clave-nueva-1' })).status).toBe(200)
        const segunda = await definir()
        expect(segunda.status).toBe(400)
        expect(segunda.body.error.code).toBe('RESET_TOKEN_INVALID')
    })

    it('el correo dice «Crea tu contraseña» y que vence en 24 horas', async () => {
        const { textoCorreoCreacion } = await vi.importActual('../src/modulos/identidad/recuperacion.email.js')
        const { asunto, texto } = textoCorreoCreacion({ nombre: 'Laura', url: 'http://x/restablecer-contrasena?token=t&tipo=crear' })
        expect(asunto).toMatch(/Crea tu contraseña/)
        expect(texto).toMatch(/Crea tu contraseña/)
        expect(texto).toMatch(/24 horas/)
        expect(texto).toContain('http://x/restablecer-contrasena?token=t&tipo=crear')
    })

    it('en desarrollo sin SMTP el enlace sale en el log (sin el correo) y no se envía nada', async () => {
        config.NODE_ENV = 'development'
        correoMock.configurado.mockReturnValue(false)
        const info = vi.spyOn(logger, 'info')
        const res = await crear()
        expect(res.body.entrega).toBe('registro_desarrollo')
        await esperarAltasPendientes()
        expect(correoMock.enviar).not.toHaveBeenCalled()
        const linea = info.mock.calls.find(([, mensaje]) => /Crea tu contraseña/.test(mensaje))
        expect(linea[0].enlace).toMatch(/token=/)
        expect(JSON.stringify(linea)).not.toMatch(/laura\.gomez/i)
        info.mockRestore()
    })

    it('correo ya registrado (sin importar mayúsculas) → 409 USUARIO_EXISTENTE', async () => {
        expect((await crear()).status).toBe(201)
        const res = await crear({ ...datos, correo: 'LAURA.GOMEZ@example.com' })
        expect(res.status).toBe(409)
        expect(res.body.error).toMatchObject({ code: 'USUARIO_EXISTENTE' })
        expect(res.body.error.message).toMatch(/ya está registrado/i)
        expect(await Usuario.countDocuments({ correo: 'laura.gomez@example.com' })).toBe(1)
    })

    it('valida los campos y no acepta otros (contraseña, activo…)', async () => {
        for (const cuerpo of [
            { ...datos, correo: 'no-es-correo' },
            { ...datos, nombre: '' },
            { ...datos, rolId: 'xyz' },
            { ...datos, telefono: '12' },
            { ...datos, contraseña: 'yo-la-pongo' },
            { ...datos, activo: false },
        ]) {
            const res = await crear(cuerpo)
            expect(res.status, JSON.stringify(cuerpo)).toBe(400)
        }
        const sinTelefono = { ...datos }
        delete sinTelefono.telefono
        expect((await crear(sinTelefono)).status).toBe(201)
        const sinRol = await crear({ ...datos, correo: 'otro@example.com', rolId: '65a000000000000000000000' })
        expect(sinRol.status).toBe(400)
        expect(sinRol.body.error.code).toBe('ROL_NO_VALIDO')
        expect(await Usuario.countDocuments({ correo: { $in: ['laura.gomez@example.com', 'otro@example.com'] } })).toBe(1)
    })

    it('sin usuario:gestionar → 403; sin sesión → 401', async () => {
        const { sesion: mesero } = await crearConSesion('mesero')
        const res = await crear(datos, mesero)
        expect(res.status).toBe(403)
        expect(res.body.error.code).toBe('FORBIDDEN')
        expect((await api().post(RUTA).send(datos)).status).toBe(401)
        expect(await Usuario.countDocuments({ correo: 'laura.gomez@example.com' })).toBe(0)
    })

    it('solo quien tiene * puede crear un administrador', async () => {
        const { sesion: gestor } = await crearConSesion('mesero')
        const { default: Rol } = await import('../src/modulos/identidad/rol.model.js')
        await Rol.updateOne({ nombre: 'mesero' }, { $addToSet: { permisos: 'usuario:gestionar' } })
        const { limpiarCacheSesiones } = await import('../src/modulos/identidad/sesiones.js')
        limpiarCacheSesiones()
        const comoAdmin = await crear({ ...datos, rolId: await rolId('admin') }, gestor)
        expect(comoAdmin.status).toBe(403)
        expect((await crear({ ...datos, rolId: await rolId('cliente') }, gestor)).status).toBe(201)
        expect((await crear({ ...datos, correo: 'jefe@example.com', rolId: await rolId('admin') })).status).toBe(201)

        // Ni un rol con permisos que el gestor no tiene, ni ascender a alguien a él (PATCH)
        const gerente = await Rol.create({ nombre: 'gerente', etiqueta: 'Gerente', permisos: ['rol:gestionar'] })
        const alta = await crear({ ...datos, correo: 'gerente@example.com', rolId: String(gerente._id) }, gestor)
        expect(alta.status).toBe(403)
        const cliente = await Usuario.findOne({ correo: 'laura.gomez@example.com' })
        const ascenso = await gestor.patch(`${RUTA}/${cliente._id}`).send({ rolId: String(gerente._id) })
        expect(ascenso.status).toBe(403)
        expect(String((await Usuario.findById(cliente._id)).rol)).toBe(await rolId('cliente'))

        // Tampoco desactiva ni degrada a quien tiene más permisos que él (un admin)
        for (const cambio of [{ activo: false }, { rolId: await rolId('cliente') }]) {
            const res = await gestor.patch(`${RUTA}/${adminUsuario._id}`).send(cambio)
            expect(res.status).toBe(403)
        }
        const adminSigue = await Usuario.findById(adminUsuario._id).populate('rol', 'nombre')
        expect({ activo: adminSigue.activo, rol: adminSigue.rol.nombre }).toEqual({ activo: true, rol: 'admin' })
    })

    it('fuera de desarrollo y sin SMTP: no se envía ni se escribe el enlace en el log (entrega sin_smtp)', async () => {
        config.NODE_ENV = 'production'
        correoMock.configurado.mockReturnValue(false)
        const info = vi.spyOn(logger, 'info')
        const res = await crear()
        expect(res.status).toBe(201)
        expect(res.body.entrega).toBe('sin_smtp')
        await esperarAltasPendientes()
        expect(correoMock.enviar).not.toHaveBeenCalled()
        expect(info.mock.calls.some(([obj]) => obj && typeof obj === 'object' && 'enlace' in obj)).toBe(false)
        info.mockRestore()
    })

    it('si el Evento no se puede guardar, tampoco queda la cuenta (misma transacción)', async () => {
        const espia = vi.spyOn(Evento, 'create').mockRejectedValueOnce(new Error('falla simulada'))
        const res = await crear()
        expect(res.status).toBe(500)
        expect(await Usuario.countDocuments({ correo: 'laura.gomez@example.com' })).toBe(0)
        expect(correoMock.enviar).not.toHaveBeenCalled()
        espia.mockRestore()
    })
})
