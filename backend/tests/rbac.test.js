import { describe, it, expect, vi, afterEach } from 'vitest'
import jwt from 'jsonwebtoken'
import { api } from './helpers/app.js'
import { crearConSesion, rolId } from './helpers/usuarios.js'
import Usuario from '../src/modulos/identidad/usuario.model.js'
import Rol from '../src/modulos/identidad/rol.model.js'
import Categoria from '../src/modulos/catalogo/categoria.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import MetodoPago from '../src/modulos/pedidos/metodoPago.model.js'
import { TTL_SESION_MS } from '../src/modulos/identidad/sesiones.js'

afterEach(() => vi.restoreAllMocks())

const RUTAS_STAFF = [
    ['get', '/api/v1/staff/pedidos'],
    ['get', '/api/v1/staff/reservas'],
    ['get', '/api/v1/admin/roles'],
    ['get', '/api/v1/admin/permisos'],
    ['get', '/api/v1/admin/usuarios'],
    ['get', '/api/v1/admin/estados'],
    ['get', '/api/v1/admin/productos'],
    ['get', '/api/v1/admin/metodos-pago'],
    ['get', '/api/v1/admin/comentarios'],
]

describe('401 sin sesión, 403 sin permiso', () => {
    it.each(RUTAS_STAFF)('%s %s sin sesión → 401', async (metodo, ruta) => {
        const res = await api()[metodo](ruta)
        expect(res.status).toBe(401)
        expect(res.body.error.code).toBe('UNAUTHORIZED')
    })

    it('un cliente recibe 403 en todas las rutas de staff', async () => {
        const { sesion } = await crearConSesion('cliente')
        for (const [metodo, ruta] of RUTAS_STAFF) {
            const res = await sesion[metodo](ruta)
            expect(res.status, `${metodo} ${ruta}`).toBe(403)
            expect(res.body.error.code).toBe('FORBIDDEN')
        }
    })

    it('el admin (permiso *) accede a todas', async () => {
        const { sesion } = await crearConSesion('admin')
        for (const [metodo, ruta] of RUTAS_STAFF) {
            const res = await sesion[metodo](ruta)
            expect(res.status, `${metodo} ${ruta}`).toBe(200)
        }
    })

    it('mesero ve pedidos y reservas, pero no roles, usuarios ni cambia estados de reserva', async () => {
        const { sesion } = await crearConSesion('mesero')
        expect((await sesion.get('/api/v1/staff/pedidos')).status).toBe(200)
        expect((await sesion.get('/api/v1/admin/estados?tipo=pedido')).status).toBe(200)
        expect((await sesion.get('/api/v1/admin/roles')).status).toBe(403)
        expect((await sesion.get('/api/v1/admin/usuarios')).status).toBe(403)
        expect((await sesion.get('/api/v1/staff/reservas')).status).toBe(200)
        expect((await sesion.patch('/api/v1/staff/reservas/000000000000000000000000/estado').send({ codigo: 'confirmada' })).status).toBe(403)
    })

    it('anfitrión ve reservas pero no pedidos', async () => {
        const { sesion } = await crearConSesion('anfitrion')
        expect((await sesion.get('/api/v1/staff/reservas')).status).toBe(200)
        expect((await sesion.get('/api/v1/staff/pedidos')).status).toBe(403)
    })

    it('un rol embebido en el token se ignora: manda la BD', async () => {
        const { usuario } = await crearConSesion('cliente')
        const falso = jwt.sign({ id: usuario._id, tv: 0, rol: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' })
        const res = await api().get('/api/v1/admin/roles').set('Cookie', `token=${falso}`)
        expect(res.status).toBe(403)
    })

    it('/auth/me devuelve los permisos', async () => {
        const { sesion } = await crearConSesion('mesero')
        const me = await sesion.get('/api/v1/auth/me')
        expect(me.body.user.permisos).toEqual([
            'pedido:ver',
            'pedido:cambiar_estado',
            'reserva:ver',
            'reserva:crear',
        ])
    })

    it('login devuelve los permisos actuales del rol', async () => {
        const { usuario } = await crearConSesion('mesero')
        const res = await api().post('/api/v1/auth/login').send({
            correo: usuario.correo,
            contraseña: 'secreta123',
        })

        expect(res.status).toBe(200)
        expect(res.body.permisos).toEqual([
            'pedido:ver',
            'pedido:cambiar_estado',
            'reserva:ver',
            'reserva:crear',
        ])
    })
})

describe('Propiedad: el cliente solo ve lo suyo', () => {
    const crearPedido = async (sesion) => {
        const categoria = await Categoria.findOneAndUpdate({ nombre: 'Bebidas' }, {}, { upsert: true, returnDocument: 'after' })
        const latte = await Producto.findOneAndUpdate({ codigo: 1 }, { nombre: 'Latte', precio: 9000, categoria: categoria._id }, { upsert: true, returnDocument: 'after' })
        const metodo = await MetodoPago.findOneAndUpdate({ codigo: 'contra-entrega' }, { nombre: 'Contra Entrega' }, { upsert: true, returnDocument: 'after' })
        const res = await sesion.post('/api/v1/cliente/pedidos').send({
            items: [{ productoRef: String(latte._id), cantidad: 1 }], nombre: 'Cliente', telefono: '3001234567', direccion: 'Calle 10 #20-30',
            hora: '10:00', barrio: 'Centro', metodoPagoId: String(metodo._id),
        })
        expect(res.status).toBe(201)
        return res.body.order
    }

    it('no lista ni consulta pedidos de otro cliente', async () => {
        const a = await crearConSesion('cliente')
        const b = await crearConSesion('cliente')
        const pedidoA = await crearPedido(a.sesion)

        const listaB = await b.sesion.get('/api/v1/cliente/pedidos')
        expect(listaB.body.orders).toHaveLength(0)
        const detalle = await b.sesion.get(`/api/v1/cliente/pedidos/${pedidoA._id}`)
        expect(detalle.status).toBe(404)
        expect((await a.sesion.get(`/api/v1/cliente/pedidos/${pedidoA._id}`)).status).toBe(200)
    })

    it('no puede editar ni cancelar la reserva de otro cliente', async () => {
        const a = await crearConSesion('cliente')
        const b = await crearConSesion('cliente')
        const fecha = new Date(Date.now() + 8 * 86400000)
        while ([0, 6].includes(fecha.getUTCDay())) fecha.setUTCDate(fecha.getUTCDate() + 1)
        const datos = { nombre: 'Ana Pérez', correo: 'ana@example.com', telefono: '3001234567', motivo: 'Desayuno', personas: 2, fecha: fecha.toISOString().slice(0, 10), hora: '09:00' }
        const creada = await a.sesion.post('/api/v1/cliente/reservas').send(datos)
        const id = creada.body.reservation._id

        expect((await b.sesion.patch(`/api/v1/cliente/reservas/${id}`).send(datos)).status).toBe(404)
        expect((await b.sesion.patch(`/api/v1/cliente/reservas/${id}/cancelar`)).status).toBe(404)
        expect((await b.sesion.get('/api/v1/cliente/reservas')).body.reservations).toHaveLength(0)
    })
})

describe('Revocación inmediata', () => {
    it('desactivar a un usuario corta su acceso en la siguiente petición', async () => {
        const admin = await crearConSesion('admin')
        const mesero = await crearConSesion('mesero')
        expect((await mesero.sesion.get('/api/v1/staff/pedidos')).status).toBe(200)

        const res = await admin.sesion.patch(`/api/v1/admin/usuarios/${mesero.usuario._id}`).send({ activo: false })
        expect(res.status).toBe(200)
        expect(res.body.activo).toBe(false)

        const corte = await mesero.sesion.get('/api/v1/staff/pedidos')
        expect(corte.status).toBe(401)
        expect(corte.body.error.code).toBe('ACCOUNT_DISABLED')
    })

    it('cambiar el rol aplica los nuevos permisos al instante', async () => {
        const admin = await crearConSesion('admin')
        const mesero = await crearConSesion('mesero')
        expect((await mesero.sesion.get('/api/v1/staff/pedidos')).status).toBe(200)

        await admin.sesion.patch(`/api/v1/admin/usuarios/${mesero.usuario._id}`).send({ rolId: await rolId('anfitrion') })
        expect((await mesero.sesion.get('/api/v1/staff/pedidos')).status).toBe(403)
        expect((await mesero.sesion.get('/api/v1/staff/reservas')).status).toBe(200)
    })

    it('editar los permisos de un rol afecta al instante a sus usuarios', async () => {
        const admin = await crearConSesion('admin')
        const mesero = await crearConSesion('mesero')
        expect((await mesero.sesion.get('/api/v1/staff/pedidos')).status).toBe(200)

        const res = await admin.sesion.put(`/api/v1/admin/roles/${await rolId('mesero')}`).send({
            permisos: ['pedido:ver', 'pedido:cambiar_estado', 'reserva:ver', 'reserva:crear'],
        })
        expect(res.status).toBe(200)
        expect(res.body.permisos).toEqual(['pedido:ver', 'pedido:cambiar_estado', 'reserva:ver', 'reserva:crear'])
        expect((await mesero.sesion.get('/api/v1/staff/pedidos')).status).toBe(200)
        expect((await mesero.sesion.get('/api/v1/staff/reservas')).status).toBe(200)
    })

    it('cambios directos en BD se aplican como máximo al vencer la caché (30 s)', async () => {
        const mesero = await crearConSesion('mesero')
        expect((await mesero.sesion.get('/api/v1/staff/pedidos')).status).toBe(200)
        await Usuario.updateOne({ _id: mesero.usuario._id }, { $set: { activo: false } })

        expect((await mesero.sesion.get('/api/v1/staff/pedidos')).status).toBe(200) // aún en caché
        const ahora = Date.now()
        vi.spyOn(Date, 'now').mockReturnValue(ahora + TTL_SESION_MS + 1)
        expect((await mesero.sesion.get('/api/v1/staff/pedidos')).status).toBe(401)
    })

    it('un usuario desactivado no puede iniciar sesión', async () => {
        const { usuario } = await crearConSesion('cliente', { activo: false }).catch(() => ({}))
        expect(usuario).toBeUndefined() // crearConSesion falla porque el login responde 403
        const inactivo = await Usuario.findOne({ activo: false })
        const res = await api().post('/api/v1/auth/login').send({ correo: inactivo.correo, contraseña: 'secreta123' })
        expect(res.status).toBe(403)
        expect(res.body.error.code).toBe('ACCOUNT_DISABLED')
    })
})

describe('Protecciones de administradores', () => {
    it('un admin no puede desactivarse ni quitarse el rol admin', async () => {
        const a = await crearConSesion('admin')
        await crearConSesion('admin') // hay otro admin: el bloqueo es por ser uno mismo
        const desactivar = await a.sesion.patch(`/api/v1/admin/usuarios/${a.usuario._id}`).send({ activo: false })
        expect(desactivar.status).toBe(409)
        expect(desactivar.body.error.code).toBe('AUTO_BLOQUEO')
        const degradar = await a.sesion.patch(`/api/v1/admin/usuarios/${a.usuario._id}`).send({ rolId: await rolId('mesero') })
        expect(degradar.body.error.code).toBe('AUTO_BLOQUEO')
    })

    it('no se puede desactivar ni degradar al último admin activo', async () => {
        const a = await crearConSesion('admin')
        const b = await crearConSesion('admin')
        // b deja de ser admin (a sigue): permitido
        expect((await a.sesion.patch(`/api/v1/admin/usuarios/${b.usuario._id}`).send({ activo: false })).status).toBe(200)

        // Un usuario con usuario:gestionar en otro rol intenta degradar al último admin
        await Rol.create({ nombre: 'supervisor', permisos: ['usuario:gestionar'] })
        const sup = await crearConSesion('supervisor')
        const res = await sup.sesion.patch(`/api/v1/admin/usuarios/${a.usuario._id}`).send({ rolId: await rolId('cliente') })
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('ULTIMO_ADMIN')
        const res2 = await sup.sesion.patch(`/api/v1/admin/usuarios/${a.usuario._id}`).send({ activo: false })
        expect(res2.body.error.code).toBe('ULTIMO_ADMIN')
    })

    it('un admin inactivo no cuenta como admin activo', async () => {
        const a = await crearConSesion('admin')
        await Usuario.create({ nombre: 'X', apellido: 'Y', correo: 'inactivo@example.com', contraseña: 'x', rol: await rolId('admin'), activo: false })
        await Rol.create({ nombre: 'supervisor', permisos: ['usuario:gestionar'] })
        const sup = await crearConSesion('supervisor')
        const res = await sup.sesion.patch(`/api/v1/admin/usuarios/${a.usuario._id}`).send({ activo: false })
        expect(res.body.error.code).toBe('ULTIMO_ADMIN')
    })

    it('valida el cuerpo del PATCH de usuarios', async () => {
        const a = await crearConSesion('admin')
        const c = await crearConSesion('cliente')
        expect((await a.sesion.patch(`/api/v1/admin/usuarios/${c.usuario._id}`).send({})).body.error.code).toBe('VALIDATION_ERROR')
        expect((await a.sesion.patch(`/api/v1/admin/usuarios/${c.usuario._id}`).send({ correo: 'x@y.co' })).body.error.code).toBe('VALIDATION_ERROR')
        expect((await a.sesion.patch(`/api/v1/admin/usuarios/${c.usuario._id}`).send({ rolId: '000000000000000000000000' })).status).toBe(400)
        expect((await a.sesion.patch('/api/v1/admin/usuarios/no-es-id').send({ activo: true })).status).toBe(404)
    })

    it('lista usuarios sin exponer contraseñas', async () => {
        const a = await crearConSesion('admin')
        const res = await a.sesion.get('/api/v1/admin/usuarios')
        expect(res.status).toBe(200)
        expect(res.body[0]).toMatchObject({ activo: true, rol: { codigo: 'admin' } })
        expect(JSON.stringify(res.body)).not.toContain('contraseña')
    })
})

describe('Protecciones de roles', () => {
    it('el rol admin no se puede editar ni borrar', async () => {
        const { sesion } = await crearConSesion('admin')
        const id = await rolId('admin')
        expect((await sesion.put(`/api/v1/admin/roles/${id}`).send({ permisos: ['pedido:ver'] })).body.error.code).toBe('ROL_PROTEGIDO')
        expect((await sesion.put(`/api/v1/admin/roles/${id}`).send({ nombre: 'Jefe' })).body.error.code).toBe('ROL_PROTEGIDO')
        expect((await sesion.delete(`/api/v1/admin/roles/${id}`)).body.error.code).toBe('ROL_PROTEGIDO')
        expect((await Rol.findById(id)).permisos).toEqual(['*'])
    })

    it('"*" y los permisos reservados no se pueden asignar; claves desconocidas tampoco', async () => {
        const { sesion } = await crearConSesion('admin')
        for (const permisos of [['*'], ['caja:cerrar'], ['hacer:todo']]) {
            const res = await sesion.post('/api/v1/admin/roles').send({ nombre: 'Prueba', permisos })
            expect(res.status, JSON.stringify(permisos)).toBe(400)
            expect(res.body.error.code).toBe('VALIDATION_ERROR')
        }
    })

    it('el rol cliente no admite permisos de staff (pero sí cambiar etiqueta)', async () => {
        const { sesion } = await crearConSesion('admin')
        const id = await rolId('cliente')
        expect((await sesion.put(`/api/v1/admin/roles/${id}`).send({ permisos: ['pedido:ver'] })).body.error.code).toBe('ROL_PROTEGIDO')
        const ok = await sesion.put(`/api/v1/admin/roles/${id}`).send({ nombre: 'Cliente web' })
        expect(ok.status).toBe(200)
        expect(ok.body).toMatchObject({ nombre: 'Cliente web', permisos: [], permisosEditables: false })
    })

    it('no se borra un rol con usuarios ni un rol de sistema; sí uno personalizado vacío', async () => {
        const { sesion } = await crearConSesion('admin')
        const creado = await sesion.post('/api/v1/admin/roles').send({ nombre: 'Supervisor', permisos: ['pedido:ver'] })
        expect(creado.status).toBe(201)

        await Usuario.create({ nombre: 'S', apellido: 'U', correo: 'sup@example.com', contraseña: 'x', rol: creado.body.id })
        const conUsuarios = await sesion.delete(`/api/v1/admin/roles/${creado.body.id}`)
        expect(conUsuarios.status).toBe(409)

        expect((await sesion.delete(`/api/v1/admin/roles/${await rolId('mesero')}`)).body.error.code).toBe('ROL_PROTEGIDO')

        await Usuario.deleteOne({ correo: 'sup@example.com' })
        expect((await sesion.delete(`/api/v1/admin/roles/${creado.body.id}`)).status).toBe(200)
    })

    it('ninguno de los 9 roles de sistema se puede eliminar (0.7b)', async () => {
        const { sesion } = await crearConSesion('admin')
        const sistema = ['admin', 'cliente', 'mesero', 'anfitrion', 'cocina', 'barista', 'cajero', 'repartidor', 'compras']
        const lista = (await sesion.get('/api/v1/admin/roles')).body
        for (const codigo of sistema) {
            const rol = lista.find((r) => r.codigo === codigo)
            expect(rol, codigo).toMatchObject({ esSistema: true, eliminable: false })
            const res = await sesion.delete(`/api/v1/admin/roles/${rol.id}`)
            expect(res.status, codigo).toBe(403)
            expect(res.body.error.code).toBe('ROL_PROTEGIDO')
        }
        expect(await Rol.countDocuments({ nombre: { $in: sistema } })).toBe(9)
    })

    it('rol con usuarios: 409 ROL_CON_USUARIOS con plural correcto (0.7b)', async () => {
        const { sesion } = await crearConSesion('admin')
        const creado = await sesion.post('/api/v1/admin/roles').send({ nombre: 'Supervisor', permisos: [] })
        await Usuario.create({ nombre: 'S', apellido: 'U', correo: 'sup1@example.com', contraseña: 'x', rol: creado.body.id })
        const uno = await sesion.delete(`/api/v1/admin/roles/${creado.body.id}`)
        expect(uno.status).toBe(409)
        expect(uno.body.error).toMatchObject({ code: 'ROL_CON_USUARIOS', details: { usuariosAsignados: 1 } })
        expect(uno.body.error.message).toBe('No se puede eliminar: tiene 1 usuario asignado.')

        await Usuario.create({ nombre: 'S', apellido: 'U', correo: 'sup2@example.com', contraseña: 'x', rol: creado.body.id })
        const dos = await sesion.delete(`/api/v1/admin/roles/${creado.body.id}`)
        expect(dos.body.error.message).toBe('No se puede eliminar: tiene 2 usuarios asignados.')
        const enLista = (await sesion.get('/api/v1/admin/roles')).body.find((r) => r.id === creado.body.id)
        expect(enLista).toMatchObject({ usuariosAsignados: 2, eliminable: false, esSistema: false })
    })

    it('GET /api/v1/admin/permisos devuelve el catálogo con reservados marcados', async () => {
        const { sesion } = await crearConSesion('admin')
        const res = await sesion.get('/api/v1/admin/permisos')
        const porClave = Object.fromEntries(res.body.map((p) => [p.clave, p]))
        expect(porClave['pedido:cancelar'].reservado).toBe(false)
        expect(porClave['reserva:crear']).toMatchObject({
            modulo: 'reservas',
            reservado: false,
        })
        expect(porClave['caja:cerrar'].reservado).toBe(true)
        expect(porClave['*']).toBeUndefined()
    })
})
