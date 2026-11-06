import { describe, it, expect, beforeEach } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'

let sesion
let usuario
beforeEach(async () => {
    ;({ sesion, usuario } = await crearConSesion('cliente', { telefono: '3001234567' }))
})
const DATOS = { nombre: 'Ana María', apellido: 'Pérez', correo: 'ana.maria@example.com', telefono: '300 765 4321' }

describe('Perfil unificado: /api/v1/cliente/perfil (0.8)', () => {
    it('GET devuelve el perfil con correo, teléfono y rol', async () => {
        const res = await sesion.get('/api/v1/cliente/perfil')
        expect(res.status).toBe(200)
        expect(res.body.perfil).toMatchObject({
            id: String(usuario._id), nombre: 'cliente', correo: usuario.correo, telefono: '3001234567',
            rol: { nombre: 'cliente', etiqueta: 'Cliente' },
        })
        expect(res.body.perfil.createdAt).toBeDefined()
        expect(JSON.stringify(res.body)).not.toMatch(/contraseña|tokenVersion/)
    })

    it('PATCH actualiza y normaliza el correo', async () => {
        const res = await sesion.patch('/api/v1/cliente/perfil').send({ ...DATOS, correo: '  Ana.Maria@Example.COM ' })
        expect(res.status).toBe(200)
        expect(res.body.perfil).toMatchObject({ ...DATOS, correo: 'ana.maria@example.com' })
    })

    it('teléfono: vacío lo borra, omitido lo conserva, inválido → 400', async () => {
        const sinTelefono = { ...DATOS }
        delete sinTelefono.telefono
        expect((await sesion.patch('/api/v1/cliente/perfil').send(sinTelefono)).body.perfil.telefono).toBe('3001234567')
        expect((await sesion.patch('/api/v1/cliente/perfil').send({ ...DATOS, telefono: '' })).body.perfil.telefono).toBe('')
        const malo = await sesion.patch('/api/v1/cliente/perfil').send({ ...DATOS, telefono: '123' })
        expect(malo.status).toBe(400)
        expect(malo.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('correo de otra cuenta (sin importar mayúsculas) → 409', async () => {
        const { usuario: otro } = await crearConSesion('cliente')
        const res = await sesion.patch('/api/v1/cliente/perfil').send({ ...DATOS, correo: otro.correo.toUpperCase() })
        expect(res.status).toBe(409)
    })

    it('PUT /contrasena cambia la contraseña', async () => {
        const res = await sesion.put('/api/v1/cliente/perfil/contrasena').send({ actual: 'secreta123', nueva: 'nueva-clave-1' })
        expect(res.status).toBe(200)
    })

    it('exige sesión', async () => {
        const { api } = await import('./helpers/app.js')
        expect((await api().get('/api/v1/cliente/perfil')).status).toBe(401)
    })
})
