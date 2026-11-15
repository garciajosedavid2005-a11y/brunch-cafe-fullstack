// 3b.3 · Anular un comprobante (PLAN_FASE_3B, F3b-5): solo factura:anular (admin), con motivo; nota crédito
// interna NC-000001 inmutable que devuelve por los mismos métodos y resta en el arqueo del turno; el
// comprobante no cambia y la cuenta no se reabre.
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba } from './helpers/datos.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Comprobante from '../src/modulos/caja/comprobante.model.js'
import NotaCredito from '../src/modulos/caja/notaCredito.model.js'
import TurnoCaja from '../src/modulos/caja/turno.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { abrirCuenta, agregarItem, enviarRonda, solicitarCuenta, cobrarCuenta } from '../src/modulos/salon/cuentas.service.js'
import { abrirTurno, cerrarTurno } from '../src/modulos/caja/turno.service.js'
import { anularComprobante } from '../src/modulos/caja/anulacion.service.js'
import { PERMISOS_SALON, PERMISOS_CAJA } from '../src/modulos/identidad/permisos.js'

const { ObjectId } = mongoose.Types
const BASE = '/api/v1/staff/caja'
const mesero = { id: String(new ObjectId()), rol: 'mesero', permisos: PERMISOS_SALON.mesero }
const cajero = { id: String(new ObjectId()), rol: 'cajero', permisos: PERMISOS_CAJA.cajero }

let huevos
let zona
beforeEach(async () => {
    const platos = await categoriaDePrueba('Desayunos')
    huevos = await Producto.create({ codigo: 1, nombre: 'Huevos pericos', precio: 15000, categoria: platos._id })
    zona = await Zona.create({ nombre: 'Interior' })
    await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes(), Comprobante.createIndexes(), TurnoCaja.createIndexes(), NotaCredito.createIndexes()])
    await abrirTurno({ base: 50000 }, cajero)
})

/** Cuenta de 30.000 cobrada con `pagos` (y propina) → comprobante. */
const cobrada = async (numero, pagos, propina = 0) => {
    const mesa = await Mesa.create({ numero, zona: zona._id, capacidad: 4 })
    const cuenta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, mesero)
    await agregarItem(cuenta.id, { productoId: String(huevos._id), cantidad: 2 }, mesero)
    await enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: (await Cuenta.findById(cuenta.id).lean()).version }, mesero)
    await solicitarCuenta(cuenta.id, { versionEsperada: (await Cuenta.findById(cuenta.id).lean()).version }, mesero)
    const { comprobante } = await cobrarCuenta(cuenta.id, { versionEsperada: (await Cuenta.findById(cuenta.id).lean()).version, propina, pagos }, cajero)
    return comprobante
}

describe('3b.3 · Anular un comprobante', () => {
    it('el admin anula con motivo: nota NC-000001 con las devoluciones por método; el comprobante y la cuenta no cambian', async () => {
        const c = await cobrada(1, [{ metodo: 'efectivo', monto: 20000, recibido: 20000 }, { metodo: 'tarjeta', monto: 13000 }], 3000)
        const antes = await Comprobante.findById(c.id).lean()
        const { sesion: admin } = await crearConSesion('admin')
        const r = await admin.post(`${BASE}/comprobantes/${c.id}/anular`).send({ motivo: 'Se cobró a la mesa equivocada' })
        expect(r.status, JSON.stringify(r.body)).toBe(201)
        expect(r.body.nota).toMatchObject({
            codigo: 'NC-000001', comprobante: c.codigo, motivo: 'Se cobró a la mesa equivocada', total: 33000,
            pagos: [{ metodo: 'efectivo', monto: 20000 }, { metodo: 'tarjeta', monto: 13000 }],
        })
        expect(await Comprobante.findById(c.id).lean()).toEqual(antes)
        expect((await Cuenta.findById(c.cuentaId).lean()).estado).toBe('cerrada')
        expect(await Evento.exists({ tipo: 'comprobante_anulado', entidadId: new ObjectId(c.cuentaId) })).toBeTruthy()

        // Se ve como anulado en la lista y en el detalle
        const hoy = await admin.get(`${BASE}/comprobantes`)
        expect(hoy.body.comprobantes[0].anulado).toMatchObject({ codigo: 'NC-000001', motivo: 'Se cobró a la mesa equivocada' })
        expect((await admin.get(`${BASE}/comprobantes/${c.id}`)).body.anulado.codigo).toBe('NC-000001')

        // Una sola vez
        expect((await admin.post(`${BASE}/comprobantes/${c.id}/anular`).send({ motivo: 'otra vez más' })).body.error.code).toBe('COMPROBANTE_ANULADO')
    })

    it('resta en el arqueo del turno abierto: el esperado baja por método', async () => {
        const c = await cobrada(1, [{ metodo: 'efectivo', monto: 30000 }])
        await anularComprobante(c.id, { motivo: 'Cobro duplicado' }, { id: String(new ObjectId()), rol: 'admin', permisos: ['*'] })
        const { turno } = await cerrarTurno({ contado: { efectivo: 50000, tarjeta: 0, transferencia: 0 } }, cajero)
        expect(turno.arqueo.find((a) => a.metodo === 'efectivo')).toMatchObject({ esperado: 50000, diferencia: 0 })
    })

    it('sin turno abierto la nota queda sin turno', async () => {
        const c = await cobrada(1, [{ metodo: 'tarjeta', monto: 30000 }])
        await cerrarTurno({ contado: { efectivo: 50000, tarjeta: 30000, transferencia: 0 } }, cajero)
        await anularComprobante(c.id, { motivo: 'Error de cobro' }, { id: String(new ObjectId()), rol: 'admin', permisos: ['*'] })
        expect((await NotaCredito.findOne().lean()).turno).toBeNull()
    })

    it('solo factura:anular (el cajero no: 403); el motivo es obligatorio (≥ 5); 404 si no existe', async () => {
        const c = await cobrada(1, [{ metodo: 'tarjeta', monto: 30000 }])
        const { sesion: cajeroS } = await crearConSesion('cajero')
        expect((await cajeroS.post(`${BASE}/comprobantes/${c.id}/anular`).send({ motivo: 'quiero anularlo' })).status).toBe(403)
        const { sesion: admin } = await crearConSesion('admin')
        for (const cuerpo of [{}, { motivo: 'ok' }, { motivo: 'bien largo', otro: 1 }]) {
            const r = await admin.post(`${BASE}/comprobantes/${c.id}/anular`).send(cuerpo)
            expect(r.status, JSON.stringify(cuerpo)).toBe(400)
        }
        expect((await admin.post(`${BASE}/comprobantes/${new ObjectId()}/anular`).send({ motivo: 'no existe ese' })).status).toBe(404)
        expect(await NotaCredito.countDocuments()).toBe(0)
    })

    it('el reintento con la misma Idempotency-Key devuelve la misma nota (no un 409 ni otra nota)', async () => {
        const c = await cobrada(1, [{ metodo: 'tarjeta', monto: 30000 }])
        const { sesion: admin } = await crearConSesion('admin')
        const enviar = () => admin.post(`${BASE}/comprobantes/${c.id}/anular`).set('Idempotency-Key', 'anular-una-vez').send({ motivo: 'Cobro duplicado' })
        const a = await enviar()
        const b = await enviar()
        expect([a.status, b.status]).toEqual([201, 201])
        expect(b.body.nota.codigo).toBe(a.body.nota.codigo)
        expect(await NotaCredito.countDocuments()).toBe(1)
        const evento = await Evento.findOne({ tipo: 'comprobante_anulado' }).lean()
        expect(evento).toMatchObject({ motivo: 'Cobro duplicado', datos: { comprobante: c.codigo, nota: 'NC-000001', total: 30000 } })
        expect(String((await NotaCredito.findOne().lean()).turno)).toBe(String((await TurnoCaja.findOne({ estado: 'abierto' }).lean())._id))
    })

    it('quien emitió una nota crédito tiene historial: al eliminarlo se archiva, no se borra (3.8)', async () => {
        const c = await cobrada(1, [{ metodo: 'tarjeta', monto: 30000 }])
        const { usuario: otroAdmin, sesion: otro } = await crearConSesion('admin')
        expect((await otro.post(`${BASE}/comprobantes/${c.id}/anular`).send({ motivo: 'Cobro duplicado' })).status).toBe(201)
        const { sesion: admin } = await crearConSesion('admin')
        const baja = await admin.delete(`/api/v1/admin/usuarios/${otroAdmin._id}`)
        expect(baja.status, JSON.stringify(baja.body)).toBe(200)
        expect(baja.body.resultado).toBe('archivado')
    })

    it('dos anulaciones a la vez: una sola nota; consecutivos sin huecos; la nota es inmutable', async () => {
        const [a, b] = [await cobrada(1, [{ metodo: 'tarjeta', monto: 30000 }]), await cobrada(2, [{ metodo: 'tarjeta', monto: 30000 }])]
        const admin = { id: String(new ObjectId()), rol: 'admin', permisos: ['*'] }
        const r = await Promise.allSettled([anularComprobante(a.id, { motivo: 'primera vez' }, admin), anularComprobante(a.id, { motivo: 'segunda vez' }, admin)])
        expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
        expect(r.find((x) => x.status === 'rejected').reason.code).toBe('COMPROBANTE_ANULADO')
        const { nota } = await anularComprobante(b.id, { motivo: 'tercera vez' }, admin)
        expect(nota.codigo).toBe('NC-000002')
        await expect(NotaCredito.updateOne({}, { motivo: 'cambiado' })).rejects.toMatchObject({ code: 'NOTA_INMUTABLE' })
        await expect(NotaCredito.deleteMany({})).rejects.toMatchObject({ code: 'NOTA_INMUTABLE' })
    })
})
