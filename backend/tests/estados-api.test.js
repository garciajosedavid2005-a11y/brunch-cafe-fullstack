// Estados por API: transiciones de staff y cliente, eventos y edición de estados
import { describe, it, expect, beforeEach } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import { crearPedido, crearReserva, datosReserva } from './helpers/datos.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import Estado from '../src/modulos/compartido/estado.model.js'

const eventosDe = (entidadId) => Evento.find({ entidadId }).sort({ createdAt: 1, _id: 1 }).lean()
const avanzar = (sesion, id, codigo, extra = {}) =>
    sesion.patch(`/api/v1/staff/pedidos/${id}/estado`).send({ codigo, ...extra })

describe('Pedidos: transiciones de staff', () => {
    let cliente, admin, mesero, pedidoId

    beforeEach(async () => {
        cliente = (await crearConSesion('cliente')).sesion
        admin = await crearConSesion('admin')
        mesero = await crearConSesion('mesero')
        pedidoId = await crearPedido(cliente)
    })

    it('crear un pedido registra el evento inicial', async () => {
        const eventos = await eventosDe(pedidoId)
        expect(eventos).toHaveLength(1)
        expect(eventos[0]).toMatchObject({ entidad: 'pedido', de: null, a: 'pendiente', actor: 'cliente' })
    })

    it('el listado trae codigo y las transiciones que el usuario puede hacer', async () => {
        const deMesero = (await mesero.sesion.get('/api/v1/staff/pedidos')).body[0]
        expect(deMesero).toMatchObject({ estado: 'Pendiente', estadoCodigo: 'pendiente', esFinal: false })
        expect(deMesero.transiciones.map((t) => t.codigo)).toEqual(['confirmado'])

        const deAdmin = (await admin.sesion.get('/api/v1/staff/pedidos')).body[0]
        expect(deAdmin.transiciones).toEqual(expect.arrayContaining([
            expect.objectContaining({ codigo: 'cancelado', requiereMotivo: true }),
        ]))
    })

    it('avanza en orden hasta entregado y deja cada cambio en Evento', async () => {
        for (const codigo of ['confirmado', 'en_preparacion', 'listo', 'en_camino', 'entregado']) {
            const res = await avanzar(mesero.sesion, pedidoId, codigo)
            expect(res.status, codigo).toBe(200)
            expect(res.body.estadoCodigo).toBe(codigo)
        }
        const eventos = await eventosDe(pedidoId)
        expect(eventos.map((e) => [e.de, e.a])).toEqual([
            [null, 'pendiente'], ['pendiente', 'confirmado'], ['confirmado', 'en_preparacion'],
            ['en_preparacion', 'listo'], ['listo', 'en_camino'], ['en_camino', 'entregado'],
        ])
        expect(String(eventos[1].usuario)).toBe(String(mesero.usuario._id))
        expect(eventos[1].actor).toBe('mesero')

        const cliente2 = await cliente.get('/api/v1/cliente/pedidos')
        expect(cliente2.body.orders[0]).toMatchObject({ status: 'delivered', codigo: 'entregado', statusLabel: 'Entregado' })
    })

    it('acepta el _id del Estado (compatibilidad con el dashboard)', async () => {
        const confirmado = await Estado.findOne({ tipo: 'pedido', codigo: 'confirmado' })
        const res = await mesero.sesion.patch(`/api/v1/staff/pedidos/${pedidoId}/estado`).send({ estado: String(confirmado._id) })
        expect(res.status).toBe(200)
        expect(res.body.estado).toBe('Confirmado')
    })

    it('no permite saltar etapas (409) ni un estado de reserva (400)', async () => {
        const salto = await avanzar(mesero.sesion, pedidoId, 'listo')
        expect(salto.status).toBe(409)
        expect(salto.body.error).toMatchObject({ code: 'TRANSICION_INVALIDA', details: { permitidos: ['confirmado'] } })

        const deReserva = await Estado.findOne({ tipo: 'reserva', codigo: 'confirmada' })
        const res = await mesero.sesion.patch(`/api/v1/staff/pedidos/${pedidoId}/estado`).send({ estado: String(deReserva._id) })
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('ESTADO_INVALIDO')
    })

    it('cancelar exige pedido:cancelar y motivo', async () => {
        const sinPermiso = await avanzar(mesero.sesion, pedidoId, 'cancelado', { motivo: 'cliente llamó' })
        expect(sinPermiso.status).toBe(403)
        expect(sinPermiso.body.error.details).toEqual({ requiere: ['pedido:cancelar'] })

        const sinMotivo = await avanzar(admin.sesion, pedidoId, 'cancelado')
        expect(sinMotivo.status).toBe(400)
        expect(sinMotivo.body.error.code).toBe('MOTIVO_REQUERIDO')

        const ok = await avanzar(admin.sesion, pedidoId, 'cancelado', { motivo: 'Sin domiciliarios' })
        expect(ok.status).toBe(200)
        const [, cancelacion] = await eventosDe(pedidoId)
        expect(cancelacion).toMatchObject({ de: 'pendiente', a: 'cancelado', motivo: 'Sin domiciliarios', actor: 'admin' })
    })

    it('un pedido en estado final no se reabre', async () => {
        await avanzar(admin.sesion, pedidoId, 'cancelado', { motivo: 'prueba' })
        const res = await avanzar(admin.sesion, pedidoId, 'pendiente')
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('ESTADO_FINAL')
    })

    it('un rol con solo pedido:cancelar entra a la ruta pero no puede avanzar', async () => {
        const rolSoloCancela = await crearConSesion('compras')
        const { default: Rol } = await import('../src/modulos/identidad/rol.model.js')
        await Rol.updateOne({ nombre: 'compras' }, { permisos: ['pedido:cancelar'] })
        const { invalidarSesionesDeRol } = await import('../src/modulos/identidad/sesiones.js')
        invalidarSesionesDeRol(rolSoloCancela.usuario.rol)

        expect((await avanzar(rolSoloCancela.sesion, pedidoId, 'confirmado')).status).toBe(403)
        expect((await avanzar(rolSoloCancela.sesion, pedidoId, 'cancelado', { motivo: 'x' })).status).toBe(200)
    })
})

describe('Pedidos: cancelación por el cliente', () => {
    it('cancela su pedido pendiente; no uno confirmado ni uno ajeno', async () => {
        const { sesion: cliente } = await crearConSesion('cliente')
        const { sesion: otro } = await crearConSesion('cliente')
        const { sesion: admin } = await crearConSesion('admin')
        const pendiente = await crearPedido(cliente)
        const confirmado = await crearPedido(cliente)
        await avanzar(admin, confirmado, 'confirmado')

        expect((await otro.patch(`/api/v1/cliente/pedidos/${pendiente}/cancelar`)).status).toBe(404)

        const ok = await cliente.patch(`/api/v1/cliente/pedidos/${pendiente}/cancelar`).send({ motivo: 'Me equivoqué' })
        expect(ok.status).toBe(200)
        expect(ok.body.order).toMatchObject({ status: 'cancelled', codigo: 'cancelado' })
        const ultimo = (await eventosDe(pendiente)).at(-1)
        expect(ultimo).toMatchObject({ de: 'pendiente', a: 'cancelado', motivo: 'Me equivoqué', actor: 'cliente' })

        const tarde = await cliente.patch(`/api/v1/cliente/pedidos/${confirmado}/cancelar`)
        expect(tarde.status).toBe(409)
        expect(tarde.body.error.code).toBe('TRANSICION_INVALIDA')
    })
})

describe('Reservas: transiciones', () => {
    let cliente, anfitrion, reservaId
    const cambiar = (sesion, codigo, extra = {}) =>
        sesion.patch(`/api/v1/staff/reservas/${reservaId}/estado`).send({ codigo, ...extra })

    beforeEach(async () => {
        cliente = (await crearConSesion('cliente')).sesion
        anfitrion = await crearConSesion('anfitrion')
        reservaId = await crearReserva(cliente)
    })

    it('anfitrión: confirmada → sentada → completada, con eventos; luego no se reabre', async () => {
        for (const codigo of ['confirmada', 'sentada', 'completada']) {
            const res = await cambiar(anfitrion.sesion, codigo)
            expect(res.status, codigo).toBe(200)
            expect(res.body.estadoCodigo).toBe(codigo)
        }
        expect((await eventosDe(reservaId)).map((e) => e.a)).toEqual(['pendiente', 'confirmada', 'sentada', 'completada'])

        const reabrir = await cambiar(anfitrion.sesion, 'confirmada')
        expect(reabrir.status).toBe(409)
        expect(reabrir.body.error.code).toBe('ESTADO_FINAL')

        const lista = await cliente.get('/api/v1/cliente/reservas')
        expect(lista.body.reservations[0]).toMatchObject({ status: 'completed', codigo: 'completada' })
    })

    it('check-in sin confirmar deja Evento con su motivo (0.7b)', async () => {
        const res = await cambiar(anfitrion.sesion, 'sentada')
        expect(res.status).toBe(200)
        expect((await eventosDe(reservaId)).at(-1)).toMatchObject({ de: 'pendiente', a: 'sentada', motivo: 'check-in sin confirmar' })
    })

    it('staff cancela una reserva solo con motivo (0.7b)', async () => {
        const sinMotivo = await cambiar(anfitrion.sesion, 'cancelada')
        expect(sinMotivo.status).toBe(400)
        expect(sinMotivo.body.error.code).toBe('MOTIVO_REQUERIDO')
        const ok = await cambiar(anfitrion.sesion, 'cancelada', { motivo: 'Sin cupo' })
        expect(ok.status).toBe(200)
        expect((await eventosDe(reservaId)).at(-1)).toMatchObject({ a: 'cancelada', motivo: 'Sin cupo' })
    })

    it('no_show solo desde confirmada', async () => {
        expect((await cambiar(anfitrion.sesion, 'no_show')).status).toBe(409)
        await cambiar(anfitrion.sesion, 'confirmada')
        const res = await cambiar(anfitrion.sesion, 'no_show')
        expect(res.status).toBe(200)
        expect(res.body.esFinal).toBe(true)
    })

    it('mesero (sin reserva:cambiar_estado) → 403', async () => {
        const { sesion: mesero } = await crearConSesion('mesero')
        expect((await cambiar(mesero, 'confirmada')).status).toBe(403)
    })

    it('cliente edita una reserva confirmada → vuelve a pendiente con evento "editada por cliente"', async () => {
        await cambiar(anfitrion.sesion, 'confirmada')
        const res = await cliente.patch(`/api/v1/cliente/reservas/${reservaId}`).send(datosReserva({ personas: 4 }))
        expect(res.status).toBe(200)
        expect(res.body.reservation).toMatchObject({ status: 'pending', personas: 4 })
        const ultimo = (await eventosDe(reservaId)).at(-1)
        expect(ultimo).toMatchObject({ de: 'confirmada', a: 'pendiente', motivo: 'editada por cliente', actor: 'cliente' })
    })

    it('editar una pendiente no crea evento de estado', async () => {
        await cliente.patch(`/api/v1/cliente/reservas/${reservaId}`).send(datosReserva({ personas: 5 }))
        expect(await eventosDe(reservaId)).toHaveLength(1)
    })

    it('el cliente no edita ni cancela una reserva ya sentada', async () => {
        await cambiar(anfitrion.sesion, 'confirmada')
        await cambiar(anfitrion.sesion, 'sentada')
        expect((await cliente.patch(`/api/v1/cliente/reservas/${reservaId}`).send(datosReserva())).status).toBe(404)
        const cancelar = await cliente.patch(`/api/v1/cliente/reservas/${reservaId}/cancelar`)
        expect(cancelar.status).toBe(409)
        expect(cancelar.body.error.code).toBe('TRANSICION_INVALIDA')
    })

    it('cancelar una reserva del cliente queda en Evento', async () => {
        const res = await cliente.patch(`/api/v1/cliente/reservas/${reservaId}/cancelar`)
        expect(res.status).toBe(200)
        expect((await eventosDe(reservaId)).at(-1)).toMatchObject({ a: 'cancelada', motivo: 'cancelada por cliente' })
    })
})

describe('Catálogo de estados por API', () => {
    let admin

    beforeEach(async () => {
        admin = (await crearConSesion('admin')).sesion
    })

    it('lista los estados en el orden del flujo con su código', async () => {
        const res = await admin.get('/api/v1/admin/estados?tipo=pedido')
        expect(res.body.map((e) => e.codigo)).toEqual(
            ['pendiente', 'confirmado', 'en_preparacion', 'listo', 'en_camino', 'entregado', 'cancelado'])
    })

    it('solo se edita la presentación', async () => {
        const [pendiente] = (await admin.get('/api/v1/admin/estados?tipo=reserva')).body
        const ok = await admin.put(`/api/v1/admin/estados/${pendiente.id}`).send({ nombre: 'Por aprobar', color: '#123456', descripcion: 'x' })
        expect(ok.status).toBe(200)
        expect(ok.body).toMatchObject({ nombre: 'Por aprobar', codigo: 'pendiente', color: '#123456' })

        for (const campo of [{ esFinal: true }, { codigo: 'otro' }, { tipo: 'pedido' }]) {
            const res = await admin.put(`/api/v1/admin/estados/${pendiente.id}`).send(campo)
            expect(res.status, JSON.stringify(campo)).toBe(400)
            expect(res.body.error.code).toBe('VALIDATION_ERROR')
        }
    })

    it('crear y borrar estados → 405 ESTADOS_FIJOS', async () => {
        const [pendiente] = (await admin.get('/api/v1/admin/estados?tipo=pedido')).body
        const crear = await admin.post('/api/v1/admin/estados').send({ nombre: 'Nuevo', tipo: 'pedido' })
        expect(crear.status).toBe(405)
        expect(crear.body.error.code).toBe('ESTADOS_FIJOS')
        expect((await admin.delete(`/api/v1/admin/estados/${pendiente.id}`)).status).toBe(405)
    })

    it('un estado sin colores guardados usa los del catálogo, no el amarillo fijo (0.7c)', async () => {
        await Estado.collection.updateOne({ tipo: 'reserva', codigo: 'cancelada' }, { $unset: { color: '', bg: '', badgeType: '' } })
        await Estado.collection.updateOne({ tipo: 'pedido', codigo: 'pendiente' }, { $unset: { color: '', bg: '', badgeType: '' } })
        const reservas = (await admin.get('/api/v1/admin/estados?tipo=reserva')).body
        expect(reservas.find((e) => e.codigo === 'cancelada')).toMatchObject({ color: '#a33a3a', bg: '#fdecec', badgeType: 'danger' })
        const pedidos = (await admin.get('/api/v1/admin/estados?tipo=pedido')).body
        expect(pedidos.find((e) => e.codigo === 'pendiente')).toMatchObject({ color: '#7a5000', bg: '#fff8e1', badgeType: 'warning' })
    })

    it('el seed respeta etiquetas editadas y vuelve a fijar esFinal', async () => {
        const { sembrarEstados } = await import('../src/seeds/estados.js')
        await Estado.updateOne({ tipo: 'pedido', codigo: 'entregado' }, { nombre: 'Recibido', esFinal: false })
        await sembrarEstados()
        const entregado = await Estado.findOne({ tipo: 'pedido', codigo: 'entregado' })
        expect(entregado).toMatchObject({ nombre: 'Recibido', esFinal: true })
        expect(await Estado.countDocuments()).toBe(13)
    })
})
