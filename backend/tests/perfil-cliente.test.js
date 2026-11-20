// 6.4 (F6-8, F6-f, F6-g) · Perfil del cliente: fecha de nacimiento, alergias y preferencias; libreta de direcciones
// (hasta 5, una principal) y consentimiento de datos (Ley 1581) con versión y fecha. El registro exige aceptarlo; un
// cliente sin la versión vigente la acepta antes de seguir (403 CONSENTIMIENTO_PENDIENTE salvo aceptar, /me y perfil).
import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { agente } from './helpers/app.js'
import { crearConSesion } from './helpers/usuarios.js'
import Usuario from '../src/modulos/identidad/usuario.model.js'
import { CONSENTIMIENTO_VERSION } from '../src/modulos/identidad/consentimiento.js'

const REGISTRO = { nombre: 'Ana', apellido: 'Ruiz', correo: 'ana.ruiz@example.com', contraseña: 'secreta123', telefono: '3001234567' }
const DIRECCION = { direccion: 'Cra 36B #30-06', barrio: 'Centro', indicaciones: 'Torre 2', etiqueta: 'Casa' }

describe('6.4 · Consentimiento de datos', () => {
    it('el registro exige aceptar la política: sin la casilla, 400; con ella, guarda versión y fecha', async () => {
        const sin = await agente().post('/api/v1/auth/registro').send(REGISTRO)
        expect(sin.status).toBe(400)
        expect(JSON.stringify(sin.body.error)).toContain('Debes aceptar la política de tratamiento de datos')
        expect(await Usuario.countDocuments({ correo: REGISTRO.correo })).toBe(0)

        const antes = Date.now()
        const r = await agente().post('/api/v1/auth/registro').send({ ...REGISTRO, aceptaDatos: true })
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        expect(r.body.consentimientoPendiente).toBe(false)
        const guardado = await Usuario.findOne({ correo: REGISTRO.correo }).lean()
        expect(guardado.consentimiento.version).toBe(CONSENTIMIENTO_VERSION)
        expect(guardado.consentimiento.aceptadoEn.getTime()).toBeGreaterThanOrEqual(antes - 1000)
    })

    it('cliente sin la versión vigente: login avisa; la API responde 403 salvo /me, perfil y aceptar; al aceptar, sigue', async () => {
        const { sesion, usuario } = await crearConSesion('cliente', { consentimiento: null })
        const login = await agente().post('/api/v1/auth/login').send({ correo: usuario.correo, contraseña: 'secreta123' })
        expect(login.body.consentimientoPendiente).toBe(true)

        const bloqueada = await sesion.get('/api/v1/cliente/pedidos')
        expect(bloqueada.status).toBe(403)
        expect(bloqueada.body.error.code).toBe('CONSENTIMIENTO_PENDIENTE')
        expect((await sesion.patch('/api/v1/cliente/perfil').send({ nombre: 'X', apellido: 'Y', correo: usuario.correo })).status).toBe(403)
        expect((await sesion.get('/api/v1/cliente/perfil')).status).toBe(200)
        const me = await sesion.get('/api/v1/auth/me')
        expect(me.status).toBe(200)
        expect(me.body.user.consentimientoPendiente).toBe(true)

        // La misma ruta con barra final o mayúsculas (Express las enruta igual) sigue permitida; otra ruta, no
        expect((await sesion.get('/api/v1/auth/me/')).status).toBe(200)
        expect((await sesion.get('/api/v1/AUTH/me')).status).toBe(200)
        expect((await sesion.get('/api/v1/cliente/perfil/../pedidos')).status).not.toBe(200)
        expect((await sesion.post('/api/v1/auth/consentimiento').send({ version: '2020-01' })).status).toBe(400)
        const acepta = await sesion.post('/api/v1/auth/consentimiento').send({ version: CONSENTIMIENTO_VERSION })
        expect(acepta.status, JSON.stringify(acepta.body)).toBe(200)
        expect(acepta.body).toMatchObject({ consentimientoPendiente: false, consentimiento: { version: CONSENTIMIENTO_VERSION } })
        expect((await sesion.get('/api/v1/cliente/pedidos')).status).toBe(200)
        expect((await sesion.get('/api/v1/auth/me')).body.user.consentimientoPendiente).toBe(false)
    })

    it('una versión anterior también queda pendiente; el personal no se bloquea', async () => {
        const { sesion } = await crearConSesion('cliente', { consentimiento: { version: '2020-01', aceptadoEn: new Date() } })
        expect((await sesion.get('/api/v1/cliente/pedidos')).body.error?.code).toBe('CONSENTIMIENTO_PENDIENTE')
        const { sesion: mesero } = await crearConSesion('mesero', { consentimiento: null })
        expect((await mesero.get('/api/v1/staff/salon/mesas')).status).toBe(200)
        expect((await mesero.get('/api/v1/auth/me')).body.user.consentimientoPendiente).toBe(false)
    })
})

describe('6.4 · Datos del perfil', () => {
    it('fecha de nacimiento, alergias y preferencias: se guardan, se omiten sin cambiar y se borran con vacío', async () => {
        const { sesion, usuario } = await crearConSesion('cliente')
        const base = { nombre: 'Ana', apellido: 'Ruiz', correo: usuario.correo }
        const r = await sesion.patch('/api/v1/cliente/perfil').send({ ...base, fechaNacimiento: '1990-11-05', alergias: 'Maní', preferencias: 'Sin lactosa' })
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        expect(r.body.perfil).toMatchObject({ fechaNacimiento: '1990-11-05', alergias: 'Maní', preferencias: 'Sin lactosa' })
        expect((await Usuario.findById(usuario._id).lean()).fechaNacimiento.toISOString()).toBe('1990-11-05T00:00:00.000Z')

        const igual = await sesion.patch('/api/v1/cliente/perfil').send(base)
        expect(igual.body.perfil).toMatchObject({ fechaNacimiento: '1990-11-05', alergias: 'Maní' })
        const borra = await sesion.patch('/api/v1/cliente/perfil').send({ ...base, fechaNacimiento: '', alergias: '' })
        expect(borra.body.perfil).toMatchObject({ fechaNacimiento: '', alergias: '', preferencias: 'Sin lactosa' })
    })

    it('rechaza fechas futuras, imposibles o anteriores a 1900 y textos de más de 200 caracteres', async () => {
        const { sesion, usuario } = await crearConSesion('cliente')
        const base = { nombre: 'Ana', apellido: 'Ruiz', correo: usuario.correo }
        for (const fechaNacimiento of ['2999-01-01', '1990-02-30', '1899-12-31', '05/11/1990']) {
            expect((await sesion.patch('/api/v1/cliente/perfil').send({ ...base, fechaNacimiento })).status, fechaNacimiento).toBe(400)
        }
        expect((await sesion.patch('/api/v1/cliente/perfil').send({ ...base, alergias: 'x'.repeat(201) })).status).toBe(400)
    })
})

describe('6.4 · Libreta de direcciones', () => {
    it('la primera queda principal; hasta 5 (la sexta, 409); cambiar la principal deja solo una', async () => {
        const { sesion } = await crearConSesion('cliente')
        const primera = await sesion.post('/api/v1/cliente/direcciones').send(DIRECCION)
        expect(primera.status, JSON.stringify(primera.body)).toBe(201)
        expect(primera.body.direcciones).toEqual([expect.objectContaining({ direccion: 'Cra 36B #30-06', barrio: 'Centro', etiqueta: 'Casa', principal: true })])
        for (let i = 2; i <= 5; i += 1) {
            expect((await sesion.post('/api/v1/cliente/direcciones').send({ ...DIRECCION, direccion: `Calle ${i} #10-20`, etiqueta: '' })).status).toBe(201)
        }
        const sexta = await sesion.post('/api/v1/cliente/direcciones').send({ ...DIRECCION, direccion: 'Calle 9 #10-20' })
        expect(sexta.status).toBe(409)
        expect(sexta.body.error.code).toBe('LIMITE_DIRECCIONES')

        const lista = (await sesion.get('/api/v1/cliente/direcciones')).body.direcciones
        expect(lista).toHaveLength(5)
        const r = await sesion.post(`/api/v1/cliente/direcciones/${lista[3].id}/principal`).send({})
        expect(r.status).toBe(200)
        expect(r.body.direcciones.filter((d) => d.principal).map((d) => d.id)).toEqual([lista[3].id])
        expect(r.body.direcciones[0].id).toBe(lista[3].id) // la principal va primero
    })

    it('editar y borrar; al borrar la principal, la siguiente pasa a serlo; dirección inválida, 400', async () => {
        const { sesion } = await crearConSesion('cliente')
        const [a] = (await sesion.post('/api/v1/cliente/direcciones').send(DIRECCION)).body.direcciones
        const { direcciones } = (await sesion.post('/api/v1/cliente/direcciones').send({ ...DIRECCION, direccion: 'Calle 10 #20-30', etiqueta: 'Oficina' })).body
        const b = direcciones.find((d) => d.etiqueta === 'Oficina')

        const edit = await sesion.patch(`/api/v1/cliente/direcciones/${b.id}`).send({ ...DIRECCION, direccion: 'Calle 11 #20-30', etiqueta: 'Trabajo' })
        expect(edit.status, JSON.stringify(edit.body)).toBe(200)
        expect(edit.body.direcciones.find((d) => d.id === b.id)).toMatchObject({ direccion: 'Calle 11 #20-30', etiqueta: 'Trabajo', principal: false })

        const borra = await sesion.delete(`/api/v1/cliente/direcciones/${a.id}`)
        expect(borra.status).toBe(200)
        expect(borra.body.direcciones).toEqual([expect.objectContaining({ id: b.id, principal: true })])

        expect((await sesion.post('/api/v1/cliente/direcciones').send({ ...DIRECCION, direccion: 'mi casa' })).status).toBe(400)
        expect((await sesion.post('/api/v1/cliente/direcciones').send({ ...DIRECCION, principal: true, _id: 'x' })).status).toBe(400)
    })

    it('dos pestañas a la vez con 4 guardadas: una agrega (201), la otra recibe 409 y quedan 5', async () => {
        const { sesion, usuario } = await crearConSesion('cliente')
        for (let i = 1; i <= 4; i += 1) await sesion.post('/api/v1/cliente/direcciones').send({ ...DIRECCION, direccion: `Calle ${i} #10-20` })
        const respuestas = await Promise.all([
            sesion.post('/api/v1/cliente/direcciones').send({ ...DIRECCION, direccion: 'Calle 7 #10-20' }),
            sesion.post('/api/v1/cliente/direcciones').send({ ...DIRECCION, direccion: 'Calle 8 #10-20' }),
        ])
        expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409])
        expect(respuestas.find((r) => r.status === 409).body.error.code).toMatch(/^(DIRECCIONES_MODIFICADAS|LIMITE_DIRECCIONES)$/)
        expect((await Usuario.findById(usuario._id).lean()).direcciones).toHaveLength(5)
    })

    it('PATCH cambia solo lo enviado (no borra la etiqueta ni las indicaciones)', async () => {
        const { sesion } = await crearConSesion('cliente')
        const [d] = (await sesion.post('/api/v1/cliente/direcciones').send(DIRECCION)).body.direcciones
        const r = await sesion.patch(`/api/v1/cliente/direcciones/${d.id}`).send({ barrio: 'Laureles' })
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        expect(r.body.direcciones[0]).toMatchObject({ barrio: 'Laureles', etiqueta: 'Casa', indicaciones: 'Torre 2', direccion: 'Cra 36B #30-06' })
        expect((await sesion.patch(`/api/v1/cliente/direcciones/${d.id}`).send({})).status).toBe(400)
    })

    it('solo las propias: el id de otro cliente o uno mal formado da 404', async () => {
        const { sesion: otra } = await crearConSesion('cliente')
        const [ajena] = (await otra.post('/api/v1/cliente/direcciones').send(DIRECCION)).body.direcciones
        const { sesion } = await crearConSesion('cliente')
        expect((await sesion.patch(`/api/v1/cliente/direcciones/${ajena.id}`).send(DIRECCION)).status).toBe(404)
        expect((await sesion.delete(`/api/v1/cliente/direcciones/${ajena.id}`)).status).toBe(404)
        expect((await sesion.post(`/api/v1/cliente/direcciones/${ajena.id}/principal`).send({})).status).toBe(404)
        expect((await sesion.delete('/api/v1/cliente/direcciones/no-es-id')).status).toBe(404)
        expect((await otra.get('/api/v1/cliente/direcciones')).body.direcciones).toHaveLength(1)
        expect(mongoose.isValidObjectId(ajena.id)).toBe(true)
    })
})
