// 6.4 (F6-8, F6-f, F6-g) · Perfil del cliente: fecha de nacimiento, alergias y preferencias; libreta de direcciones
// (hasta 5, una principal) y consentimiento de datos (Ley 1581) con versión y fecha. El registro exige aceptarlo; un
// cliente sin la versión vigente la acepta antes de seguir (403 CONSENTIMIENTO_PENDIENTE salvo aceptar, /me y perfil).
import { describe, it, expect, vi } from 'vitest'
import mongoose from 'mongoose'
import { agente } from './helpers/app.js'
import { crearConSesion } from './helpers/usuarios.js'
import Usuario from '../src/modulos/identidad/usuario.model.js'
import { CONSENTIMIENTO_VERSION } from '../src/modulos/identidad/consentimiento.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import Rol from '../src/modulos/identidad/rol.model.js'
import { actualizarPerfil } from '../src/modulos/identidad/perfil.service.js'

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

    it('limpieza final · la versión 2026-11b deja pendiente a quien aceptó la 2026-11 (la vuelve a aceptar al entrar)', async () => {
        expect(CONSENTIMIENTO_VERSION).toBe('2026-11b')
        const { sesion, usuario } = await crearConSesion('cliente', { consentimiento: { version: '2026-11', aceptadoEn: new Date() } })
        const login = await agente().post('/api/v1/auth/login').send({ correo: usuario.correo, contraseña: 'secreta123' })
        expect(login.body.consentimientoPendiente).toBe(true)
        expect((await sesion.get('/api/v1/cliente/pedidos')).body.error?.code).toBe('CONSENTIMIENTO_PENDIENTE')
        expect((await sesion.post('/api/v1/auth/consentimiento').send({ version: '2026-11b' })).status).toBe(200)
        expect((await sesion.get('/api/v1/cliente/pedidos')).status).toBe(200)
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
        // Cierre · La fecha queda fija: reenviar la misma no cambia nada; las alergias sí se borran con vacío
        const borra = await sesion.patch('/api/v1/cliente/perfil').send({ ...base, fechaNacimiento: '1990-11-05', alergias: '' })
        expect(borra.body.perfil).toMatchObject({ fechaNacimiento: '1990-11-05', alergias: '', preferencias: 'Sin lactosa' })
    })

    it('cierre · la fecha de nacimiento queda fija tras el primer registro: cambiarla o borrarla da 409 y no escribe nada', async () => {
        const { sesion, usuario } = await crearConSesion('cliente')
        const base = { nombre: 'Ana', apellido: 'Ruiz', correo: usuario.correo }
        expect((await sesion.patch('/api/v1/cliente/perfil').send({ ...base, fechaNacimiento: '1990-11-05' })).status).toBe(200)
        for (const fechaNacimiento of ['1990-12-05', '']) {
            const r = await sesion.patch('/api/v1/cliente/perfil').send({ ...base, nombre: 'Otra', fechaNacimiento })
            expect(r.status, fechaNacimiento).toBe(409)
            expect(r.body.error.code).toBe('FECHA_NACIMIENTO_FIJA')
            expect(r.body.error.message).toContain('contacta al café')
        }
        const guardado = await Usuario.findById(usuario._id).lean()
        expect(guardado.fechaNacimiento.toISOString()).toBe('1990-11-05T00:00:00.000Z')
        expect(guardado.nombre).toBe('Ana') // el 409 no guarda el resto del formulario
    })

    it('cierre · la otra pestaña la puso entre la lectura y la escritura: 409 y la primera queda intacta', async () => {
        const { usuario } = await crearConSesion('cliente', { fechaNacimiento: new Date('1990-11-05T00:00:00.000Z') })
        // La lectura previa ve «sin fecha» (como si la otra pestaña aún no hubiera escrito); la escritura condicional choca
        const lectura = vi.spyOn(Usuario, 'findById').mockReturnValueOnce({ select: () => ({ lean: async () => ({ fechaNacimiento: null }) }) })
        try {
            await expect(actualizarPerfil(usuario._id, { nombre: 'Ana', apellido: 'Ruiz', correo: usuario.correo, fechaNacimiento: new Date('1991-03-07T00:00:00.000Z') }))
                .rejects.toMatchObject({ code: 'FECHA_NACIMIENTO_FIJA' })
        } finally {
            lectura.mockRestore()
        }
        const guardado = await Usuario.findById(usuario._id).lean()
        expect(guardado.fechaNacimiento.toISOString()).toBe('1990-11-05T00:00:00.000Z')
        expect(guardado.nombre).not.toBe('Ana')
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

describe('Cierre · El admin corrige la fecha de nacimiento', () => {
    it('Admin › Usuarios la corrige (o la borra) con motivo y un Evento sin fechas; el cliente la ve; sin usuario:gestionar, 403', async () => {
        const { sesion: admin, usuario: adminU } = await crearConSesion('admin')
        const { sesion: cliente, usuario } = await crearConSesion('cliente', { fechaNacimiento: new Date('1990-11-05T00:00:00.000Z') })
        const { sesion: mesero } = await crearConSesion('mesero')

        const MOTIVO = 'El cliente mostró su cédula'
        expect((await mesero.patch(`/api/v1/admin/usuarios/${usuario._id}`).send({ fechaNacimiento: '1990-12-05', motivo: MOTIVO })).status).toBe(403)
        expect((await admin.patch(`/api/v1/admin/usuarios/${usuario._id}`).send({ fechaNacimiento: '2999-01-01', motivo: MOTIVO })).status).toBe(400)
        // Limpieza final · El motivo es obligatorio (5 a 300 caracteres); sin él no se escribe nada
        for (const motivo of [undefined, '', 'ab', 'x'.repeat(301)]) {
            const sin = await admin.patch(`/api/v1/admin/usuarios/${usuario._id}`).send({ fechaNacimiento: '1990-12-05', motivo })
            expect(sin.status, String(motivo).slice(0, 10)).toBe(400)
            expect(sin.body.error.code).toBe('VALIDATION_ERROR')
            expect(JSON.stringify(sin.body.error.details)).toContain('motivo')
        }
        // El motivo solo acompaña la corrección de la fecha
        const soloMotivo = await admin.patch(`/api/v1/admin/usuarios/${usuario._id}`).send({ activo: true, motivo: 'Corrección pedida' })
        expect(soloMotivo.status).toBe(400)
        expect(JSON.stringify(soloMotivo.body.error.details)).toContain('motivo')
        expect(await Evento.countDocuments({ entidadId: usuario._id, tipo: 'fecha_nacimiento_corregida' })).toBe(0)
        expect((await Usuario.findById(usuario._id).lean()).fechaNacimiento.toISOString()).toBe('1990-11-05T00:00:00.000Z')

        const lista = await admin.get('/api/v1/admin/usuarios')
        expect(lista.body.find((u) => String(u.id) === String(usuario._id))).toMatchObject({ fechaNacimiento: '1990-11-05', nacimientoEditable: true })

        const r = await admin.patch(`/api/v1/admin/usuarios/${usuario._id}`).send({ fechaNacimiento: '1990-12-05', motivo: MOTIVO })
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        expect(r.body.fechaNacimiento).toBe('1990-12-05')
        expect((await cliente.get('/api/v1/cliente/perfil')).body.perfil.fechaNacimiento).toBe('1990-12-05')
        const eventos = await Evento.find({ entidad: 'usuario', entidadId: usuario._id, tipo: 'fecha_nacimiento_corregida' }).lean()
        expect(eventos).toHaveLength(1)
        // Limpieza final · Solo el hecho, el motivo y el autor: ninguna fecha (dato personal en una bitácora inmutable)
        expect(eventos[0]).toMatchObject({ motivo: MOTIVO, de: null })
        expect(eventos[0].a ?? null).toBeNull()
        expect(eventos[0].datos ?? null).toBeNull()
        expect(JSON.stringify(eventos[0])).not.toMatch(/1990/)
        expect(String(eventos[0].usuario)).toBe(String(adminU._id))

        // La misma fecha otra vez no escribe otro Evento; vacío la borra (y el cliente puede volver a ponerla una vez)
        const igual = await admin.patch(`/api/v1/admin/usuarios/${usuario._id}`).send({ fechaNacimiento: '1990-12-05', motivo: MOTIVO })
        expect(igual.status).toBe(200)
        expect(igual.body.fechaNacimiento).toBe('1990-12-05')
        expect(await Evento.countDocuments({ entidadId: usuario._id, tipo: 'fecha_nacimiento_corregida' })).toBe(1)
        const borra = await admin.patch(`/api/v1/admin/usuarios/${usuario._id}`).send({ fechaNacimiento: '', motivo: 'Fecha registrada por error' })
        expect(borra.body.fechaNacimiento).toBe('')
        const ultimo = await Evento.findOne({ entidadId: usuario._id, tipo: 'fecha_nacimiento_corregida' }).sort({ createdAt: -1, _id: -1 }).lean()
        expect(ultimo).toMatchObject({ motivo: 'Fecha registrada por error', de: null })
        const base = { nombre: 'Ana', apellido: 'Ruiz', correo: usuario.correo }
        expect((await cliente.patch('/api/v1/cliente/perfil').send({ ...base, fechaNacimiento: '1990-10-01' })).status).toBe(200)
        expect((await cliente.patch('/api/v1/cliente/perfil').send({ ...base, fechaNacimiento: '1990-09-01' })).status).toBe(409)
    })

    it('si el cliente la puso mientras el admin la corregía: 409 y no se pisa', async () => {
        const { sesion: admin } = await crearConSesion('admin')
        const { usuario } = await crearConSesion('cliente')
        const original = Usuario.exists.bind(Usuario)
        // Justo antes de la escritura del admin (dentro de su transacción), el cliente guarda su primera fecha
        const espia = vi.spyOn(Usuario, 'exists').mockImplementation((filtro, ...resto) => {
            if (!filtro || !('eliminado' in filtro) || String(filtro._id) !== String(usuario._id)) return original(filtro, ...resto)
            return { session: async (s) => {
                await Usuario.collection.updateOne({ _id: usuario._id }, { $set: { fechaNacimiento: new Date('1990-11-05T00:00:00.000Z') } })
                return original(filtro, ...resto).session(s)
            } }
        })
        try {
            const r = await admin.patch(`/api/v1/admin/usuarios/${usuario._id}`).send({ fechaNacimiento: '1985-01-01', motivo: 'Corrección pedida' })
            expect(r.status, JSON.stringify(r.body)).toBe(409)
            expect(r.body.error.code).toBe('FECHA_NACIMIENTO_MODIFICADA')
        } finally {
            espia.mockRestore()
        }
        expect((await Usuario.findById(usuario._id).lean()).fechaNacimiento.toISOString()).toBe('1990-11-05T00:00:00.000Z')
        expect(await Evento.countDocuments({ entidadId: usuario._id, tipo: 'fecha_nacimiento_corregida' })).toBe(0)
    })

    it('un gestor sin «*» no corrige la de un admin (403) y un 400 no deja Evento', async () => {
        await Rol.create({ nombre: 'gestor-test', permisos: ['usuario:gestionar'] })
        const { sesion: gestor } = await crearConSesion('gestor-test')
        const { usuario: otroAdmin } = await crearConSesion('admin')
        const { usuario: cliente } = await crearConSesion('cliente')
        expect((await gestor.patch(`/api/v1/admin/usuarios/${otroAdmin._id}`).send({ fechaNacimiento: '1990-12-05', motivo: 'Corrección pedida' })).status).toBe(403)
        expect((await gestor.patch(`/api/v1/admin/usuarios/${cliente._id}`).send({ fechaNacimiento: '2999-01-01', motivo: 'Corrección pedida' })).status).toBe(400)
        expect(await Evento.countDocuments({ tipo: 'fecha_nacimiento_corregida', entidadId: { $in: [otroAdmin._id, cliente._id] } })).toBe(0)
        expect((await Usuario.findById(otroAdmin._id).lean()).fechaNacimiento ?? null).toBeNull()
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
