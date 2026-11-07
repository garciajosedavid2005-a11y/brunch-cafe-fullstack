import { describe, it, expect, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import Usuario from '../src/modulos/identidad/usuario.model.js'
import { crearConSesion } from './helpers/usuarios.js'
import { api, agente } from './helpers/app.js'

// 1.1b · Cerrar sesión (y «Cambiar de usuario», que usa el mismo endpoint) revoca el token del
// personal al instante: sube tokenVersion. Así una cookie copiada de una tablet deja de servir.
const cookieDe = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('token='))?.split(';')[0]

const loginCon = async (rol) => {
    const { usuario } = await crearConSesion(rol)
    const sesion = agente()
    const res = await sesion.post('/api/v1/auth/login').send({ correo: usuario.correo, contraseña: 'secreta123' })
    expect(res.status).toBe(200)
    return { usuario, sesion, cookie: cookieDe(res) }
}
const perfilCon = (cookie) => api().get('/api/v1/cliente/perfil').set('Cookie', cookie)

describe('Cerrar sesión revoca el token del personal (1.1b)', () => {
    it.each(['mesero', 'anfitrion', 'admin'])('%s: tras cerrar sesión, la cookie anterior recibe 401', async (rol) => {
        const { sesion, cookie } = await loginCon(rol)
        expect((await perfilCon(cookie)).status).toBe(200)

        expect((await sesion.post('/api/v1/auth/logout')).status).toBe(200)

        const res = await perfilCon(cookie)
        expect(res.status).toBe(401)
        expect(res.body.error.code).toBe('SESSION_REVOKED')
    })

    it('también cierra las otras sesiones del mismo usuario (aceptado para el personal)', async () => {
        const { usuario, sesion } = await loginCon('mesero')
        const otra = agente()
        await otra.post('/api/v1/auth/login').send({ correo: usuario.correo, contraseña: 'secreta123' })
        await sesion.post('/api/v1/auth/logout')
        expect((await otra.get('/api/v1/cliente/perfil')).status).toBe(401)
    })

    it('el cliente no cambia: cerrar sesión no cierra sus otros dispositivos', async () => {
        const { usuario, sesion, cookie } = await loginCon('cliente')
        await sesion.post('/api/v1/auth/logout')
        expect((await Usuario.findById(usuario._id)).tokenVersion || 0).toBe(0)
        expect((await perfilCon(cookie)).status).toBe(200)
    })

    it('sin cookie, con un token inválido o ya revocado responde 200 y borra la cookie', async () => {
        expect((await api().post('/api/v1/auth/logout')).status).toBe(200)
        const invalido = await api().post('/api/v1/auth/logout').set('Cookie', 'token=no-es-un-jwt')
        expect(invalido.status).toBe(200)
        expect(invalido.headers['set-cookie'].join(';')).toMatch(/token=;/)

        const { usuario, sesion, cookie } = await loginCon('mesero')
        await sesion.post('/api/v1/auth/logout')
        const tv = (await Usuario.findById(usuario._id)).tokenVersion
        // Repetir el cierre con la cookie ya revocada no vuelve a subir la versión
        expect((await api().post('/api/v1/auth/logout').set('Cookie', cookie)).status).toBe(200)
        expect((await Usuario.findById(usuario._id)).tokenVersion).toBe(tv)
    })

    it('un token firmado por otro secreto no revoca nada', async () => {
        const { usuario, cookie } = await loginCon('mesero')
        const falso = jwt.sign({ id: String(usuario._id), tv: 0 }, 'otro-secreto', { expiresIn: '1h' })
        expect((await api().post('/api/v1/auth/logout').set('Cookie', `token=${falso}`)).status).toBe(200)
        expect((await perfilCon(cookie)).status).toBe(200)
    })
})

describe('Cierre de sesión robusto (revisión de seguridad de 1.1b)', () => {
    it('una lectura de sesión que empezó antes de la revocación no deja la versión vieja en la caché', async () => {
        const { obtenerSesion, invalidarSesionUsuario } = await import('../src/modulos/identidad/sesiones.js')
        const { usuario, cookie } = await loginCon('mesero')
        const lectura = obtenerSesion(usuario._id) // lee la BD con tokenVersion 0…
        await Usuario.updateOne({ _id: usuario._id }, { $inc: { tokenVersion: 1 } }) // …el logout la sube
        invalidarSesionUsuario(usuario._id)
        await lectura // la lectura vieja termina después de la invalidación
        const res = await perfilCon(cookie)
        expect(res.status).toBe(401)
        expect(res.body.error.code).toBe('SESSION_REVOKED')
    })

    it('si la BD falla al revocar, igual responde 200 y borra la cookie', async () => {
        const { sesion } = await loginCon('mesero')
        const espia = vi.spyOn(Usuario, 'updateOne').mockRejectedValueOnce(new Error('BD caída'))
        const res = await sesion.post('/api/v1/auth/logout')
        espia.mockRestore()
        expect(res.status).toBe(200)
        expect(res.headers['set-cookie'].join(';')).toMatch(/token=;/)
    })

    it('desde un origen que no es el del frontend no revoca nada (CSRF si alguna vez sameSite=none)', async () => {
        const { cookie } = await loginCon('mesero')
        const res = await api().post('/api/v1/auth/logout').set('Cookie', cookie).set('Origin', 'https://sitio-ajeno.example')
        expect(res.status).toBe(200)
        expect((await perfilCon(cookie)).status).toBe(200)
    })

    it('desde el origen del frontend sí revoca', async () => {
        const { cookie } = await loginCon('mesero')
        await api().post('/api/v1/auth/logout').set('Cookie', cookie).set('Origin', 'http://localhost:5173')
        expect((await perfilCon(cookie)).status).toBe(401)
    })

    it('un token que ya superó la duración del rol actual no revoca (solo un token vigente)', async () => {
        const { usuario, cookie } = await loginCon('mesero')
        const admin = await (await import('../src/modulos/identidad/rol.model.js')).default.findOne({ nombre: 'admin' })
        await Usuario.updateOne({ _id: usuario._id }, { rol: admin._id })
        const { limpiarCacheSesiones } = await import('../src/modulos/identidad/sesiones.js')
        limpiarCacheSesiones()
        vi.setSystemTime(new Date(Date.now() + 3 * 3600 * 1000)) // > 2 h del admin, < 12 h del token
        await api().post('/api/v1/auth/logout').set('Cookie', cookie)
        expect((await Usuario.findById(usuario._id)).tokenVersion || 0).toBe(0)
    })
})
