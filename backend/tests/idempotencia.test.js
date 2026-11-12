import { describe, it, expect, beforeEach } from 'vitest'
import { crearConSesion } from './helpers/usuarios.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Pedido from '../src/modulos/pedidos/pedido.model.js'
import { categoriaDePrueba } from './helpers/datos.js'
import SolicitudIdempotente from '../src/modulos/compartido/solicitudIdempotente.model.js'
import { EN_CURSO_MAXIMO_MS } from '../src/modulos/compartido/idempotencia.js'

describe('Idempotency-Key en la creación de pedidos (0.9)', () => {
    let cliente
    let cuerpo
    beforeEach(async () => {
        ;({ sesion: cliente } = await crearConSesion('cliente'))
        const categoria = await categoriaDePrueba('Bebidas')
        const latte = await Producto.create({ codigo: 11, nombre: 'Latte', precio: 9000, categoria: categoria._id })
        const metodos = await cliente.get('/api/v1/cliente/metodos-pago')
        cuerpo = {
            items: [{ productoRef: String(latte._id), cantidad: 1 }], nombre: 'Ana Pérez', telefono: '3001234567',
            direccion: 'Carrera 36B #30-06', hora: '10:00', barrio: 'Centro', metodoPagoId: metodos.body[0].id,
        }
    })
    const pedir = (clave, datos = cuerpo, sesion = cliente) => {
        const req = sesion.post('/api/v1/cliente/pedidos')
        return (clave ? req.set('Idempotency-Key', clave) : req).send(datos)
    }

    it('la misma clave y los mismos datos devuelven el mismo pedido sin crear otro', async () => {
        const primera = await pedir('compra-0001')
        expect(primera.status).toBe(201)
        expect(primera.headers['idempotent-replayed']).toBeUndefined()
        const repetida = await pedir('compra-0001')
        expect(repetida.status).toBe(201)
        expect(repetida.headers['idempotent-replayed']).toBe('true')
        expect(repetida.body).toEqual(primera.body)
        expect(await Pedido.countDocuments()).toBe(1)
    })

    it('dos envíos simultáneos con la misma clave crean un solo pedido', async () => {
        const respuestas = await Promise.all([pedir('doble-clic-01'), pedir('doble-clic-01')])
        expect(await Pedido.countDocuments()).toBe(1)
        for (const r of respuestas) expect([201, 409]).toContain(r.status)
        const enCurso = respuestas.find((r) => r.status === 409)
        if (enCurso) expect(enCurso.body.error.code).toBe('IDEMPOTENCY_IN_PROGRESS')
    })

    it('la misma clave con otros datos → 422', async () => {
        await pedir('compra-0002')
        const otra = await pedir('compra-0002', { ...cuerpo, barrio: 'Norte' })
        expect(otra.status).toBe(422)
        expect(otra.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED')
        expect(await Pedido.countDocuments()).toBe(1)
    })

    it('si la petición falla, la clave no queda usada (se puede corregir y reintentar)', async () => {
        expect((await pedir('compra-0003', { ...cuerpo, hora: '08:00' })).status).toBe(400)
        expect((await pedir('compra-0003')).status).toBe(201)
    })

    it('1.14 · un 409 PRODUCT_UNAVAILABLE tampoco deja la clave usada (se reintenta con los mismos datos)', async () => {
        await Producto.updateOne({ codigo: 11 }, { disponible: false })
        const agotado = await pedir('compra-0004')
        expect(agotado.status).toBe(409)
        expect(agotado.body.error.code).toBe('PRODUCT_UNAVAILABLE')
        await Producto.updateOne({ codigo: 11 }, { disponible: true })
        const reintento = await pedir('compra-0004')
        expect(reintento.status).toBe(201)
        expect(reintento.headers['idempotent-replayed']).toBeUndefined()
        expect(await Pedido.countDocuments()).toBe(1)
    })

    it('las claves son por usuario', async () => {
        const { sesion: otro } = await crearConSesion('cliente')
        await pedir('compartida-01')
        expect((await pedir('compartida-01', cuerpo, otro)).status).toBe(201)
        expect(await Pedido.countDocuments()).toBe(2)
    })

    it('sin cabecera funciona como antes y una clave mal formada → 400', async () => {
        expect((await pedir(null)).status).toBe(201)
        expect((await pedir(null)).status).toBe(201)
        const mala = await pedir('corta')
        expect(mala.status).toBe(400)
        expect(mala.body.error.code).toBe('IDEMPOTENCY_KEY_INVALID')
    })

    it('el alias /api/v1/cliente/pedidos también la respeta', async () => {
        await cliente.post('/api/v1/cliente/pedidos').set('Idempotency-Key', 'alias-0001').send(cuerpo)
        const repetida = await cliente.post('/api/v1/cliente/pedidos').set('Idempotency-Key', 'alias-0001').send(cuerpo)
        expect(repetida.headers['idempotent-replayed']).toBe('true')
        expect(await Pedido.countDocuments()).toBe(1)
    })

    // 1.5 · Si el proceso cae a mitad de una petición, la clave no queda «en curso» 24 h
    describe('clave que quedó en curso (el proceso cayó)', () => {
        /** Deja la clave como si el proceso hubiera caído hace `msAtras` con la petición a medias. */
        const dejarEnCurso = async (clave, msAtras) => {
            expect((await pedir(clave)).status).toBe(201)
            await Pedido.deleteMany({})
            await SolicitudIdempotente.updateOne(
                { clave },
                { $set: { estado: 'en_proceso', createdAt: new Date(Date.now() - msAtras) }, $unset: { status: '', cuerpo: '' } },
            )
        }

        it('caduca en pocos minutos (no 24 h)', () => {
            expect(EN_CURSO_MAXIMO_MS).toBeGreaterThanOrEqual(60_000)
            expect(EN_CURSO_MAXIMO_MS).toBeLessThanOrEqual(5 * 60_000)
        })

        it('reciente → 409 IDEMPOTENCY_IN_PROGRESS', async () => {
            await dejarEnCurso('caida-reciente', 10_000)
            const res = await pedir('caida-reciente')
            expect(res.status).toBe(409)
            expect(res.body.error.code).toBe('IDEMPOTENCY_IN_PROGRESS')
            expect(await Pedido.countDocuments()).toBe(0)
        })

        it('vencida → la petición se procesa de nuevo y la clave queda completada', async () => {
            await dejarEnCurso('caida-vencida', EN_CURSO_MAXIMO_MS + 1000)
            const res = await pedir('caida-vencida')
            expect(res.status).toBe(201)
            expect(res.headers['idempotent-replayed']).toBeUndefined()
            expect(await Pedido.countDocuments()).toBe(1)
            const repetida = await pedir('caida-vencida')
            expect(repetida.headers['idempotent-replayed']).toBe('true')
            expect(await Pedido.countDocuments()).toBe(1)
        })

        it('vencida con otros datos → 422 (la huella sigue mandando)', async () => {
            await dejarEnCurso('caida-otra', EN_CURSO_MAXIMO_MS + 1000)
            expect((await pedir('caida-otra', { ...cuerpo, barrio: 'Norte' })).status).toBe(422)
        })

        it('dos reintentos simultáneos sobre una clave vencida: solo uno la retoma', async () => {
            await dejarEnCurso('caida-doble', EN_CURSO_MAXIMO_MS + 1000)
            const respuestas = await Promise.all([pedir('caida-doble'), pedir('caida-doble')])
            expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409])
            expect(await Pedido.countDocuments()).toBe(1)
        })
    })
})
