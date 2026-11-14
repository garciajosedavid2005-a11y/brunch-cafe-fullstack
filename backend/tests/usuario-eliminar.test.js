// 3.8 · Borrar cuentas del personal desde Admin › Usuarios (usuario:gestionar).
// Sin historial → borrado real. Con historial → archivado: pierde el acceso al instante, desaparece de
// listas y selectores, libera su correo y su nombre queda en el historial como «Nombre A. (eliminado)».
// Bloqueos: clientes, uno mismo, el último admin activo y un mesero con cuentas abiertas.
import { describe, it, expect, beforeEach } from 'vitest'
import { crearConSesion, rolId } from './helpers/usuarios.js'
import { agente } from './helpers/app.js'
import Usuario from '../src/modulos/identidad/usuario.model.js'
import Rol from '../src/modulos/identidad/rol.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import { alRevocarSesion } from '../src/modulos/tiempoReal/bus.js'
import { abrirCuenta, transferirCuenta } from '../src/modulos/salon/cuentas.service.js'
import { PERMISOS_SALON } from '../src/modulos/identidad/permisos.js'

const RUTA = '/api/v1/admin/usuarios'
let admin
let adminUsuario
beforeEach(async () => {
    await Promise.all([Usuario.init(), Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes()])
    ;({ sesion: admin, usuario: adminUsuario } = await crearConSesion('admin'))
})

const sesionDe = (u) => ({ id: String(u._id), rol: 'mesero', permisos: PERMISOS_SALON.mesero })
const mesaNueva = async (numero = 1) => {
    const zona = await Zona.create({ nombre: `Zona ${numero}` })
    return Mesa.create({ numero, zona: zona._id, capacidad: 4 })
}

describe('3.8 · Eliminar sin historial: borrado real', () => {
    it('borra de verdad la cuenta de personal sin historial y deja un Evento con quién la borró', async () => {
        const { usuario } = await crearConSesion('cocina')
        const res = await admin.delete(`${RUTA}/${usuario._id}`)
        expect(res.status, JSON.stringify(res.body)).toBe(200)
        expect(res.body).toEqual({ id: String(usuario._id), resultado: 'eliminado' })
        expect(await Usuario.findById(usuario._id)).toBeNull()
        const evento = await Evento.findOne({ tipo: 'usuario_eliminado', entidadId: usuario._id }).lean()
        expect(evento).toMatchObject({ entidad: 'usuario', usuario: adminUsuario._id })
        expect(JSON.stringify(evento.datos)).not.toContain(usuario.correo) // sin el correo en la bitácora
    })

    it('un segundo DELETE da 404', async () => {
        const { usuario } = await crearConSesion('cocina')
        await admin.delete(`${RUTA}/${usuario._id}`)
        const res = await admin.delete(`${RUTA}/${usuario._id}`)
        expect(res.status).toBe(404)
    })
})

describe('3.8 · Eliminar con historial: archivado', () => {
    it('archiva: pierde el acceso al instante, cierra sus flujos en vivo, sale de las listas y libera el correo', async () => {
        const { usuario, sesion } = await crearConSesion('mesero')
        // Historial: abrió una cuenta que ya pasó a otro mesero
        const mesa = await mesaNueva()
        const otro = (await crearConSesion('mesero')).usuario
        const cuenta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, sesionDe(usuario))
        const { version } = await Cuenta.findById(cuenta.id).lean()
        await transferirCuenta(cuenta.id, { meseroId: String(otro._id), versionEsperada: version }, sesionDe(usuario))

        let revocado = 0
        const baja = alRevocarSesion(usuario._id, () => { revocado += 1 })
        expect((await sesion.get('/api/v1/auth/me')).status).toBe(200)

        const res = await admin.delete(`${RUTA}/${usuario._id}`)
        baja()
        expect(res.status, JSON.stringify(res.body)).toBe(200)
        expect(res.body).toEqual({ id: String(usuario._id), resultado: 'archivado' })
        expect(revocado).toBe(1)

        // Sin acceso al instante (sin esperar a la caché de 30 s)
        expect((await sesion.get('/api/v1/auth/me')).status).toBe(401)
        const login = await agente().post('/api/v1/auth/login').send({ correo: usuario.correo, contraseña: 'secreta123' })
        expect(login.status).toBe(401)

        const guardado = await Usuario.findById(usuario._id).select('+correoArchivado').lean()
        expect(guardado).toMatchObject({ eliminado: true, activo: false, correoArchivado: usuario.correo })
        expect(guardado.correo).not.toBe(usuario.correo)
        expect(guardado.tokenVersion).toBe((usuario.tokenVersion || 0) + 1)
        expect(await Evento.exists({ tipo: 'usuario_archivado', entidadId: usuario._id })).toBeTruthy()

        // Fuera de Admin › Usuarios y del selector de meseros
        const lista = await admin.get(RUTA)
        expect(lista.body.map((u) => u.id)).not.toContain(String(usuario._id))
        const meseros = await admin.get('/api/v1/staff/salon/meseros')
        expect(meseros.status, JSON.stringify(meseros.body)).toBe(200)
        expect(JSON.stringify(meseros.body)).not.toContain(String(usuario._id))

        // El correo queda libre para otra cuenta
        const nueva = await admin.post(RUTA).send({ nombre: 'Otra', apellido: 'Persona', correo: usuario.correo, rolId: await rolId('mesero') })
        expect(nueva.status, JSON.stringify(nueva.body)).toBe(201)

        // No se puede editar ni volver a eliminar
        expect((await admin.patch(`${RUTA}/${usuario._id}`).send({ activo: true })).status).toBe(404)
        expect((await admin.delete(`${RUTA}/${usuario._id}`)).status).toBe(404)
    })

    it('en el historial su nombre se muestra como «Nombre A. (eliminado)»', async () => {
        const { usuario } = await crearConSesion('mesero', { nombre: 'Ana', apellido: 'Pérez' })
        const mesa = await mesaNueva()
        const cuenta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, sesionDe(usuario))
        const otro = (await crearConSesion('mesero')).usuario
        const { version } = await Cuenta.findById(cuenta.id).lean()
        await transferirCuenta(cuenta.id, { meseroId: String(otro._id), versionEsperada: version }, sesionDe(usuario))
        expect((await admin.delete(`${RUTA}/${usuario._id}`)).body.resultado).toBe('archivado')

        const detalle = await admin.get(`/api/v1/staff/salon/cuentas/${cuenta.id}`)
        expect(detalle.status, JSON.stringify(detalle.body)).toBe(200)
        expect(JSON.stringify(detalle.body)).toContain('Ana P. (eliminado)')
    })
})

describe('3.8 · Bloqueos', () => {
    it('no elimina clientes (409 CUENTA_CLIENTE)', async () => {
        const { usuario } = await crearConSesion('cliente')
        const res = await admin.delete(`${RUTA}/${usuario._id}`)
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('CUENTA_CLIENTE')
        expect(await Usuario.findById(usuario._id)).not.toBeNull()
    })

    it('no se elimina a uno mismo (409 AUTO_BLOQUEO)', async () => {
        const res = await admin.delete(`${RUTA}/${adminUsuario._id}`)
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('AUTO_BLOQUEO')
    })

    it('no elimina al último admin activo (409 ULTIMO_ADMIN)', async () => {
        // Un gestor con usuario:gestionar y * (otro rol con comodín) frente al único admin
        const gestor = await Rol.create({ nombre: 'gestor38', etiqueta: 'Gestor', permisos: ['*'] })
        const { sesion } = await crearConSesion('gestor38')
        await Usuario.updateMany({ rol: { $ne: gestor._id }, _id: { $ne: adminUsuario._id } }, { activo: false })
        const res = await sesion.delete(`${RUTA}/${adminUsuario._id}`)
        expect(res.status, JSON.stringify(res.body)).toBe(409)
        expect(res.body.error.code).toBe('ULTIMO_ADMIN')
        expect(await Usuario.findById(adminUsuario._id)).not.toBeNull()
    })

    it('sí elimina a un admin si queda otro activo', async () => {
        const { usuario } = await crearConSesion('admin')
        const res = await admin.delete(`${RUTA}/${usuario._id}`)
        expect(res.status, JSON.stringify(res.body)).toBe(200)
    })

    it('no elimina a un mesero con cuentas abiertas (409 «transfiere sus cuentas primero»)', async () => {
        const { usuario } = await crearConSesion('mesero')
        const mesa = await mesaNueva()
        await abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, sesionDe(usuario))
        const res = await admin.delete(`${RUTA}/${usuario._id}`)
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('CUENTAS_ABIERTAS')
        expect(res.body.error.message).toMatch(/transfiere sus cuentas primero/i)
        expect(await Usuario.findById(usuario._id).lean()).toMatchObject({ activo: true })
    })

    it('exige usuario:gestionar (403) y da 404 con un id mal formado o inexistente', async () => {
        const { usuario } = await crearConSesion('cocina')
        const { sesion: mesero } = await crearConSesion('mesero')
        expect((await mesero.delete(`${RUTA}/${usuario._id}`)).status).toBe(403)
        expect((await admin.delete(`${RUTA}/no-es-id`)).status).toBe(404)
        expect((await admin.delete(`${RUTA}/${'a'.repeat(24)}`)).status).toBe(404)
    })

    it('un gestor sin * no elimina a un admin (403) y el admin sigue', async () => {
        await Rol.create({ nombre: 'gestor38b', etiqueta: 'Gestor', permisos: ['usuario:gestionar'] })
        const { sesion } = await crearConSesion('gestor38b')
        const { usuario: otroAdmin } = await crearConSesion('admin')
        const res = await sesion.delete(`${RUTA}/${otroAdmin._id}`)
        expect(res.status).toBe(403)
        expect(res.body.error.code).toBe('FORBIDDEN')
        expect(await Usuario.findById(otroAdmin._id)).not.toBeNull()
    })
})

describe('3.8 · Historial y concurrencia (revisores)', () => {
    it('recibir una cuenta transferida cuenta como historial: se archiva, no se borra', async () => {
        const { usuario: recibe } = await crearConSesion('mesero')
        const { usuario: abre } = await crearConSesion('mesero')
        const mesa = await mesaNueva()
        const cuenta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, sesionDe(abre))
        let { version } = await Cuenta.findById(cuenta.id).lean()
        await transferirCuenta(cuenta.id, { meseroId: String(recibe._id), versionEsperada: version }, sesionDe(abre))
        ;({ version } = await Cuenta.findById(cuenta.id).lean())
        await transferirCuenta(cuenta.id, { meseroId: String(abre._id), versionEsperada: version }, sesionDe(abre))
        const res = await admin.delete(`${RUTA}/${recibe._id}`)
        expect(res.body.resultado).toBe('archivado')
    })

    it('una cuenta abierta a la vez que la baja: nunca quedan las dos (cuenta abierta y mesero eliminado)', async () => {
        for (let i = 0; i < 3; i += 1) {
            const { usuario } = await crearConSesion('mesero')
            const mesa = await mesaNueva(10 + i)
            const [baja, apertura] = await Promise.allSettled([
                admin.delete(`${RUTA}/${usuario._id}`),
                abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, sesionDe(usuario)),
            ])
            const eliminado = baja.value.status === 200
            const abierta = apertura.status === 'fulfilled'
            expect(eliminado && abierta, `baja ${baja.value.status} · apertura ${apertura.status}`).toBe(false)
            if (!eliminado) expect(baja.value.body.error.code).toBe('CUENTAS_ABIERTAS')
        }
    })

    it('un PATCH { activo: true } sobre una cuenta archivada no la reactiva (404) y la sesión la trata como inactiva', async () => {
        const { usuario } = await crearConSesion('mesero')
        const mesa = await mesaNueva()
        const otro = (await crearConSesion('mesero')).usuario
        const cuenta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, sesionDe(usuario))
        const { version } = await Cuenta.findById(cuenta.id).lean()
        await transferirCuenta(cuenta.id, { meseroId: String(otro._id), versionEsperada: version }, sesionDe(usuario))
        await admin.delete(`${RUTA}/${usuario._id}`)
        expect((await admin.patch(`${RUTA}/${usuario._id}`).send({ activo: true })).status).toBe(404)
        // Aunque alguien forzara activo:true en la BD, eliminado:true sigue cortando el acceso
        await Usuario.updateOne({ _id: usuario._id }, { activo: true })
        const archivado = await Usuario.findById(usuario._id).lean()
        const login = await agente().post('/api/v1/auth/login').send({ correo: archivado.correo, contraseña: 'secreta123' })
        expect(login.status).toBe(403) // como una cuenta desactivada (ACCOUNT_DISABLED)
    })

    it('transferir a un mesero archivado da 400 MESERO_NO_VALIDO', async () => {
        const { usuario: archivado } = await crearConSesion('mesero')
        const { usuario: abre } = await crearConSesion('mesero')
        await Usuario.updateOne({ _id: archivado._id }, { eliminado: true })
        const mesa = await mesaNueva()
        const cuenta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, sesionDe(abre))
        const { version } = await Cuenta.findById(cuenta.id).lean()
        await expect(transferirCuenta(cuenta.id, { meseroId: String(archivado._id), versionEsperada: version }, sesionDe(abre)))
            .rejects.toMatchObject({ code: 'MESERO_NO_VALIDO' })
    })
})
