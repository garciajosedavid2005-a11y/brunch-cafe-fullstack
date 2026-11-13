// 2.5b · Estaciones por rol (pedido por Brayan al revisar 2.5): cada rol tiene sus estaciones asignadas
// (cocina → Cocina, barista → Barra; el admin y los roles con «*» ven todas), editables en Admin › Roles.
// El backend lo exige: ver la cola, el listado de estaciones del KDS, cambiar un ítem, «Todo listo», el
// domicilio por estación y el canal SSE de una estación no asignada → 403. Sin estaciones asignadas, nada
// (cerrado por defecto).
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba } from './helpers/datos.js'
import Rol from '../src/modulos/identidad/rol.model.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import { PERMISOS_SALON, PERMISOS_COCINA } from '../src/modulos/identidad/permisos.js'
import { abrirCuenta, agregarItem, enviarRonda } from '../src/modulos/salon/cuentas.service.js'
import { cambiarEstadoItem, todoListo, obtenerCola, marcarPedidoEstacion } from '../src/modulos/cocina/cocina.service.js'
import { listarEstacionesKds } from '../src/modulos/cocina/cola.service.js'
import { validarCanales } from '../src/modulos/tiempoReal/eventos.routes.js'

const { ObjectId } = mongoose.Types
const sesion = (rol, permisos, estaciones) => ({ id: String(new ObjectId()), rol, permisos, ...(estaciones ? { estaciones } : {}) })
const error = async (promesa) => {
    try {
        await promesa
    } catch (e) {
        return e
    }
    throw new Error('Se esperaba un error')
}

const cocinero = () => sesion('cocina', PERMISOS_COCINA.cocina, ['cocina'])
const barista = () => sesion('barista', PERMISOS_COCINA.barista, ['barra'])
const admin = () => sesion('admin', ['*'])

describe('Roles sembrados con sus estaciones (2.5b)', () => {
    it('cocina → Cocina y barista → Barra; el mesero no tiene', async () => {
        const roles = Object.fromEntries((await Rol.find({ nombre: { $in: ['cocina', 'barista', 'mesero'] } }).lean()).map((r) => [r.nombre, r.estaciones]))
        expect(roles.cocina).toEqual(['cocina'])
        expect(roles.barista).toEqual(['barra'])
        expect(roles.mesero ?? []).toEqual([])
    })

    it('la sesión lleva las estaciones del rol: el cocinero solo ve Cocina en el KDS y su cola de Barra da 403', async () => {
        const { sesion: agente } = await crearConSesion('cocina')
        const estaciones = await agente.get('/api/v1/staff/cocina/estaciones')
        expect(estaciones.body.map((e) => e.codigo)).toEqual(['cocina'])
        expect((await agente.get('/api/v1/staff/cocina/cola?estacion=cocina')).status).toBe(200)
        const barra = await agente.get('/api/v1/staff/cocina/cola?estacion=barra')
        expect(barra.status).toBe(403)
        expect(barra.body).toMatchObject({ error: { code: 'ESTACION_NO_ASIGNADA', details: { estacion: 'barra' } } })
    })
})

describe('Lecturas por estación (2.5b)', () => {
    it('el admin ve todas; un rol con kds:ver y sin estaciones no ve ninguna (cerrado por defecto)', async () => {
        expect((await listarEstacionesKds(admin())).map((e) => e.codigo)).toEqual(['barra', 'cocina'])
        const sinAsignar = sesion('recepcion', ['kds:ver'])
        expect(await listarEstacionesKds(sinAsignar)).toEqual([])
        expect(await error(obtenerCola({ estacion: 'cocina' }, sinAsignar))).toMatchObject({ status: 403, code: 'ESTACION_NO_ASIGNADA' })
        expect((await obtenerCola({ estacion: 'barra' }, admin())).estacion.codigo).toBe('barra')
    })

    it('el canal SSE de una estación no asignada → 403; la propia sí', () => {
        expect(validarCanales('estacion:cocina', cocinero())).toEqual(['estacion:cocina'])
        expect(() => validarCanales('estacion:barra', cocinero())).toThrow(expect.objectContaining({ status: 403 }))
        expect(validarCanales('estacion:barra', admin())).toEqual(['estacion:barra'])
    })
})

describe('Acciones por estación (2.5b)', () => {
    let latte
    let huevos
    let comandaId
    beforeEach(async () => {
        await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes()])
        const mesero = sesion('mesero', [...PERMISOS_SALON.mesero, ...PERMISOS_COCINA.mesero])
        const zona = await Zona.create({ nombre: 'Interior' })
        const mesa = await Mesa.create({ numero: 1, zona: zona._id, capacidad: 4 })
        const pHuevos = await Producto.create({ codigo: 1, nombre: 'Huevos', precio: 15000, categoria: (await categoriaDePrueba('Desayunos'))._id })
        const pLatte = await Producto.create({ codigo: 2, nombre: 'Latte', precio: 9000, categoria: (await categoriaDePrueba('Bebidas'))._id })
        const cuenta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, mesero)
        for (const p of [pHuevos, pLatte]) await agregarItem(cuenta.id, { productoId: String(p._id), cantidad: 1 }, mesero)
        await enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: (await Cuenta.findById(cuenta.id).lean()).version }, mesero)
        const ronda = await Comanda.findOne({ cuenta: cuenta.id }).lean()
        comandaId = String(ronda._id)
        huevos = String(ronda.items.find((i) => i.nombre === 'Huevos')._id)
        latte = String(ronda.items.find((i) => i.nombre === 'Latte')._id)
    })

    it('el cocinero no puede empezar ni marcar un ítem de Barra; el barista sí, y el admin también', async () => {
        const e = await error(cambiarEstadoItem(latte, { a: 'en_preparacion', de: 'enviado' }, cocinero()))
        expect(e).toMatchObject({ status: 403, code: 'ESTACION_NO_ASIGNADA' })
        expect(e.details).toBeUndefined() // no revela en qué estación está un ítem ajeno (security-reviewer)
        expect((await Comanda.findById(comandaId).lean()).items.find((i) => String(i._id) === latte).estado).toBe('enviado')
        await cambiarEstadoItem(latte, { a: 'en_preparacion', de: 'enviado' }, barista())
        await cambiarEstadoItem(huevos, { a: 'en_preparacion', de: 'enviado' }, cocinero())
        await cambiarEstadoItem(latte, { a: 'listo', de: 'en_preparacion' }, admin())
    })

    it('«Todo listo» de otra estación → 403 sin tocar los ítems', async () => {
        expect(await error(todoListo(comandaId, { estacion: 'barra' }, cocinero()))).toMatchObject({ status: 403, code: 'ESTACION_NO_ASIGNADA' })
        expect((await Comanda.findById(comandaId).lean()).items.find((i) => String(i._id) === latte).estado).toBe('enviado')
        await todoListo(comandaId, { estacion: 'cocina' }, cocinero())
    })

    it('«Deshacer» de un ítem de otra estación → 403 (revisor-backend)', async () => {
        const quien = barista()
        await cambiarEstadoItem(latte, { a: 'en_preparacion', de: 'enviado' }, quien)
        await cambiarEstadoItem(latte, { a: 'listo', de: 'en_preparacion' }, quien)
        expect(await error(cambiarEstadoItem(latte, { a: 'en_preparacion', de: 'listo' }, cocinero()))).toMatchObject({ status: 403, code: 'ESTACION_NO_ASIGNADA' })
    })


    it('el domicilio de otra estación → 403, antes de leer el pedido (un id cualquiera no da 404)', async () => {
        expect(await error(marcarPedidoEstacion(String(new ObjectId()), { estacion: 'barra', a: 'en_preparacion' }, sesion('cocina', ['pedido:preparar'], ['cocina']))))
            .toMatchObject({ status: 403, code: 'ESTACION_NO_ASIGNADA' })
    })
})

describe('Admin › Roles: estaciones del rol (2.5b)', () => {
    it('el admin asigna y quita estaciones; se ven en el listado; un código que no existe → 400', async () => {
        const { sesion: adminHttp } = await crearConSesion('admin')
        const rol = await Rol.findOne({ nombre: 'barista' }).lean()
        const ok = await adminHttp.put(`/api/v1/admin/roles/${rol._id}`).send({ estaciones: ['barra', 'cocina'] })
        expect(ok.status).toBe(200)
        expect(ok.body.estaciones).toEqual(['barra', 'cocina'])
        const lista = await adminHttp.get('/api/v1/admin/roles')
        expect(lista.body.find((r) => r.codigo === 'barista').estaciones).toEqual(['barra', 'cocina'])
        const malo = await adminHttp.put(`/api/v1/admin/roles/${rol._id}`).send({ estaciones: ['horno'] })
        expect(malo.status).toBe(400)
        expect(malo.body).toMatchObject({ error: { code: 'ESTACION_NO_EXISTE', details: { estaciones: ['horno'] } } })
        const vacio = await adminHttp.put(`/api/v1/admin/roles/${rol._id}`).send({ estaciones: [] })
        expect(vacio.body.estaciones).toEqual([])
    })

    it('al quitarle una estación al rol, la sesión abierta lo nota al momento (sin esperar la caché)', async () => {
        const { sesion: adminHttp } = await crearConSesion('admin')
        const { sesion: agente } = await crearConSesion('barista')
        expect((await agente.get('/api/v1/staff/cocina/cola?estacion=barra')).status).toBe(200)
        const rol = await Rol.findOne({ nombre: 'barista' }).lean()
        await adminHttp.put(`/api/v1/admin/roles/${rol._id}`).send({ estaciones: [] })
        expect((await agente.get('/api/v1/staff/cocina/cola?estacion=barra')).status).toBe(403)
    })
})

describe('Admin › Roles: crear con estaciones y rol cliente (revisor-backend, 2.5b)', () => {
    it('crear un rol con estaciones; una que no existe → 400; el rol cliente no puede tenerlas → 403', async () => {
        const { sesion: adminHttp } = await crearConSesion('admin')
        const creado = await adminHttp.post('/api/v1/admin/roles').send({ nombre: 'Pastelería', permisos: ['kds:ver'], estaciones: ['cocina'] })
        expect(creado.status).toBe(201)
        expect(creado.body.estaciones).toEqual(['cocina'])
        const malo = await adminHttp.post('/api/v1/admin/roles').send({ nombre: 'Horno', estaciones: ['horno'] })
        expect(malo.status).toBe(400)
        expect(malo.body.error).toMatchObject({ code: 'ESTACION_NO_EXISTE', details: { estaciones: ['horno'] } })
        const cliente = await Rol.findOne({ nombre: 'cliente' }).lean()
        const prohibido = await adminHttp.put(`/api/v1/admin/roles/${cliente._id}`).send({ estaciones: ['cocina'] })
        expect(prohibido.status).toBe(403)
        expect(prohibido.body.error.code).toBe('ROL_PROTEGIDO')
    })

    it('asignar una estación al rol la «toca» en la misma transacción: un borrado simultáneo choca con ella', async () => {
        const { sesion: adminHttp } = await crearConSesion('admin')
        const { default: Estacion } = await import('../src/modulos/catalogo/estacion.model.js')
        const antes = (await Estacion.findOne({ codigo: 'barra' }).lean()).updatedAt
        await new Promise((ok) => setTimeout(ok, 5))
        const rol = await Rol.findOne({ nombre: 'cocina' }).lean()
        await adminHttp.put(`/api/v1/admin/roles/${rol._id}`).send({ estaciones: ['cocina', 'barra'] })
        expect((await Estacion.findOne({ codigo: 'barra' }).lean()).updatedAt.getTime()).toBeGreaterThan(antes.getTime())
    })
})

describe('Una estación asignada a un rol no se borra (schema-reviewer, 2.5b)', () => {
    it('borrarla → 409 ESTACION_EN_USO con los roles; desactivarla sí se puede; sin roles, se borra', async () => {
        const { sesion: adminHttp } = await crearConSesion('admin')
        const nueva = await adminHttp.post('/api/v1/admin/estaciones').send({ codigo: 'parrilla', nombre: 'Parrilla' })
        const rol = await Rol.findOne({ nombre: 'cocina' }).lean()
        await adminHttp.put(`/api/v1/admin/roles/${rol._id}`).send({ estaciones: ['cocina', 'parrilla'] })
        const borrar = await adminHttp.delete(`/api/v1/admin/estaciones/${nueva.body.id}`)
        expect(borrar.status).toBe(409)
        expect(borrar.body.error).toMatchObject({ code: 'ESTACION_EN_USO', details: { roles: 1 } })
        expect(borrar.body.error.message).toMatch(/1 rol/)
        expect((await adminHttp.put(`/api/v1/admin/estaciones/${nueva.body.id}`).send({ activa: false })).status).toBe(200)
        await adminHttp.put(`/api/v1/admin/roles/${rol._id}`).send({ estaciones: ['cocina'] })
        expect((await adminHttp.delete(`/api/v1/admin/estaciones/${nueva.body.id}`)).status).toBe(200)
    })
})
