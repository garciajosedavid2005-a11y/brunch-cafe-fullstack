// Fase 3 · Cobro en caja (PLAN_FASE_3; F3-1 a F3-6): permiso cuenta:cobrar (cajero y admin), lista de
// cuentas en «cuenta pedida», cobro con efectivo, tarjeta o transferencia (mixto), propina voluntaria y
// cambio; comprobante interno CI-000001 inmutable; cuenta cerrada, mesa por limpiar, Evento y aviso en vivo.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba } from './helpers/datos.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import Comprobante from '../src/modulos/caja/comprobante.model.js'
import { emitirComprobante } from '../src/modulos/caja/caja.service.js'
import { traducirError } from '../src/modulos/compartido/errorHandler.js'
import { suscribir } from '../src/modulos/tiempoReal/bus.js'
import { validarCanales } from '../src/modulos/tiempoReal/eventos.routes.js'
import { PERMISOS_SALON } from '../src/modulos/identidad/permisos.js'
import { abrirCuenta, agregarItem, enviarRonda, solicitarCuenta } from '../src/modulos/salon/cuentas.service.js'

const { ObjectId } = mongoose.Types
const BASE = '/api/v1/staff/caja'
const mesero = { id: String(new ObjectId()), rol: 'mesero', permisos: PERMISOS_SALON.mesero }

let huevos
let zona
beforeEach(async () => {
    const platos = await categoriaDePrueba('Desayunos')
    huevos = await Producto.create({ codigo: 1, nombre: 'Huevos pericos', precio: 15000, categoria: platos._id })
    zona = await Zona.create({ nombre: 'Interior' })
    await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes(), Comprobante.createIndexes()])
})

/** Cuenta de la mesa `numero` con 2 × Huevos enviados (30.000); `pedir` la deja en «cuenta pedida». */
const cuentaDeMesa = async (numero, { pedir = true } = {}) => {
    const mesa = await Mesa.create({ numero, zona: zona._id, capacidad: 4 })
    const cuenta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, mesero)
    await agregarItem(cuenta.id, { productoId: String(huevos._id), cantidad: 2, nota: 'sin sal' }, mesero)
    const { version } = await Cuenta.findById(cuenta.id).lean()
    await enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: version }, mesero)
    if (pedir) await solicitarCuenta(cuenta.id, { versionEsperada: (await Cuenta.findById(cuenta.id).lean()).version }, mesero)
    const actual = await Cuenta.findById(cuenta.id).lean()
    return { id: cuenta.id, version: actual.version, mesa }
}

const cobrar = (sesion, cuenta, cuerpo, clave) => {
    const peticion = sesion.post(`${BASE}/cuentas/${cuenta.id}/cobrar`)
    if (clave) peticion.set('Idempotency-Key', clave)
    return peticion.send({ versionEsperada: cuenta.version, ...cuerpo })
}

describe('3.1 · Permiso de cobro y lista de la caja', () => {
    it('el cajero ve solo las cuentas en «cuenta pedida», con mesa, mesero, total y desde cuándo', async () => {
        const pedida = await cuentaDeMesa(1)
        await cuentaDeMesa(2, { pedir: false })
        const { sesion } = await crearConSesion('cajero')
        const r = await sesion.get(`${BASE}/cuentas`)
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        expect(r.body.cuentas).toHaveLength(1)
        expect(r.body.cuentas[0]).toMatchObject({ id: pedida.id, mesas: [1], total: 30000, version: pedida.version })
        expect(r.body.cuentas[0].pedidaEn).toBeTruthy()
    })

    it('el admin también; el mesero y el cliente no (403)', async () => {
        for (const [rol, status] of [['admin', 200], ['mesero', 403], ['cliente', 403]]) {
            const { sesion } = await crearConSesion(rol)
            expect((await sesion.get(`${BASE}/cuentas`)).status, rol).toBe(status)
        }
    })

    it('canal en vivo «caja» solo con cuenta:cobrar', () => {
        expect(validarCanales('caja', { id: 'x', permisos: ['cuenta:cobrar'] })).toEqual(['caja'])
        expect(() => validarCanales('caja', { id: 'x', permisos: PERMISOS_SALON.mesero })).toThrow()
    })
})

describe('3.2 · Cobrar una cuenta', () => {
    it('en efectivo con propina: calcula el cambio, cierra la cuenta, deja la mesa por limpiar, Evento y aviso', async () => {
        const cuenta = await cuentaDeMesa(1)
        const { sesion, usuario } = await crearConSesion('cajero')
        const avisos = []
        const baja = suscribir(['plano', 'caja', `cuenta:${cuenta.id}`], (a) => avisos.push(a))
        try {
            const r = await cobrar(sesion, cuenta, { propina: 3000, pagos: [{ metodo: 'efectivo', monto: 33000, recibido: 50000 }] })
            expect(r.status, JSON.stringify(r.body)).toBe(201)
            expect(r.body.cuenta.estado).toBe('cerrada')
            expect(r.body.comprobante).toMatchObject({
                codigo: 'CI-000001', subtotal: 30000, propina: 3000, total: 33000, cambio: 17000,
                pagos: [{ metodo: 'efectivo', monto: 33000, recibido: 50000, cambio: 17000 }],
            })
            const mesa = await Mesa.findById(cuenta.mesa._id).lean()
            expect(mesa.estado).toBe('por_limpiar')
            expect(mesa.cuentaActual).toBeNull()
            const evento = await Evento.findOne({ entidad: 'cuenta', entidadId: cuenta.id, tipo: 'cuenta_cobrada' }).lean()
            expect(evento).toMatchObject({ actor: 'cajero', datos: { comprobante: 'CI-000001', total: 33000, propina: 3000 } })
            expect(String(evento.usuario)).toBe(String(usuario._id))
            expect(avisos.map((a) => a.canal).sort()).toEqual(['caja', `cuenta:${cuenta.id}`, 'plano'])
        } finally {
            baja()
        }
    })

    it('pago mixto con tarjeta y transferencia, sin propina', async () => {
        const cuenta = await cuentaDeMesa(1)
        const { sesion } = await crearConSesion('admin')
        const r = await cobrar(sesion, cuenta, { propina: 0, pagos: [{ metodo: 'tarjeta', monto: 20000 }, { metodo: 'transferencia', monto: 10000 }] })
        expect(r.status, JSON.stringify(r.body)).toBe(201)
        expect(r.body.comprobante).toMatchObject({ total: 30000, propina: 0, cambio: 0 })
        expect(r.body.comprobante.pagos.map((p) => p.metodo)).toEqual(['tarjeta', 'transferencia'])
    })

    it('si los pagos no cuadran con total + propina: 400 PAGO_NO_CUADRA y nada cambia', async () => {
        const cuenta = await cuentaDeMesa(1)
        const { sesion } = await crearConSesion('cajero')
        const r = await cobrar(sesion, cuenta, { propina: 1000, pagos: [{ metodo: 'tarjeta', monto: 30000 }] })
        expect(r.status).toBe(400)
        expect(r.body.error.code).toBe('PAGO_NO_CUADRA')
        expect((await Cuenta.findById(cuenta.id).lean()).estado).toBe('cuenta_pedida')
        expect(await Comprobante.countDocuments()).toBe(0)
    })

    it('efectivo recibido menor que su parte: 400 EFECTIVO_INSUFICIENTE; recibido solo en efectivo; métodos fijos', async () => {
        const cuenta = await cuentaDeMesa(1)
        const { sesion } = await crearConSesion('cajero')
        const corto = await cobrar(sesion, cuenta, { propina: 0, pagos: [{ metodo: 'efectivo', monto: 30000, recibido: 20000 }] })
        expect(corto.body.error.code).toBe('EFECTIVO_INSUFICIENTE')
        const invalido = async (cuerpo, texto) => {
            const r = await cobrar(sesion, cuenta, cuerpo)
            expect(r.status, texto).toBe(400)
            expect(r.body.error.code, texto).toBe('VALIDATION_ERROR')
            expect(r.body.error.message, texto).toMatch(texto)
        }
        await invalido({ propina: 0, pagos: [{ metodo: 'tarjeta', monto: 30000, recibido: 40000 }] }, /solo se indica en efectivo/)
        await invalido({ propina: 0, pagos: [{ metodo: 'bitcoin', monto: 30000 }] }, /efectivo, tarjeta o transferencia/)
        await invalido({ propina: -1, pagos: [{ metodo: 'tarjeta', monto: 29999 }] }, /propina/)
        await invalido({ propina: 0, pagos: [{ metodo: 'tarjeta', monto: 15000 }, { metodo: 'tarjeta', monto: 15000 }] }, /un pago por método/)
        expect(await Comprobante.countDocuments()).toBe(0)
    })

    it('si algo falla después de tomar el consecutivo, nada cambia y el número no se gasta (sin huecos)', async () => {
        const cuenta = await cuentaDeMesa(1)
        const { sesion } = await crearConSesion('cajero')
        const original = Evento.create.bind(Evento)
        const espia = vi.spyOn(Evento, 'create').mockImplementation((docs, opciones) => (
            [].concat(docs).some((d) => d.tipo === 'cuenta_cobrada') ? Promise.reject(new Error('fallo simulado del Evento')) : original(docs, opciones)))
        const r = await cobrar(sesion, cuenta, { propina: 0, pagos: [{ metodo: 'tarjeta', monto: 30000 }] })
        expect(r.status).toBe(500)
        expect((await Cuenta.findById(cuenta.id).lean()).estado).toBe('cuenta_pedida')
        expect((await Mesa.findById(cuenta.mesa._id).lean()).estado).toBe('cuenta_pedida')
        expect(await Comprobante.countDocuments()).toBe(0)
        espia.mockRestore()
        const ok = await cobrar(sesion, cuenta, { propina: 0, pagos: [{ metodo: 'tarjeta', monto: 30000 }] })
        expect(ok.status, JSON.stringify(ok.body)).toBe(201)
        expect(ok.body.comprobante.codigo).toBe('CI-000001')
    })

    it('F3-6: una cuenta abierta (sin pedir la cuenta) no se cobra (409)', async () => {
        const cuenta = await cuentaDeMesa(1, { pedir: false })
        const { sesion } = await crearConSesion('cajero')
        const r = await cobrar(sesion, cuenta, { propina: 0, pagos: [{ metodo: 'tarjeta', monto: 30000 }] })
        expect(r.status).toBe(409)
        expect(await Comprobante.countDocuments()).toBe(0)
    })

    it('el mesero no cobra (403)', async () => {
        const cuenta = await cuentaDeMesa(1)
        const { sesion } = await crearConSesion('mesero')
        expect((await cobrar(sesion, cuenta, { propina: 0, pagos: [{ metodo: 'tarjeta', monto: 30000 }] })).status).toBe(403)
    })

    it('doble cobro: con la misma Idempotency-Key repite la respuesta; sin ella, 409; un solo comprobante', async () => {
        const cuenta = await cuentaDeMesa(1)
        const { sesion } = await crearConSesion('cajero')
        const cuerpo = { propina: 0, pagos: [{ metodo: 'tarjeta', monto: 30000 }] }
        const primero = await cobrar(sesion, cuenta, cuerpo, 'cobro-mesa-1-abc')
        const repetido = await cobrar(sesion, cuenta, cuerpo, 'cobro-mesa-1-abc')
        expect(repetido.status).toBe(201)
        expect(repetido.headers['idempotent-replayed']).toBe('true')
        expect(repetido.body.comprobante.codigo).toBe(primero.body.comprobante.codigo)
        expect((await cobrar(sesion, cuenta, cuerpo)).status).toBe(409)
        expect(await Comprobante.countDocuments()).toBe(1)
    })

    it('cobros simultáneos de cuentas distintas: consecutivos seguidos y sin huecos', async () => {
        const cuentas = await Promise.all([1, 2, 3].map((n) => cuentaDeMesa(n)))
        const { sesion } = await crearConSesion('cajero')
        const respuestas = await Promise.all(cuentas.map((c) => cobrar(sesion, c, { propina: 0, pagos: [{ metodo: 'tarjeta', monto: 30000 }] })))
        expect(respuestas.map((r) => r.status)).toEqual([201, 201, 201])
        expect(respuestas.map((r) => r.body.comprobante.codigo).sort()).toEqual(['CI-000001', 'CI-000002', 'CI-000003'])
    })
})

describe('3.3 · Comprobante interno', () => {
    it('trae líneas, pagos y las leyendas; lo ven quien cobra (no el mesero); es inmutable', async () => {
        const cuenta = await cuentaDeMesa(1)
        const { sesion } = await crearConSesion('cajero')
        const { body } = await cobrar(sesion, cuenta, { propina: 3000, pagos: [{ metodo: 'efectivo', monto: 33000, recibido: 40000 }] })
        const r = await sesion.get(`${BASE}/comprobantes/${body.comprobante.id}`)
        expect(r.status).toBe(200)
        expect(r.body).toMatchObject({
            codigo: 'CI-000001', mesas: [1], mesero: expect.any(String), cajero: expect.any(String),
            lineas: [{ nombre: 'Huevos pericos', cantidad: 2, opciones: [], nota: 'sin sal', precioUnitario: 15000, subtotal: 30000 }],
            leyendas: ['Precios con impuestos incluidos', 'Documento no válido como factura electrónica'],
        })
        const { sesion: mesero2 } = await crearConSesion('mesero')
        expect((await mesero2.get(`${BASE}/comprobantes/${body.comprobante.id}`)).status).toBe(403)
        const inmutable = expect.objectContaining({ code: 'COMPROBANTE_INMUTABLE' })
        await expect(Comprobante.updateOne({ _id: body.comprobante.id }, { total: 1 })).rejects.toEqual(inmutable)
        await expect(Comprobante.findOneAndUpdate({ _id: body.comprobante.id }, { total: 1 })).rejects.toEqual(inmutable)
        await expect(Comprobante.deleteOne({ _id: body.comprobante.id })).rejects.toEqual(inmutable)
        await expect(Comprobante.bulkWrite([{ deleteOne: { filter: { _id: body.comprobante.id } } }])).rejects.toEqual(inmutable)
        const doc = await Comprobante.findById(body.comprobante.id)
        doc.propina = 0
        await expect(doc.save()).rejects.toEqual(inmutable)
        expect((await Comprobante.findById(body.comprobante.id).lean()).total).toBe(33000)
    })

    it('un comprobante por cuenta y un número por comprobante (índices únicos)', async () => {
        const cuenta = await cuentaDeMesa(1)
        const { sesion } = await crearConSesion('cajero')
        const { body } = await cobrar(sesion, cuenta, { propina: 0, pagos: [{ metodo: 'tarjeta', monto: 30000 }] })
        const { _id, createdAt, ...copia } = await Comprobante.findById(body.comprobante.id).lean()
        expect(createdAt).toBeTruthy()
        await expect(Comprobante.create({ ...copia, _id: undefined })).rejects.toMatchObject({ code: 11000 })
        await expect(Comprobante.create({ ...copia, cuenta: new ObjectId() })).rejects.toMatchObject({ code: 11000 })
        expect(String(_id)).toBe(body.comprobante.id)
    })

    it('«Cobradas hoy» lista los comprobantes del día en Bogotá, el más reciente primero', async () => {
        const [a, b] = await Promise.all([cuentaDeMesa(1), cuentaDeMesa(2)])
        const { sesion } = await crearConSesion('cajero')
        await cobrar(sesion, a, { propina: 0, pagos: [{ metodo: 'tarjeta', monto: 30000 }] })
        await cobrar(sesion, b, { propina: 0, pagos: [{ metodo: 'tarjeta', monto: 30000 }] })
        const r = await sesion.get(`${BASE}/comprobantes`)
        expect(r.status).toBe(200)
        expect(r.body.comprobantes.map((c) => c.codigo)).toEqual(['CI-000002', 'CI-000001'])
        expect(r.body.comprobantes[0]).toMatchObject({ mesas: [2], total: 30000 })
    })

    it('comprobante inexistente o id mal formado: 404', async () => {
        const { sesion } = await crearConSesion('cajero')
        expect((await sesion.get(`${BASE}/comprobantes/${new ObjectId()}`)).status).toBe(404)
        expect((await sesion.get(`${BASE}/comprobantes/abc`)).status).toBe(404)
    })
})

describe('3.5 · Un comprobante inconsistente es un error del servidor', () => {
    it('si los montos no cuadran no responde 400 de validación: 500 COMPROBANTE_INCONSISTENTE y no se guarda', async () => {
        const cuenta = await cuentaDeMesa(1)
        const doc = await Cuenta.findById(cuenta.id).lean()
        const comandas = await Comanda.find({ cuenta: cuenta.id }).lean()
        const { usuario } = await crearConSesion('cajero')
        const datos = { cuenta: doc, comandas, propina: 0, total: 99999, pagos: [{ metodo: 'tarjeta', monto: 99999, recibido: null, cambio: null }], sesion: { id: String(usuario._id) } }
        const fallo = await emitirComprobante(datos).catch((e) => e)
        expect(fallo).toMatchObject({ status: 500, code: 'COMPROBANTE_INCONSISTENTE' })
        expect(fallo.cause?.name).toBe('ValidationError') // el detalle, solo para el log
        // La respuesta: su código y un mensaje propio, sin los detalles del esquema
        expect(traducirError(fallo)).toEqual({ status: 500, code: 'COMPROBANTE_INCONSISTENTE', message: 'No se pudo emitir el comprobante. Avisa al administrador.', details: undefined })
        expect(await Comprobante.countDocuments()).toBe(0)
    })
})
