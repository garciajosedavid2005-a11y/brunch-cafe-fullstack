// 2.3 · Cola por estación (PLAN_FASE_2 §2.3; F2-3, F2-4, F2-7): rondas enviadas del salón con ítems
// pendientes de la estación (y las recién terminadas, durante los 10 s del «Deshacer») y pedidos a
// domicilio confirmados o en preparación con líneas de esa estación que aún no terminó. El pedido pasa a
// en_preparacion cuando alguna estación empieza y a listo cuando todas sus estaciones terminaron
// (pedido:preparar). Cada estación trae sus umbrales del temporizador.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { categoriaDePrueba, crearPedido } from './helpers/datos.js'
import { crearConSesion } from './helpers/usuarios.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Estacion from '../src/modulos/catalogo/estacion.model.js'
import Pedido from '../src/modulos/pedidos/pedido.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import Usuario from '../src/modulos/identidad/usuario.model.js'
import Rol from '../src/modulos/identidad/rol.model.js'
import { PERMISOS_SALON, PERMISOS_COCINA } from '../src/modulos/identidad/permisos.js'
import { abrirCuenta, agregarItem, enviarRonda, cerrarSinCobro } from '../src/modulos/salon/cuentas.service.js'
import { todoListo, obtenerCola, marcarPedidoEstacion } from '../src/modulos/cocina/cocina.service.js'
import { filtroColaSalon } from '../src/modulos/cocina/cola.service.js'
import DetallePedido from '../src/modulos/pedidos/detallePedido.model.js'
import { estadoPorCodigo } from '../src/modulos/compartido/estados.service.js'

const { ObjectId } = mongoose.Types
const error = async (promesa) => {
    try {
        await promesa
    } catch (e) {
        return e
    }
    throw new Error('Se esperaba un error')
}

let mesero
let cocinero
let barista
let admin
let mesa1
let mesa2
let huevos
let tostada
let latte

beforeEach(async () => {
    await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes()])
    const rolMesero = await Rol.findOne({ nombre: 'mesero' })
    const persona = await Usuario.create({ nombre: 'Lucía', apellido: 'Gómez', correo: 'lucia@example.com', contraseña: 'x'.repeat(20), rol: rolMesero._id })
    mesero = { id: String(persona._id), rol: 'mesero', permisos: [...PERMISOS_SALON.mesero, ...PERMISOS_COCINA.mesero] }
    cocinero = { id: String(new ObjectId()), rol: 'cocina', permisos: ['pedido:ver', ...PERMISOS_COCINA.cocina] }
    barista = { id: String(new ObjectId()), rol: 'barista', permisos: ['pedido:ver', ...PERMISOS_COCINA.barista] }
    admin = { id: String(new ObjectId()), rol: 'admin', permisos: ['*'] }
    const zona = await Zona.create({ nombre: 'Interior' })
    mesa1 = await Mesa.create({ numero: 1, zona: zona._id, capacidad: 4 })
    mesa2 = await Mesa.create({ numero: 2, zona: zona._id, capacidad: 4 })
    const platos = await categoriaDePrueba('Desayunos')
    const bebidas = await categoriaDePrueba('Bebidas')
    huevos = await Producto.create({ codigo: 9101, nombre: 'Huevos', precio: 15000, categoria: platos._id })
    tostada = await Producto.create({ codigo: 9102, nombre: 'Tostada', precio: 8000, categoria: platos._id })
    latte = await Producto.create({ codigo: 9103, nombre: 'Latte', precio: 9000, categoria: bebidas._id })
})

/** Cuenta con una ronda enviada de esos productos; devuelve { cuenta, ronda, items: { nombre → id } }. */
const rondaEnviada = async (mesa, productos, { nota } = {}) => {
    const abierta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, mesero)
    for (const p of productos) await agregarItem(abierta.id, { productoId: String(p._id), cantidad: 1, ...(nota ? { nota } : {}) }, mesero)
    const { version } = await Cuenta.findById(abierta.id).lean()
    await enviarRonda(abierta.id, { numeroRonda: 1, versionEsperada: version }, mesero)
    const ronda = await Comanda.findOne({ cuenta: abierta.id, numeroRonda: 1 }).lean()
    return { cuentaId: abierta.id, ronda, items: Object.fromEntries(ronda.items.map((i) => [i.nombre, String(i._id)])) }
}

describe('Cola del salón por estación (2.3)', () => {
    it('cada estación ve solo sus ítems, con mesa, mesero, nota y tiempos, de la ronda más antigua a la más nueva', async () => {
        const primera = await rondaEnviada(mesa1, [huevos, latte], { nota: 'Sin sal' })
        vi.setSystemTime(new Date(Date.now() + 60_000))
        const segunda = await rondaEnviada(mesa2, [tostada])
        const cola = await obtenerCola({ estacion: 'cocina' }, cocinero)
        expect(cola.estacion).toMatchObject({ codigo: 'cocina', nombre: 'Cocina', umbralAvisoMin: 12, umbralAlertaMin: 20 })
        expect(cola.salon.map((t) => t.comandaId)).toEqual([String(primera.ronda._id), String(segunda.ronda._id)])
        expect(cola.salon[0]).toMatchObject({ tipo: 'salon', cuentaId: primera.cuentaId, numeroRonda: 1, mesas: [1], mesero: 'Lucía G.' })
        expect(cola.salon[0].items).toEqual([
            expect.objectContaining({ id: primera.items.Huevos, nombre: 'Huevos', cantidad: 1, nota: 'Sin sal', estado: 'enviado', iniciadoEn: null }),
        ])
        const barra = await obtenerCola({ estacion: 'barra' }, barista)
        expect(barra.estacion).toMatchObject({ umbralAvisoMin: 5, umbralAlertaMin: 10 })
        expect(barra.salon.map((t) => t.items.map((i) => i.nombre))).toEqual([['Latte']])
    })

    it('una ronda terminada sale de la cola, salvo durante los 10 s del «Deshacer»; una cuenta cerrada no aparece', async () => {
        const { ronda } = await rondaEnviada(mesa1, [huevos])
        await todoListo(String(ronda._id), { estacion: 'cocina' }, cocinero)
        const recien = await obtenerCola({ estacion: 'cocina' }, cocinero)
        expect(recien.salon.map((t) => [t.comandaId, t.items[0].estado])).toEqual([[String(ronda._id), 'listo']])
        vi.setSystemTime(new Date(Date.now() + 11_000))
        expect((await obtenerCola({ estacion: 'cocina' }, cocinero)).salon).toEqual([])

        const otra = await rondaEnviada(mesa2, [tostada])
        const { version } = await Cuenta.findById(otra.cuentaId).lean()
        await cerrarSinCobro(otra.cuentaId, { motivo: 'Prueba', versionEsperada: version }, admin)
        expect((await obtenerCola({ estacion: 'cocina' }, cocinero)).salon).toEqual([])
    })

    it('las rondas pendientes de cuentas cerradas no ocupan el límite: una ronda nueva sigue apareciendo', async () => {
        const mesas = await Promise.all([3, 4, 5].map(async (numero) => Mesa.create({ numero, zona: mesa1.zona, capacidad: 2 })))
        for (const mesa of mesas) {
            const vieja = await rondaEnviada(mesa, [huevos])
            const { version } = await Cuenta.findById(vieja.cuentaId).lean()
            await cerrarSinCobro(vieja.cuentaId, { motivo: 'Prueba', versionEsperada: version }, admin)
        }
        vi.setSystemTime(new Date(Date.now() + 60_000))
        const nueva = await rondaEnviada(mesa1, [huevos])
        const cola = await obtenerCola({ estacion: 'cocina' }, cocinero, { limite: 2 })
        expect(cola.salon.map((t) => t.comandaId)).toEqual([String(nueva.ronda._id)])
    })

    it('una estación desactivada no tiene cola (409 ESTACION_INACTIVA)', async () => {
        await Estacion.create({ codigo: 'horno', nombre: 'Horno', activa: false })
        expect(await error(obtenerCola({ estacion: 'horno' }, cocinero))).toMatchObject({ status: 409, code: 'ESTACION_INACTIVA' })
    })

    it('un ítem anulado se ve tachado con su motivo mientras la ronda siga pendiente', async () => {
        const { cuentaId, items } = await rondaEnviada(mesa1, [huevos, tostada])
        const { version } = await Cuenta.findById(cuentaId).lean()
        const { anularItem } = await import('../src/modulos/salon/cuentas.service.js')
        await anularItem(cuentaId, items.Tostada, { motivo: 'cliente_cambio', versionEsperada: version }, admin)
        const [tarjeta] = (await obtenerCola({ estacion: 'cocina' }, cocinero)).salon
        expect(tarjeta.items.find((i) => i.nombre === 'Tostada')).toMatchObject({ estado: 'anulado', anulacion: { motivo: 'cliente_cambio' } })
    })

    it('los umbrales salen de la estación si el admin los cambió; una estación desconocida → 404; sin kds:ver → 403', async () => {
        await Estacion.updateOne({ codigo: 'cocina' }, { $set: { umbralAvisoMin: 8, umbralAlertaMin: 15 } })
        expect((await obtenerCola({ estacion: 'cocina' }, cocinero)).estacion).toMatchObject({ umbralAvisoMin: 8, umbralAlertaMin: 15 })
        expect(await error(obtenerCola({ estacion: 'horno' }, cocinero))).toMatchObject({ status: 404, code: 'ESTACION_NO_ENCONTRADA' })
        expect(await error(obtenerCola({ estacion: 'cocina' }, mesero))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    })

    it('las dos consultas reales de la cola usan el índice cola_por_estacion', async () => {
        const { cuentaId } = await rondaEnviada(mesa1, [huevos])
        const cuentas = [new mongoose.Types.ObjectId(cuentaId)]
        for (const estado of [{ estado: { $in: ['enviado', 'en_preparacion'] } }, { estado: 'listo', listoEn: { $gte: new Date(0) } }]) {
            const plan = await Comanda.find(filtroColaSalon('cocina', estado, cuentas)).sort({ enviadaEn: 1 }).explain('queryPlanner')
            expect(JSON.stringify(plan.queryPlanner.winningPlan)).toMatch(/cola_por_estacion/)
        }
    })
})

describe('Domicilio en la cola, por estación (F2-3)', () => {
    let pedidoId
    let admin_http
    beforeEach(async () => {
        const { sesion: cliente } = await crearConSesion('cliente')
        ;({ sesion: admin_http } = await crearConSesion('admin'))
        pedidoId = await crearPedido(cliente, {
            items: [{ productoRef: String(huevos._id), cantidad: 2, nota: 'Bien cocidos' }, { productoRef: String(latte._id), cantidad: 1 }],
        })
        const res = await admin_http.patch(`/api/v1/staff/pedidos/${pedidoId}/estado`).send({ codigo: 'confirmado' })
        expect(res.status, JSON.stringify(res.body)).toBe(200)
    })
    const codigoDe = async () => (await Pedido.findById(pedidoId).populate('estado', 'codigo').lean()).estado.codigo

    it('el pedido confirmado sale en cada estación solo con sus líneas', async () => {
        const cocina = await obtenerCola({ estacion: 'cocina' }, cocinero)
        expect(cocina.domicilio).toHaveLength(1)
        expect(cocina.domicilio[0]).toMatchObject({ tipo: 'domicilio', pedidoId: String(pedidoId), estado: 'confirmado', horaEntrega: '10:00' })
        expect(cocina.domicilio[0].codigo).toMatch(/^PED-/)
        expect(cocina.domicilio[0].lineas).toEqual([expect.objectContaining({ nombre: 'Huevos', cantidad: 2, nota: 'Bien cocidos' })])
        const barra = await obtenerCola({ estacion: 'barra' }, barista)
        expect(barra.domicilio[0].lineas.map((l) => l.nombre)).toEqual(['Latte'])
        // Sin datos de contacto del cliente: solo estas claves
        expect(Object.keys(cocina.domicilio[0]).sort()).toEqual(['codigo', 'desde', 'entregaEn', 'estacionesListas', 'estado', 'horaEntrega', 'lineas', 'pedidoId', 'tipo'])
        expect(JSON.stringify(cocina.domicilio[0])).not.toMatch(/3001234567|Carrera 36B|Ana Pérez|Centro/)
    })

    it('empieza una estación → en preparación; cuando terminan todas → listo; cada paso con su Evento', async () => {
        await marcarPedidoEstacion(String(pedidoId), { estacion: 'cocina', a: 'en_preparacion' }, cocinero)
        expect(await codigoDe()).toBe('en_preparacion')
        const parcial = await marcarPedidoEstacion(String(pedidoId), { estacion: 'cocina', a: 'listo' }, cocinero)
        expect(parcial).toMatchObject({ estado: 'en_preparacion', estacionesListas: ['cocina'] })
        expect((await obtenerCola({ estacion: 'cocina' }, cocinero)).domicilio).toEqual([])
        expect((await obtenerCola({ estacion: 'barra' }, barista)).domicilio).toHaveLength(1)
        const final = await marcarPedidoEstacion(String(pedidoId), { estacion: 'barra', a: 'listo' }, barista)
        expect(final).toMatchObject({ estado: 'listo', estacionesListas: ['cocina', 'barra'] })
        const eventos = await Evento.find({ entidad: 'pedido', entidadId: pedidoId }).sort({ _id: 1 }).lean()
        expect(eventos.slice(-4).map((e) => [e.tipo, e.a ?? e.datos?.estacion, e.actor])).toEqual([
            ['cambio_estado', 'en_preparacion', 'cocina'],
            ['estacion_lista', 'cocina', 'cocina'],
            ['estacion_lista', 'barra', 'barista'],
            ['cambio_estado', 'listo', 'barista'],
        ])
    })

    it('cada línea guarda la copia de su estación: si el catálogo cambia, el pedido en curso no cambia de pantalla', async () => {
        const lineas = await DetallePedido.find({ pedido: pedidoId }).lean()
        expect(lineas.map((l) => l.estacion?.codigo).sort()).toEqual(['barra', 'cocina'])
        const barra = await Estacion.findOne({ codigo: 'barra' }).lean()
        await Producto.updateOne({ _id: huevos._id }, { $set: { estacion: barra._id } })
        expect((await obtenerCola({ estacion: 'cocina' }, cocinero)).domicilio[0].lineas.map((l) => l.nombre)).toEqual(['Huevos'])
        await marcarPedidoEstacion(String(pedidoId), { estacion: 'cocina', a: 'listo' }, cocinero)
        const final = await marcarPedidoEstacion(String(pedidoId), { estacion: 'barra', a: 'listo' }, barista)
        expect(final.estado).toBe('listo')
    })

    it('un pedido anterior a 2.3 (líneas sin estación) la toma del catálogo', async () => {
        await DetallePedido.collection.updateMany({ pedido: new mongoose.Types.ObjectId(pedidoId) }, { $unset: { estacion: '' } })
        expect((await obtenerCola({ estacion: 'barra' }, barista)).domicilio[0].lineas.map((l) => l.nombre)).toEqual(['Latte'])
    })

    it('los pedidos con solo otra estación no ocupan el límite del domicilio', async () => {
        const { sesion: cliente } = await crearConSesion('cliente')
        const { sesion: adm } = await crearConSesion('admin')
        // Más antiguos que el de cocina: si el límite se aplicara antes de filtrar, lo taparían
        vi.setSystemTime(new Date(Date.now() - 3_600_000))
        for (let i = 0; i < 2; i += 1) {
            const soloBarra = await crearPedido(cliente, { items: [{ productoRef: String(latte._id), cantidad: 1 }] })
            await adm.patch(`/api/v1/staff/pedidos/${soloBarra}/estado`).send({ codigo: 'confirmado' })
        }
        vi.setSystemTime(new Date(Date.now() + 3_600_000))
        const cola = await obtenerCola({ estacion: 'cocina' }, cocinero, { limite: 1 })
        expect(cola.domicilio.map((p) => p.pedidoId)).toEqual([String(pedidoId)])
    })

    it('si el admin mueve el pedido mientras la cocina lo marca → 409 PEDIDO_MODIFICADO sin cambios', async () => {
        const original = DetallePedido.find.bind(DetallePedido)
        const listo = await estadoPorCodigo('pedido', 'listo')
        const espia = vi.spyOn(DetallePedido, 'find').mockImplementationOnce((...args) => {
            // Fuera de la transacción: otro proceso cambia el estado entre la lectura y la escritura
            Pedido.collection.updateOne({ _id: new mongoose.Types.ObjectId(pedidoId) }, { $set: { estado: listo._id } })
            return original(...args)
        })
        const e = await error(marcarPedidoEstacion(String(pedidoId), { estacion: 'cocina', a: 'listo' }, cocinero))
        espia.mockRestore()
        expect(e.status).toBe(409)
        expect(await Evento.countDocuments({ entidad: 'pedido', entidadId: pedidoId, tipo: 'estacion_lista' })).toBe(0)
    })

    it('entradas no válidas: id mal formado → 404; «a» fuera de la lista o claves extra → 400', async () => {
        expect(await error(marcarPedidoEstacion('no-es-un-id', { estacion: 'cocina', a: 'listo' }, cocinero))).toMatchObject({ status: 404, code: 'PEDIDO_NO_ENCONTRADO' })
        expect(await error(marcarPedidoEstacion(String(pedidoId), { estacion: 'cocina', a: 'entregado' }, cocinero))).toMatchObject({ status: 400 })
        expect(await error(marcarPedidoEstacion(String(pedidoId), { estacion: 'cocina', a: 'listo', estado: 'x' }, cocinero))).toMatchObject({ status: 400 })
    })

    it('marcar listo una estación de un pedido confirmado lo pasa antes a en preparación', async () => {
        await marcarPedidoEstacion(String(pedidoId), { estacion: 'barra', a: 'listo' }, barista)
        expect(await codigoDe()).toBe('en_preparacion')
    })

    it('errores: sin pedido:preparar 403; estación sin líneas 409; dos veces 409; pedido pendiente 409', async () => {
        expect(await error(marcarPedidoEstacion(String(pedidoId), { estacion: 'cocina', a: 'en_preparacion' }, mesero)))
            .toMatchObject({ status: 403, code: 'FORBIDDEN' })
        await Estacion.create({ codigo: 'horno', nombre: 'Horno' })
        expect(await error(marcarPedidoEstacion(String(pedidoId), { estacion: 'horno', a: 'listo' }, cocinero)))
            .toMatchObject({ status: 409, code: 'ESTACION_SIN_LINEAS' })
        await marcarPedidoEstacion(String(pedidoId), { estacion: 'cocina', a: 'listo' }, cocinero)
        expect(await error(marcarPedidoEstacion(String(pedidoId), { estacion: 'cocina', a: 'listo' }, cocinero)))
            .toMatchObject({ status: 409, code: 'ESTACION_YA_LISTA' })
        const pendiente = await estadoPorCodigo('pedido', 'pendiente')
        await Pedido.updateOne({ _id: pedidoId }, { $set: { estado: pendiente._id } })
        expect(await error(marcarPedidoEstacion(String(pedidoId), { estacion: 'barra', a: 'listo' }, barista)))
            .toMatchObject({ status: 409, code: 'PEDIDO_NO_PREPARABLE' })
    })

    it('la cocina no puede pasar el pedido a en camino ni entregarlo (pedido:preparar es limitado)', async () => {
        const { sesion: cocina } = await crearConSesion('cocina')
        await marcarPedidoEstacion(String(pedidoId), { estacion: 'cocina', a: 'listo' }, cocinero)
        await marcarPedidoEstacion(String(pedidoId), { estacion: 'barra', a: 'listo' }, barista)
        for (const codigo of ['en_camino', 'entregado', 'cancelado']) {
            expect((await cocina.patch(`/api/v1/staff/pedidos/${pedidoId}/estado`).send({ codigo })).status).toBe(403)
        }
    })

    it('endpoints: GET cola y POST estación del pedido con la sesión de cocina', async () => {
        const { sesion: cocina } = await crearConSesion('cocina')
        const cola = await cocina.get('/api/v1/staff/cocina/cola?estacion=cocina')
        expect(cola.status, JSON.stringify(cola.body)).toBe(200)
        expect(cola.body.domicilio).toHaveLength(1)
        const r = await cocina.post(`/api/v1/staff/cocina/pedidos/${pedidoId}/estacion`).send({ estacion: 'cocina', a: 'en_preparacion' })
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        const { sesion: cliente } = await crearConSesion('cliente')
        expect((await cliente.get('/api/v1/staff/cocina/cola?estacion=cocina')).status).toBe(403)
    })
})

describe('Concurrencia de estaciones del domicilio', () => {
    it('cocina y barra terminan a la vez: el pedido queda listo una sola vez con las dos estaciones', async () => {
        const { sesion: cliente } = await crearConSesion('cliente')
        const { sesion: adm } = await crearConSesion('admin')
        const id = await crearPedido(cliente, { items: [{ productoRef: String(huevos._id), cantidad: 1 }, { productoRef: String(latte._id), cantidad: 1 }] })
        await adm.patch(`/api/v1/staff/pedidos/${id}/estado`).send({ codigo: 'confirmado' })
        await marcarPedidoEstacion(String(id), { estacion: 'cocina', a: 'en_preparacion' }, cocinero)
        await Promise.allSettled([
            marcarPedidoEstacion(String(id), { estacion: 'cocina', a: 'listo' }, cocinero),
            marcarPedidoEstacion(String(id), { estacion: 'barra', a: 'listo' }, barista),
        ])
        const pedido = await Pedido.findById(id).populate('estado', 'codigo').lean()
        expect(pedido.estado.codigo).toBe('listo')
        expect([...pedido.estacionesListas].sort()).toEqual(['barra', 'cocina'])
        expect(await Evento.countDocuments({ entidad: 'pedido', entidadId: id, a: 'listo' })).toBe(1)
    })
})

describe('Umbrales del temporizador en Admin › Estaciones (F2-4)', () => {
    it('salen por defecto (Barra 5/10, Cocina 12/20), se editan y el aviso va antes que la alerta', async () => {
        const { sesion: adm } = await crearConSesion('admin')
        const lista = (await adm.get('/api/v1/admin/estaciones')).body
        const porCodigo = Object.fromEntries((lista.estaciones || lista).map((e) => [e.codigo, e]))
        expect(porCodigo.barra).toMatchObject({ umbralAvisoMin: 5, umbralAlertaMin: 10 })
        expect(porCodigo.cocina).toMatchObject({ umbralAvisoMin: 12, umbralAlertaMin: 20 })
        const ok = await adm.put(`/api/v1/admin/estaciones/${porCodigo.cocina.id}`).send({ umbralAvisoMin: 10, umbralAlertaMin: 25 })
        expect(ok.status, JSON.stringify(ok.body)).toBe(200)
        expect(ok.body).toMatchObject({ umbralAvisoMin: 10, umbralAlertaMin: 25 })
        const malo = await adm.put(`/api/v1/admin/estaciones/${porCodigo.cocina.id}`).send({ umbralAvisoMin: 30 })
        expect(malo.status).toBe(400)
        expect(malo.body.error.code).toBe('UMBRALES_NO_VALIDOS')
        const decimal = await adm.put(`/api/v1/admin/estaciones/${porCodigo.cocina.id}`).send({ umbralAlertaMin: 12.5 })
        expect(decimal.status).toBe(400)
        // null vuelve a los valores por defecto de F2-4
        const defecto = await adm.put(`/api/v1/admin/estaciones/${porCodigo.cocina.id}`).send({ umbralAvisoMin: null, umbralAlertaMin: null })
        expect(defecto.status, JSON.stringify(defecto.body)).toBe(200)
        expect(defecto.body).toMatchObject({ umbralAvisoMin: 12, umbralAlertaMin: 20 })
    })
})
