import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { api, agente } from './helpers/app.js'
import Usuario from '../src/models/usuario.model.js'
import MenuImage from '../src/modulos/catalogo/menuImage.model.js'

const datos = (extra = {}) => ({
    nombre: 'Luis',
    apellido: 'Gómez',
    correo: 'luis@example.com',
    contraseña: 'secreta123',
    ...extra,
})

const cookieDe = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('token=')) || ''

describe('Cookie de sesión', () => {
    it('es httpOnly, SameSite=Lax, dura 2 h y no es Secure fuera de producción', async () => {
        const res = await api().post('/api/auth/registro').send(datos())
        expect(res.status).toBe(200)
        const cookie = cookieDe(res)
        expect(cookie).toMatch(/HttpOnly/i)
        expect(cookie).toMatch(/SameSite=Lax/i)
        expect(cookie).toMatch(/Max-Age=7200/)
        expect(cookie).not.toMatch(/Secure/i)
    })

    it('logout borra la cookie', async () => {
        const res = await api().post('/api/auth/logout')
        expect(res.status).toBe(200)
        expect(cookieDe(res)).toMatch(/Expires=Thu, 01 Jan 1970/)
    })
})

describe('Mensajes que no revelan cuentas', () => {
    it('login: correo inexistente y contraseña incorrecta responden igual', async () => {
        await api().post('/api/auth/registro').send(datos())
        const inexistente = await api().post('/api/auth/login').send({ correo: 'nadie@example.com', contraseña: 'secreta123' })
        const incorrecta = await api().post('/api/auth/login').send({ correo: 'luis@example.com', contraseña: 'otra-clave' })
        expect(inexistente.status).toBe(401)
        expect(incorrecta.status).toBe(401)
        expect(inexistente.body).toEqual(incorrecta.body)
        expect(inexistente.body.error.code).toBe('CREDENCIALES_INVALIDAS')
    })

    it('registro con correo existente da un mensaje genérico', async () => {
        await api().post('/api/auth/registro').send(datos())
        const res = await api().post('/api/auth/registro').send(datos({ correo: 'LUIS@example.com' }))
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('REGISTRO_NO_DISPONIBLE')
        expect(res.body.error.message).not.toMatch(/existe/i)
        expect(cookieDe(res)).toBe('')
    })
})

describe('Normalización del correo (N2)', () => {
    it('se guarda en minúsculas y sin espacios; el login acepta mayúsculas', async () => {
        await api().post('/api/auth/registro').send(datos({ correo: '  Luis.G@Example.COM ' }))
        const guardado = await Usuario.findOne({}).lean()
        expect(guardado.correo).toBe('luis.g@example.com')

        const res = await api().post('/api/auth/login').send({ correo: 'LUIS.G@example.com', contraseña: 'secreta123' })
        expect(res.status).toBe(200)
    })

    it('cuentas antiguas guardadas con mayúsculas siguen pudiendo entrar', async () => {
        await api().post('/api/auth/registro').send(datos({ correo: 'temporal@example.com' }))
        // Simula un registro antiguo, sin normalizar (escritura directa sin setters)
        await mongoose.connection.db.collection('usuarios').updateOne({}, { $set: { correo: 'Antiguo@Example.com' } })

        const res = await api().post('/api/auth/login').send({ correo: 'antiguo@example.com', contraseña: 'secreta123' })
        expect(res.status).toBe(200)
    })
})

describe('Token', () => {
    it('token inválido → 401 INVALID_TOKEN y borra la cookie', async () => {
        const res = await api().get('/api/auth/me').set('Cookie', 'token=basura')
        expect(res.status).toBe(401)
        expect(res.body.error.code).toBe('INVALID_TOKEN')
        expect(cookieDe(res)).toMatch(/Expires=Thu, 01 Jan 1970/)
    })

    it('token vencido → 401 SESSION_EXPIRED', async () => {
        const vencido = jwt.sign(
            { id: new mongoose.Types.ObjectId(), rol: 'cliente', exp: Math.floor(Date.now() / 1000) - 60 },
            process.env.JWT_SECRET
        )
        const res = await api().get('/api/auth/me').set('Cookie', `token=${vencido}`)
        expect(res.status).toBe(401)
        expect(res.body.error.code).toBe('SESSION_EXPIRED')
    })

    it('sesión válida funciona con el agente', async () => {
        const sesion = agente()
        await sesion.post('/api/auth/registro').send(datos())
        const me = await sesion.get('/api/auth/me')
        expect(me.status).toBe(200)
    })
})

describe('Cabeceras de seguridad y CORS', () => {
    it('helmet activo y sin x-powered-by', async () => {
        const res = await api().get('/api/health')
        expect(res.headers['x-content-type-options']).toBe('nosniff')
        expect(res.headers['cross-origin-resource-policy']).toBe('same-site')
        expect(res.headers['x-powered-by']).toBeUndefined()
    })

    it('CORS solo autoriza los orígenes configurados', async () => {
        const permitido = await api().get('/api/health').set('Origin', 'http://localhost:5173')
        expect(permitido.headers['access-control-allow-origin']).toBe('http://localhost:5173')
        expect(permitido.headers['access-control-allow-credentials']).toBe('true')

        const ajeno = await api().get('/api/health').set('Origin', 'https://malicioso.example')
        expect(ajeno.headers['access-control-allow-origin']).toBeUndefined()
    })

    it('las imágenes del menú permiten carga cross-origin', async () => {
        await MenuImage.create({ nombre: 'latte.png', contentType: 'image/png', data: Buffer.from([137, 80, 78, 71]) })
        const res = await api().get('/api/productos/menu/imagenes/latte.png')
        expect(res.status).toBe(200)
        expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin')
    })

    it('mensajes Zod en español con concordancia (N1)', async () => {
        const res = await api().post('/api/auth/login').send({ correo: 'a@b.co' })
        expect(res.body.error.message).toBe('La contraseña es requerida')
    })
})
