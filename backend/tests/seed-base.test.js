import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'
import { api } from './helpers/app.js'
import Rol from '../src/models/rol.model.js'
import Usuario from '../src/models/usuario.model.js'
import { sembrarBase, sembrarRoles } from '../src/seeds/base.js'

const ENV = {
    ADMIN_EMAIL: '  Admin@BrunchCafe.co ',
    ADMIN_PASSWORD: 'clave-segura-123',
    ADMIN_NOMBRE: 'Brayan Arboleda',
}

describe('Seed de roles base', () => {
    it('crea admin, cliente y los roles de staff como roles de sistema y es idempotente', async () => {
        await sembrarRoles()
        await sembrarRoles()
        const roles = await Rol.find().sort({ nombre: 1 }).lean()
        expect(roles.map((r) => r.nombre)).toEqual(
            ['admin', 'anfitrion', 'barista', 'cajero', 'cliente', 'cocina', 'compras', 'mesero', 'repartidor']
        )
        expect(roles.every((r) => r.esSistema)).toBe(true)
        const porNombre = Object.fromEntries(roles.map((r) => [r.nombre, r.permisos]))
        expect(porNombre.admin).toEqual(['*'])
        expect(porNombre.cliente).toEqual([])
        expect(porNombre.mesero).toEqual(['pedido:ver', 'pedido:cambiar_estado'])
        expect(porNombre.compras).toEqual([])
    })

    it('fuerza los permisos de admin y cliente, pero respeta los editados en roles de staff', async () => {
        await Rol.updateOne({ nombre: 'admin' }, { $set: { permisos: ['pedido:ver'] } })
        await Rol.updateOne({ nombre: 'cliente' }, { $set: { permisos: ['pedido:ver'] } })
        await Rol.updateOne({ nombre: 'mesero' }, { $set: { permisos: ['pedido:ver'] } })
        await sembrarRoles()
        expect((await Rol.findOne({ nombre: 'admin' })).permisos).toEqual(['*'])
        expect((await Rol.findOne({ nombre: 'cliente' })).permisos).toEqual([])
        expect((await Rol.findOne({ nombre: 'mesero' })).permisos).toEqual(['pedido:ver'])
    })

    it('no pisa la etiqueta ni la descripción editadas por el admin', async () => {
        await Rol.updateOne({ nombre: 'admin' }, { $set: { etiqueta: 'Gerencia', descripcion: 'Editada' } })
        await sembrarRoles()
        const admin = await Rol.findOne({ nombre: 'admin' }).lean()
        expect(admin).toMatchObject({ etiqueta: 'Gerencia', descripcion: 'Editada' })
    })
})

describe('Seed del primer administrador', () => {
    it('crea el admin con correo normalizado y puede iniciar sesión', async () => {
        const { admin } = await sembrarBase(ENV)
        expect(admin).toEqual({ correo: 'admin@brunchcafe.co', accion: 'creado' })
        expect(JSON.stringify(admin)).not.toContain(ENV.ADMIN_PASSWORD)

        const usuario = await Usuario.findOne({ correo: 'admin@brunchcafe.co' }).populate('rol').lean()
        expect(usuario).toMatchObject({ nombre: 'Brayan', apellido: 'Arboleda' })
        expect(usuario.rol.nombre).toBe('admin')
        expect(usuario.contraseña).not.toBe(ENV.ADMIN_PASSWORD)

        const login = await api().post('/api/auth/login').send({ correo: 'admin@brunchcafe.co', contraseña: ENV.ADMIN_PASSWORD })
        expect(login.status).toBe(200)
        expect(login.body.rol).toBe('admin')
    })

    it('es idempotente: la segunda ejecución no crea ni cambia nada', async () => {
        await sembrarBase(ENV)
        const { admin } = await sembrarBase(ENV)
        expect(admin.accion).toBe('sin_cambios')
        expect(await Usuario.countDocuments()).toBe(1)
    })

    it('respeta un usuario existente: no cambia su contraseña, solo le asigna el rol admin', async () => {
        const cliente = await Rol.findOne({ nombre: 'cliente' })
        const hashOriginal = await bcrypt.hash('su-clave-propia', 4)
        await Usuario.create({ nombre: 'Jose', apellido: 'X', correo: 'admin@brunchcafe.co', contraseña: hashOriginal, rol: cliente._id })

        const { admin } = await sembrarBase(ENV)
        expect(admin.accion).toBe('rol_asignado')
        const usuario = await Usuario.findOne({ correo: 'admin@brunchcafe.co' }).populate('rol').lean()
        expect(usuario.contraseña).toBe(hashOriginal)
        expect(usuario.nombre).toBe('Jose')
        expect(usuario.rol.nombre).toBe('admin')
    })

    it('reasigna al rol "admin" a usuarios con roles alias creados a mano, sin borrar el alias', async () => {
        const alias = await Rol.create({ nombre: 'Administrador' })
        await Usuario.create({ nombre: 'Dany', apellido: 'Y', correo: 'dany@example.com', contraseña: 'x', rol: alias._id })

        const { unificacion } = await sembrarBase({})
        expect(unificacion).toEqual({ rolesAlias: ['Administrador'], usuariosReasignados: 1 })
        const dany = await Usuario.findOne({ correo: 'dany@example.com' }).populate('rol').lean()
        expect(dany.rol.nombre).toBe('admin')
        expect(await Rol.exists({ nombre: 'Administrador' })).toBeTruthy()
    })

    it('sin variables ADMIN_* se omite; con contraseña corta falla sin revelarla', async () => {
        const { admin } = await sembrarBase({})
        expect(admin.omitido).toBe(true)

        const corta = 'corta123'
        await expect(sembrarBase({ ...ENV, ADMIN_PASSWORD: corta })).rejects.toThrow(/al menos 10 caracteres/)
        await expect(sembrarBase({ ...ENV, ADMIN_PASSWORD: corta })).rejects.not.toThrow(new RegExp(corta))
    })

    it('el registro usa el rol cliente sembrado (sin upserts durante la petición)', async () => {
        const res = await api().post('/api/auth/registro').send({
            nombre: 'Ana', apellido: 'P', correo: 'ana@example.com', contraseña: 'secreta123',
        })
        expect(res.status).toBe(200)
        expect(res.body.rol).toBe('cliente')
    })
})
