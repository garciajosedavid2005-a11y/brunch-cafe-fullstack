// 3b.1 · Turno de caja (PLAN_FASE_3B, F3b-1 y F3b-2): apertura con base, cierre con arqueo por método
// (contado frente a esperado y diferencia) y sin turno abierto no se cobra.
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
import TurnoCaja from '../src/modulos/caja/turno.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { abrirCuenta, agregarItem, enviarRonda, solicitarCuenta, cobrarCuenta } from '../src/modulos/salon/cuentas.service.js'
import { abrirTurno, cerrarTurno } from '../src/modulos/caja/turno.service.js'
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
    await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes(), Comprobante.createIndexes(), TurnoCaja.createIndexes()])
})

/** Cuenta pedida de la mesa `numero` con 2 × Huevos (30.000). */
const cuentaPedida = async (numero) => {
    const mesa = await Mesa.create({ numero, zona: zona._id, capacidad: 4 })
    const cuenta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, mesero)
    await agregarItem(cuenta.id, { productoId: String(huevos._id), cantidad: 2 }, mesero)
    await enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: (await Cuenta.findById(cuenta.id).lean()).version }, mesero)
    await solicitarCuenta(cuenta.id, { versionEsperada: (await Cuenta.findById(cuenta.id).lean()).version }, mesero)
    return { id: cuenta.id, version: (await Cuenta.findById(cuenta.id).lean()).version }
}
const cobrar = (cuenta, propina, pagos) => cobrarCuenta(cuenta.id, { versionEsperada: cuenta.version, propina, pagos }, cajero)

describe('3b.1 · Turno de caja', () => {
    it('sin turno abierto no se cobra (409 TURNO_CERRADO) y la cuenta sigue pedida', async () => {
        const cuenta = await cuentaPedida(1)
        await expect(cobrar(cuenta, 0, [{ metodo: 'efectivo', monto: 30000 }])).rejects.toMatchObject({ status: 409, code: 'TURNO_CERRADO' })
        expect((await Cuenta.findById(cuenta.id).lean()).estado).toBe('cuenta_pedida')
        expect(await Comprobante.countDocuments()).toBe(0)
    })

    it('el cajero abre con base; el comprobante queda en el turno; no se abren dos turnos', async () => {
        const { sesion } = await crearConSesion('cajero')
        const abierto = await sesion.post(`${BASE}/turno/abrir`).send({ base: 100000 })
        expect(abierto.status, JSON.stringify(abierto.body)).toBe(201)
        expect(abierto.body.turno).toMatchObject({ codigo: 'T-000001', estado: 'abierto', base: 100000 })
        expect((await sesion.post(`${BASE}/turno/abrir`).send({ base: 0 })).body.error.code).toBe('TURNO_YA_ABIERTO')

        const cuenta = await cuentaPedida(1)
        const { comprobante } = await cobrar(cuenta, 3000, [{ metodo: 'efectivo', monto: 33000, recibido: 50000 }])
        expect(String((await Comprobante.findById(comprobante.id).lean()).turno)).toBe(abierto.body.turno.id)
        expect(await Evento.exists({ entidad: 'turno', tipo: 'turno_abierto' })).toBeTruthy()
    })

    it('el cierre guarda el arqueo por método: esperado (base + cobrado), contado y diferencia', async () => {
        await abrirTurno({ base: 100000 }, cajero)
        await cobrar(await cuentaPedida(1), 3000, [{ metodo: 'efectivo', monto: 33000, recibido: 50000 }])
        await cobrar(await cuentaPedida(2), 0, [{ metodo: 'tarjeta', monto: 10000 }, { metodo: 'efectivo', monto: 20000 }])

        const { sesion } = await crearConSesion('cajero')
        const actual = await sesion.get(`${BASE}/turno`)
        expect(actual.body.turno.cobros).toBe(2)
        expect(actual.body.turno.esperado.find((e) => e.metodo === 'efectivo').esperado).toBe(153000)

        const cierre = await sesion.post(`${BASE}/turno/cerrar`).send({ contado: { efectivo: 150000, tarjeta: 10000, transferencia: 0 }, nota: 'faltan 3.000' })
        expect(cierre.status, JSON.stringify(cierre.body)).toBe(200)
        expect(cierre.body.turno.estado).toBe('cerrado')
        expect(cierre.body.turno.arqueo).toEqual([
            { metodo: 'efectivo', esperado: 153000, contado: 150000, diferencia: -3000 },
            { metodo: 'tarjeta', esperado: 10000, contado: 10000, diferencia: 0 },
            { metodo: 'transferencia', esperado: 0, contado: 0, diferencia: 0 },
        ])
        expect(await Evento.exists({ entidad: 'turno', tipo: 'turno_cerrado' })).toBeTruthy()
        // Cerrado: ya no se cobra hasta abrir otro
        await expect(cobrar(await cuentaPedida(3), 0, [{ metodo: 'efectivo', monto: 30000 }])).rejects.toMatchObject({ code: 'TURNO_CERRADO' })
        expect((await sesion.get(`${BASE}/turno`)).body.turno).toBeNull()
        expect((await sesion.get(`${BASE}/turnos`)).body.turnos[0].arqueo).toHaveLength(3)
    })

    it('cerrar sin turno da 409; lo contado se valida (entero ≥ 0 y los tres métodos)', async () => {
        const { sesion } = await crearConSesion('cajero')
        expect((await sesion.post(`${BASE}/turno/cerrar`).send({ contado: { efectivo: 0, tarjeta: 0, transferencia: 0 } })).body.error.code).toBe('TURNO_CERRADO')
        await sesion.post(`${BASE}/turno/abrir`).send({ base: 0 })
        expect((await sesion.post(`${BASE}/turno/cerrar`).send({ contado: { efectivo: -1, tarjeta: 0, transferencia: 0 } })).status).toBe(400)
        expect((await sesion.post(`${BASE}/turno/cerrar`).send({ contado: { efectivo: 1.5, tarjeta: 0, transferencia: 0 } })).status).toBe(400)
        expect((await sesion.post(`${BASE}/turno/cerrar`).send({ contado: { efectivo: 0 } })).status).toBe(400)
        expect((await sesion.post(`${BASE}/turno/abrir`).send({ base: -5 })).status).toBe(400)
    })

    it('permisos: el mesero no abre ni cierra (403); solo quien cierra ve el esperado', async () => {
        const { sesion: meseroS } = await crearConSesion('mesero')
        expect((await meseroS.post(`${BASE}/turno/abrir`).send({ base: 0 })).status).toBe(403)
        expect((await meseroS.get(`${BASE}/turno`)).status).toBe(403)
        await abrirTurno({ base: 5000 }, cajero)
        const soloCobra = { id: String(new ObjectId()), rol: 'x', permisos: ['cuenta:cobrar'] }
        const { turnoActual } = await import('../src/modulos/caja/turno.service.js')
        const visto = await turnoActual(soloCobra)
        expect(visto.turno.estado).toBe('abierto')
        expect(visto.turno.esperado).toBeUndefined()
    })

    it('dos aperturas a la vez: queda un solo turno abierto', async () => {
        const r = await Promise.allSettled([abrirTurno({ base: 1 }, cajero), abrirTurno({ base: 2 }, cajero)])
        expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
        expect(r.find((x) => x.status === 'rejected').reason.code).toBe('TURNO_YA_ABIERTO')
        expect(await TurnoCaja.countDocuments({ estado: 'abierto' })).toBe(1)
    })

    it('cada cobro escribe en el turno (version): así un cierre simultáneo choca con él', async () => {
        await abrirTurno({ base: 0 }, cajero)
        const antes = (await TurnoCaja.findOne().lean()).version
        await cobrar(await cuentaPedida(1), 0, [{ metodo: 'tarjeta', monto: 30000 }])
        expect((await TurnoCaja.findOne().lean()).version).toBe(antes + 1)
    })

    it('por HTTP: cobrar sin turno da 409 con el formato de error; caja:abrir solo no cierra ni ve el historial (403)', async () => {
        const cuenta = await cuentaPedida(1)
        const { sesion } = await crearConSesion('cajero')
        const r = await sesion.post(`${BASE}/cuentas/${cuenta.id}/cobrar`).send({ versionEsperada: cuenta.version, propina: 0, pagos: [{ metodo: 'tarjeta', monto: 30000 }] })
        expect(r.status).toBe(409)
        expect(r.body.error).toMatchObject({ code: 'TURNO_CERRADO' })
        const { Rol } = { Rol: (await import('../src/modulos/identidad/rol.model.js')).default }
        await Rol.create({ nombre: 'abre3b', etiqueta: 'Abre', permisos: ['caja:abrir'] })
        const { sesion: abre } = await crearConSesion('abre3b')
        expect((await abre.post(`${BASE}/turno/abrir`).send({ base: 0 })).status).toBe(201)
        expect((await abre.post(`${BASE}/turno/cerrar`).send({ contado: { efectivo: 0, tarjeta: 0, transferencia: 0 } })).status).toBe(403)
        expect((await abre.get(`${BASE}/turnos`)).status).toBe(403)
    })

    it('cierre y cobro a la vez: el comprobante nunca queda en un turno ya cerrado sin contarse', async () => {
        await abrirTurno({ base: 0 }, cajero)
        const cuenta = await cuentaPedida(1)
        const [cobro, cierre] = await Promise.allSettled([
            cobrar(cuenta, 0, [{ metodo: 'transferencia', monto: 30000 }]),
            cerrarTurno({ contado: { efectivo: 0, tarjeta: 0, transferencia: 0 } }, cajero),
        ])
        expect(cierre.status).toBe('fulfilled')
        const turno = await TurnoCaja.findOne().lean()
        const transferencia = turno.arqueo.find((a) => a.metodo === 'transferencia')
        if (cobro.status === 'fulfilled') expect(transferencia.esperado).toBe(30000) // cobró antes del cierre
        else {
            expect(cobro.reason.code).toBe('TURNO_CERRADO')
            expect(transferencia.esperado).toBe(0)
        }
    })
})
