// 6.5 (F6-8, F6-a, F6-e) · Alergias visibles al personal: el mesero o el cajero identifican al cliente de una cuenta por
// correo o teléfono (búsqueda exacta, datos enmascarados) y la cuenta, el KDS y el domicilio muestran sus alergias y
// preferencias; nada más del perfil.
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba } from './helpers/datos.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { obtenerCola } from '../src/modulos/cocina/cola.service.js'
import { PERMISOS_COCINA } from '../src/modulos/identidad/permisos.js'

const { ObjectId } = mongoose.Types
const SALON = '/api/v1/staff/salon'
const cocinero = { id: String(new ObjectId()), rol: 'cocina', permisos: ['pedido:ver', ...PERMISOS_COCINA.cocina], estaciones: ['cocina'] }
const PERFIL = { telefono: '300 123 4567', alergias: 'Maní', preferencias: 'Leche de almendra', fechaNacimiento: new Date('1990-11-05T00:00:00Z') }

let mesa, huevos
beforeEach(async () => {
    const zona = await Zona.create({ nombre: 'Interior' })
    mesa = await Mesa.create({ numero: 1, zona: zona._id, capacidad: 4 })
    huevos = await Producto.create({ codigo: 1, nombre: 'Huevos pericos', precio: 15000, categoria: (await categoriaDePrueba('Desayunos'))._id })
    await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes()])
})

const abrir = async (sesion) => (await sesion.post(`${SALON}/mesas/${mesa._id}/abrir`).send({ comensales: 2 })).body

describe('6.5 · Buscar un cliente', () => {
    it('por correo o teléfono exactos: nombre corto, alergias, preferencias, cumpleaños del mes y contacto enmascarado', async () => {
        const { usuario: cliente } = await crearConSesion('cliente', { ...PERFIL, nombre: 'Ana', apellido: 'Ruiz' })
        const { sesion } = await crearConSesion('mesero')
        const porCorreo = await sesion.get(`${SALON}/clientes`).query({ buscar: cliente.correo.toUpperCase() })
        expect(porCorreo.status, JSON.stringify(porCorreo.body)).toBe(200)
        // Sin alergias ni preferencias en la búsqueda: se ven solo después de identificarlo en una cuenta
        expect(porCorreo.body.clientes).toEqual([{
            id: String(cliente._id), nombre: 'Ana R.', tieneAvisos: true,
            correo: expect.stringMatching(/^cl\*+@example\.com$/), telefono: '******4567', cumpleEsteMes: expect.any(Boolean),
        }])
        expect(JSON.stringify(porCorreo.body)).not.toMatch(new RegExp(`${cliente.correo}|Maní`))
        expect(porCorreo.headers['cache-control']).toBe('no-store')
        const porTelefono = await sesion.get(`${SALON}/clientes`).query({ buscar: '3001234567' })
        expect(porTelefono.body.clientes.map((c) => c.id)).toEqual([String(cliente._id)])
    })

    it('sin coincidencia exacta no devuelve nada (ni por parte del correo); al personal no lo encuentra; texto corto, 400', async () => {
        const { usuario: cliente } = await crearConSesion('cliente', PERFIL)
        const { sesion, usuario: mesero } = await crearConSesion('mesero', { telefono: '3009998877' })
        expect((await sesion.get(`${SALON}/clientes`).query({ buscar: cliente.correo.slice(0, 5) })).body.clientes).toEqual([])
        expect((await sesion.get(`${SALON}/clientes`).query({ buscar: '1234567' })).body.clientes).toEqual([])
        expect((await sesion.get(`${SALON}/clientes`).query({ buscar: mesero.correo })).body.clientes).toEqual([])
        expect((await sesion.get(`${SALON}/clientes`).query({ buscar: 'ab' })).status).toBe(400)
    })

    it('un cliente sin el consentimiento de datos vigente no aparece ni se puede identificar (Ley 1581)', async () => {
        const { usuario: cliente } = await crearConSesion('cliente', { ...PERFIL, consentimiento: null })
        const { sesion } = await crearConSesion('mesero')
        expect((await sesion.get(`${SALON}/clientes`).query({ buscar: cliente.correo })).body.clientes).toEqual([])
        const cuenta = await abrir(sesion)
        expect((await sesion.put(`${SALON}/cuentas/${cuenta.id}/cliente`).send({ clienteId: String(cliente._id) })).status).toBe(400)
    })

    it('cocina y el cliente no pueden buscar (403)', async () => {
        for (const rol of ['cocina', 'cliente']) {
            const { sesion } = await crearConSesion(rol)
            expect((await sesion.get(`${SALON}/clientes`).query({ buscar: 'x@example.com' })).status, rol).toBe(403)
        }
    })
})

describe('6.5 · Cliente identificado en la cuenta', () => {
    it('el mesero lo identifica: la cuenta muestra sus alergias y preferencias (sin correo ni teléfono) y deja un Evento', async () => {
        const { usuario: cliente } = await crearConSesion('cliente', { ...PERFIL, nombre: 'Ana', apellido: 'Ruiz' })
        const { sesion } = await crearConSesion('mesero')
        const cuenta = await abrir(sesion)
        const r = await sesion.put(`${SALON}/cuentas/${cuenta.id}/cliente`).send({ clienteId: String(cliente._id), versionEsperada: cuenta.version })
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        expect(r.body.cliente).toEqual({ id: String(cliente._id), nombre: 'Ana R.', alergias: 'Maní', preferencias: 'Leche de almendra' })
        expect((await sesion.get(`${SALON}/cuentas/${cuenta.id}`)).body.cliente).toMatchObject({ alergias: 'Maní' })
        const evento = await Evento.findOne({ entidadId: cuenta.id, tipo: 'cliente_identificado' }).lean()
        expect(String(evento.datos.cliente)).toBe(String(cliente._id))
        expect(Object.keys(evento.datos).sort()).toEqual(['anterior', 'cliente']) // solo ids: ni alergias ni contacto
        const repetida = await sesion.put(`${SALON}/cuentas/${cuenta.id}/cliente`).send({ clienteId: String(cliente._id) })
        expect(repetida.body.version).toBe(r.body.version) // el reintento no escribe
        expect(await Evento.countDocuments({ entidadId: cuenta.id, tipo: 'cliente_identificado' })).toBe(1)

        const quitar = await sesion.put(`${SALON}/cuentas/${cuenta.id}/cliente`).send({ clienteId: null })
        expect(quitar.status).toBe(200)
        expect(quitar.body.cliente).toBeNull()
    })

    it('el KDS muestra el aviso en la tarjeta de la ronda', async () => {
        const { usuario: cliente } = await crearConSesion('cliente', PERFIL)
        const { sesion } = await crearConSesion('mesero')
        const cuenta = await abrir(sesion)
        await sesion.put(`${SALON}/cuentas/${cuenta.id}/cliente`).send({ clienteId: String(cliente._id) })
        await sesion.post(`${SALON}/cuentas/${cuenta.id}/items`).send({ productoId: String(huevos._id), cantidad: 1 })
        const version = (await Cuenta.findById(cuenta.id).lean()).version
        expect((await sesion.post(`${SALON}/cuentas/${cuenta.id}/rondas/1/enviar`).send({ versionEsperada: version })).status).toBe(200)
        const { salon } = await obtenerCola({ estacion: 'cocina' }, cocinero)
        expect(salon[0].avisoCliente).toEqual({ alergias: 'Maní', preferencias: 'Leche de almendra' })
    })

    it('un id que no es de un cliente activo, 400; sin el permiso, 403; cuenta cerrada, 409', async () => {
        const { sesion, usuario: mesero } = await crearConSesion('mesero')
        const cuenta = await abrir(sesion)
        expect((await sesion.put(`${SALON}/cuentas/${cuenta.id}/cliente`).send({ clienteId: String(mesero._id) })).status).toBe(400)
        expect((await sesion.put(`${SALON}/cuentas/${cuenta.id}/cliente`).send({ clienteId: String(new ObjectId()) })).status).toBe(400)
        const { sesion: cocina } = await crearConSesion('cocina')
        expect((await cocina.put(`${SALON}/cuentas/${cuenta.id}/cliente`).send({ clienteId: null })).status).toBe(403)
        await Cuenta.updateOne({ _id: cuenta.id }, { $set: { estado: 'cerrada', cerradaEn: new Date() } })
        const { usuario: cliente } = await crearConSesion('cliente')
        expect((await sesion.put(`${SALON}/cuentas/${cuenta.id}/cliente`).send({ clienteId: String(cliente._id) })).status).toBe(409)
    })
})

describe('6.5 · Domicilio', () => {
    it('la lista de pedidos del personal trae el aviso del cliente', async () => {
        const { usuario: cliente } = await crearConSesion('cliente', PERFIL)
        const { default: Pedido } = await import('../src/modulos/pedidos/pedido.model.js')
        const { estadoPorCodigo } = await import('../src/modulos/compartido/estados.service.js')
        const pendiente = await estadoPorCodigo('pedido', 'pendiente')
        await Pedido.collection.insertOne({
            usuario: cliente._id, estado: pendiente._id, canal: 'domicilio', total: 15000, direccion: 'Cra 1 #2-3', createdAt: new Date(), updatedAt: new Date(),
        })
        const { sesion } = await crearConSesion('admin')
        const r = await sesion.get('/api/v1/staff/pedidos')
        expect(r.status).toBe(200)
        expect(r.body[0].avisoCliente).toEqual({ alergias: 'Maní', preferencias: 'Leche de almendra' })
    })
})
