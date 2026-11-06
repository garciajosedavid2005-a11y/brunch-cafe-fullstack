// tokenVersion: cambiar la contraseña o desactivar a un usuario cierra sus sesiones
import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'
import { agente } from './helpers/app.js'
import { crearConSesion } from './helpers/usuarios.js'
import Usuario from '../src/modulos/identidad/usuario.model.js'

const iniciar = async (correo, contraseña = 'secreta123') => {
    const sesion = agente()
    const res = await sesion.post('/api/auth/login').send({ correo, contraseña })
    expect(res.status).toBe(200)
    return sesion
}

describe('Revocación de sesiones (tokenVersion)', () => {
    it('cambiar la contraseña cierra las otras sesiones y renueva la actual', async () => {
        const { usuario, sesion: actual } = await crearConSesion('cliente')
        const otra = await iniciar(usuario.correo)
        expect((await otra.get('/api/auth/me')).status).toBe(200)

        const cambio = await actual.put('/api/usuarios/perfil/contrasena').send({ actual: 'secreta123', nueva: 'nueva12345' })
        expect(cambio.status).toBe(200)
        expect(cambio.headers['set-cookie']?.[0]).toMatch(/^token=/)

        const revocada = await otra.get('/api/auth/me')
        expect(revocada.status).toBe(401)
        expect(revocada.body.error.code).toBe('SESSION_REVOKED')
        expect((await actual.get('/api/auth/me')).status).toBe(200)
    })

    it('desactivar a un usuario revoca sus tokens aunque luego se reactive', async () => {
        const { sesion: admin } = await crearConSesion('admin')
        const { usuario } = await crearConSesion('cliente')
        const login = await agente().post('/api/auth/login').send({ correo: usuario.correo, contraseña: 'secreta123' })
        const cookieVieja = login.headers['set-cookie'][0].split(';')[0]
        const conTokenViejo = () => agente().get('/api/auth/me').set('Cookie', cookieVieja)

        await admin.patch(`/api/admin/usuarios/${usuario._id}`).send({ activo: false })
        expect((await conTokenViejo()).status).toBe(401)

        await admin.patch(`/api/admin/usuarios/${usuario._id}`).send({ activo: true })
        const tras = await conTokenViejo()
        expect(tras.status).toBe(401)
        expect(tras.body.error.code).toBe('SESSION_REVOKED')
        // Puede volver a entrar con su contraseña
        expect((await (await iniciar(usuario.correo)).get('/api/auth/me')).status).toBe(200)
    })

    it('cambiar solo el rol no cierra la sesión', async () => {
        const { sesion: admin } = await crearConSesion('admin')
        const { usuario, sesion } = await crearConSesion('cliente')
        const { default: Rol } = await import('../src/modulos/identidad/rol.model.js')
        const mesero = await Rol.findOne({ nombre: 'mesero' })
        await admin.patch(`/api/admin/usuarios/${usuario._id}`).send({ rolId: String(mesero._id) })
        expect((await sesion.get('/api/auth/me')).status).toBe(200)
    })

    it('el token lleva la versión y uno sin versión (anterior a 0.7c) vale como versión 0', async () => {
        const { usuario } = await crearConSesion('cliente')
        const login = await agente().post('/api/auth/login').send({ correo: usuario.correo, contraseña: 'secreta123' })
        const token = login.headers['set-cookie'][0].split(';')[0].split('=')[1]
        expect(jwt.decode(token)).toMatchObject({ id: String(usuario._id), tv: 0 })

        const viejo = jwt.sign({ id: String(usuario._id) }, process.env.JWT_SECRET, { expiresIn: '1h' })
        expect((await agente().get('/api/auth/me').set('Cookie', `token=${viejo}`)).status).toBe(200)

        await Usuario.updateOne({ _id: usuario._id }, { $inc: { tokenVersion: 1 } })
        const { invalidarSesionUsuario } = await import('../src/modulos/identidad/sesiones.js')
        invalidarSesionUsuario(usuario._id)
        expect((await agente().get('/api/auth/me').set('Cookie', `token=${viejo}`)).status).toBe(401)
    })
})
