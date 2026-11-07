// Línea base del flujo del cliente: protege registro, login, menú, pedidos y
// reservas mientras se refactoriza. Si un ítem cambia el contrato a propósito,
// se actualiza aquí en el mismo commit.
import { describe, it, expect, beforeEach } from 'vitest'
import { agente, api } from './helpers/app.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import { categoriaDePrueba } from './helpers/datos.js'

const usuario = {
    nombre: 'Ana',
    apellido: 'Pérez',
    correo: 'ana@example.com',
    contraseña: 'secreta123',
    telefono: '3001234567',
}

// Próximo día hábil a 7+ días (09:00 es válida en cualquier horario actual)
const fechaFutura = (dias = 7) => {
    const d = new Date(Date.now() + dias * 86400000)
    while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
}

describe('Línea base del cliente', () => {
    let cliente

    beforeEach(async () => {
        cliente = agente()
        const res = await cliente.post('/api/v1/auth/registro').send(usuario)
        expect(res.status).toBe(200)
    })

    it('registro deja sesión y /auth/me devuelve el usuario', async () => {
        const me = await cliente.get('/api/v1/auth/me')
        expect(me.status).toBe(200)
        expect(me.body.user).toMatchObject({ email: usuario.correo, role: 'cliente' })
    })

    it('login con credenciales válidas', async () => {
        const res = await agente().post('/api/v1/auth/login').send({ correo: usuario.correo, contraseña: usuario.contraseña })
        expect(res.status).toBe(200)
        expect(res.headers['set-cookie']?.[0]).toMatch(/^token=/)
    })

    it('perfil del cliente se consulta y edita', async () => {
        const res = await cliente.patch('/api/v1/cliente/perfil').send({
            nombre: 'Ana María', apellido: 'Pérez', correo: usuario.correo, telefono: '3007654321',
        })
        expect(res.status).toBe(200)
        expect(res.body.perfil.nombre).toBe('Ana María')
    })

    it('crea un pedido con precio calculado en el servidor', async () => {
        const categoria = await categoriaDePrueba('Bebidas')
        await Producto.create({ codigo: 1, nombre: 'Latte', precio: 9000, categoria: categoria._id })

        const menu = await cliente.get('/api/v1/catalogo')
        expect(menu.body.productos).toHaveLength(1)

        const metodos = await cliente.get('/api/v1/cliente/metodos-pago')
        expect(metodos.status).toBe(200)
        const contraEntrega = metodos.body.find((m) => m.nombre === 'Contra Entrega')

        const latte = await Producto.findOne({ codigo: 1 })
        const res = await cliente.post('/api/v1/cliente/pedidos').send({
            items: [{ productoRef: String(latte._id), cantidad: 2 }],
            nombre: 'Ana Pérez',
            telefono: '3001234567',
            direccion: 'Carrera 36B #30-06',
            hora: '10:00',
            barrio: 'Centro',
            metodoPagoId: contraEntrega.id,
        })
        expect(res.status).toBe(201)
        expect(res.body.order).toMatchObject({ total: 18000, statusLabel: 'Pendiente' })

        const lista = await cliente.get('/api/v1/cliente/pedidos')
        expect(lista.body.orders).toHaveLength(1)
    })

    it('crea, edita y cancela una reserva', async () => {
        const datos = {
            nombre: 'Ana Pérez', correo: usuario.correo, telefono: '3001234567', motivo: 'Desayuno',
            personas: 2, fecha: fechaFutura(), hora: '09:00',
        }
        const creada = await cliente.post('/api/v1/cliente/reservas').send(datos)
        expect(creada.status).toBe(201)
        const id = creada.body.reservation._id

        const editada = await cliente.patch(`/api/v1/cliente/reservas/${id}`).send({ ...datos, personas: 3 })
        expect(editada.status).toBe(200)
        expect(editada.body.reservation.personas).toBe(3)

        const cancelada = await cliente.patch(`/api/v1/cliente/reservas/${id}/cancelar`)
        expect(cancelada.status).toBe(200)
        expect(cancelada.body.reservation.status).toBe('cancelled')
    })

    it('rutas del cliente exigen sesión', async () => {
        const res = await api().get('/api/v1/cliente/pedidos')
        expect(res.status).toBe(401)
    })
})
