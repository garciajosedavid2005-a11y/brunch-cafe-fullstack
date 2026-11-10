import { describe, it, expect, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import Rol from '../src/modulos/identidad/rol.model.js'
import Usuario from '../src/modulos/identidad/usuario.model.js'
import { crearConSesion } from './helpers/usuarios.js'
import { api } from './helpers/app.js'

// 1.1 · F1-10: sesión de 12 h para el personal sin "*"; clientes y admin siguen con 2 h.
const HORA = 3600
const AHORA_PRUEBAS = new Date('2026-11-05T12:30:00Z') // el mismo reloj fijo de helpers/setup.js

const cookieDe = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('token='))
const maxAge = (cookie) => Number(/Max-Age=(\d+)/.exec(cookie)?.[1])
const duracionToken = (cookie) => {
    const { iat, exp } = jwt.decode(cookie.slice('token='.length).split(';')[0])
    return exp - iat
}

const login = async (rol) => {
    const { usuario, sesion } = await crearConSesion(rol)
    // Se repite el login para leer la cookie de la respuesta
    const res = await sesion.post('/api/v1/auth/login').send({ correo: usuario.correo, contraseña: 'secreta123' })
    expect(res.status).toBe(200)
    return { usuario, sesion, cookie: cookieDe(res) }
}

const avanzar = (segundos) => vi.setSystemTime(new Date(AHORA_PRUEBAS.getTime() + segundos * 1000))

// El token se envía a mano: el agente de supertest descarta la cookie vencida y así se
// prueba lo que decide el servidor (alguien podría reenviar un token guardado)
const perfilCon = (cookie) => api().get('/api/v1/cliente/perfil').set('Cookie', cookie.split(';')[0])
const limpiarCache = async () => (await import('../src/modulos/identidad/sesiones.js')).limpiarCacheSesiones()
const cambiarRol = async (usuario, nombre) => {
    const rol = await Rol.findOne({ nombre })
    await Usuario.updateOne({ _id: usuario._id }, { rol: rol._id })
    await limpiarCache()
}

describe('Duración de la sesión según el rol (F1-10)', () => {
    it.each([
        ['mesero', 12],
        ['barista', 12],
        ['cocina', 12],
        ['cliente', 2],
        ['admin', 2],
    ])('%s: cookie y token de %i h', async (rol, horas) => {
        const { cookie } = await login(rol)
        expect(maxAge(cookie)).toBe(horas * HORA)
        expect(duracionToken(cookie)).toBe(horas * HORA)
    })

    it('un rol de personal creado por el admin (sin "*") también tiene 12 h', async () => {
        await Rol.create({ nombre: 'supervisor', etiqueta: 'Supervisor', permisos: ['pedido:ver'] })
        const { cookie } = await login('supervisor')
        expect(maxAge(cookie)).toBe(12 * HORA)
    })

    it('el mesero sigue con sesión a las 11 h y la pierde a las 12 h', async () => {
        const { cookie } = await login('mesero')
        avanzar(11 * HORA)
        expect((await perfilCon(cookie)).status).toBe(200)
        avanzar(12 * HORA + 1)
        const res = await perfilCon(cookie)
        expect(res.status).toBe(401)
        expect(res.body.error.code).toBe('SESSION_EXPIRED')
    })

    it('si el mesero pasa a cliente, su token de 12 h deja de valer a las 2 h', async () => {
        const { usuario, cookie } = await login('mesero')
        await cambiarRol(usuario, 'cliente')
        avanzar(HORA)
        expect((await perfilCon(cookie)).status).toBe(200)
        avanzar(2 * HORA + 1)
        await limpiarCache()
        const res = await perfilCon(cookie)
        expect(res.status).toBe(401)
        expect(res.body.error.code).toBe('SESSION_EXPIRED')
    })

    it('si el mesero pasa a admin, su token vale como el de un admin (2 h)', async () => {
        const { usuario, cookie } = await login('mesero')
        await cambiarRol(usuario, 'admin')
        avanzar(2 * HORA + 1)
        const res = await perfilCon(cookie)
        expect(res.status).toBe(401)
        expect(res.body.error.code).toBe('SESSION_EXPIRED')
    })

    it('cambiar la contraseña renueva la sesión del mesero con 12 h', async () => {
        const { sesion } = await login('mesero')
        const res = await sesion.put('/api/v1/cliente/perfil/contrasena')
            .send({ actual: 'secreta123', nueva: 'nuevaClave456' })
        expect(res.status).toBe(200)
        expect(maxAge(cookieDe(res))).toBe(12 * HORA)
    })
})

describe('Formato de las duraciones de sesión en el .env (1.1)', () => {
    it('exige número y unidad (s, m, h o d), como entiende duracionEnMs', async () => {
        const { duracionSchema } = await import('../src/config.js')
        for (const valido of ['2h', '12h', '30m', '45s', '7d', '12H']) expect(duracionSchema.safeParse(valido).success, valido).toBe(true)
        // Sin unidad, jsonwebtoken lo tomaría como milisegundos y duracionEnMs como segundos
        for (const invalido of ['12', '12 h', '1.5h', '2 hours', '', 'h', '0h', '0s', '00m']) expect(duracionSchema.safeParse(invalido).success, invalido).toBe(false)
    })
})
