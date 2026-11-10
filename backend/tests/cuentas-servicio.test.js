import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { categoriaDePrueba } from './helpers/datos.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Categoria from '../src/modulos/catalogo/categoria.model.js'
import Estacion from '../src/modulos/catalogo/estacion.model.js'
import GrupoModificadores from '../src/modulos/catalogo/grupoModificadores.model.js'
import Evento from '../src/modulos/compartido/evento.model.js'
import { PERMISOS_SALON } from '../src/modulos/identidad/permisos.js'
import {
    abrirCuenta, agregarItem, modificarItem, quitarItem, enviarRonda, anularItem,
    solicitarCuenta, cancelarCuenta, cerrarSinCobro, cambiarEstadoMesa, obtenerCuenta,
} from '../src/modulos/salon/cuentas.service.js'
import { verificarConsistenciaSalon } from '../src/modulos/salon/consistencia.js'
import { actualizarZona } from '../src/modulos/salon/salonConfig.service.js'

// 1.4 · Núcleo de cuenta y comanda (sin endpoints: llegan en 1.5). Reglas: F1-6, F1-7, F1-13,
// F1-14, F1-17 y D1–D4 del diseño aprobado el 2026-11-07.
const { ObjectId } = mongoose.Types
const sesionDe = (rol, permisos) => ({ id: String(new ObjectId()), rol, permisos })

/** Ejecuta y devuelve el error (falla si no lo hay). */
const error = async (promesa) => {
    try {
        await promesa
    } catch (e) {
        return e
    }
    throw new Error('Se esperaba un error')
}

let mesero
let otroMesero
let sinComandas
let admin
let zona
let mesa
let mesa2
let huevos
let latte
let termino
let extras
let cocina
let barra

beforeEach(async () => {
    await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes()])
    mesero = sesionDe('mesero', PERMISOS_SALON.mesero)
    otroMesero = sesionDe('mesero', PERMISOS_SALON.mesero)
    // 1.5b: sin rol anfitrión; una sesión con permisos de mesa y cuenta pero sin tomar comandas
    sinComandas = sesionDe('recepcion', ['mesa:ver', 'mesa:operar', 'mesa:bloquear', 'mesa:unir', 'cuenta:abrir', 'cuenta:transferir'])
    admin = sesionDe('admin', ['*'])
    cocina = await Estacion.findOne({ codigo: 'cocina' }).lean()
    barra = await Estacion.findOne({ codigo: 'barra' }).lean()
    zona = await Zona.create({ nombre: 'Interior' })
    mesa = await Mesa.create({ numero: 1, nombre: 'Ventana', zona: zona._id, capacidad: 4 })
    mesa2 = await Mesa.create({ numero: 2, zona: zona._id, capacidad: 2 })
    termino = await GrupoModificadores.create({
        nombre: 'Término del huevo', obligatorio: true, min: 1, max: 1,
        opciones: [{ nombre: 'Yema líquida' }, { nombre: 'Yema media' }, { nombre: 'Bien cocido' }],
    })
    extras = await GrupoModificadores.create({
        nombre: 'Extras', obligatorio: false, min: 0, max: 2,
        opciones: [
            { nombre: 'Tocineta', precioExtra: 2500 },
            { nombre: 'Queso', precioExtra: 3000 },
            { nombre: 'Aguacate', precioExtra: 4000, disponible: false },
        ],
    })
    const platos = await categoriaDePrueba('Desayunos')
    const bebidas = await categoriaDePrueba('Bebidas')
    huevos = await Producto.create({
        codigo: 1, nombre: 'Huevos al gusto', precio: 15000, categoria: platos._id,
        gruposModificadores: [termino._id, extras._id],
    })
    latte = await Producto.create({ codigo: 2, nombre: 'Latte', precio: 9000, categoria: bebidas._id })
})

const opcion = (grupo, nombre) => String(grupo.opciones.find((o) => o.nombre === nombre)._id)
const conTermino = (nombre = 'Yema media', extra = []) => [
    { grupoId: String(termino._id), opcionIds: [opcion(termino, nombre)] },
    ...(extra.length ? [{ grupoId: String(extras._id), opcionIds: extra.map((n) => opcion(extras, n)) }] : []),
]
const abrir = (sesion = mesero, datos = {}) => abrirCuenta({ mesaId: String(mesa._id), comensales: 2, ...datos }, sesion)
const agregarLatte = (cuenta, sesion = mesero, extra = {}) =>
    agregarItem(cuenta.id, { productoId: String(latte._id), cantidad: 1, ...extra }, sesion)
const enviar = async (cuentaId, sesion = mesero) => {
    const actual = await obtenerCuenta(cuentaId, mesero)
    return enviarRonda(cuentaId, { numeroRonda: actual.ultimaRonda + 1, versionEsperada: actual.version }, sesion)
}
/** Cuenta abierta con un latte enviado (ronda 1). */
const cuentaConEnvio = async () => {
    const cuenta = await abrir()
    await agregarLatte(cuenta)
    return enviar(cuenta.id)
}
const eventos = (filtro) => Evento.find(filtro).sort({ createdAt: 1, _id: 1 }).lean()

describe('Abrir cuenta (F1-7)', () => {
    it('ocupa la mesa, crea la cuenta con su código y la copia de la mesa, y registra los Eventos', async () => {
        const cuenta = await abrir(mesero, { comensales: 3 })
        expect(cuenta).toMatchObject({
            estado: 'abierta', canal: 'salon', comensales: 3, mesero: mesero.id,
            subtotal: 0, pendiente: 0, total: 0, impuestos: null, propina: null, descuento: null,
            ultimaRonda: 0, rondas: [],
            mesas: [{ id: String(mesa._id), numero: 1, nombre: 'Ventana', zona: { id: String(zona._id), nombre: 'Interior' } }],
        })
        expect(cuenta.codigo).toMatch(/^C-\d{6}$/)
        const enMesa = await Mesa.findById(mesa._id).lean()
        expect(enMesa).toMatchObject({ estado: 'ocupada', cuentaActual: new ObjectId(cuenta.id) })

        const [deMesa] = await eventos({ entidad: 'mesa', entidadId: mesa._id })
        expect(deMesa).toMatchObject({ tipo: 'cambio_estado', de: 'libre', a: 'ocupada', actor: 'mesero', usuario: new ObjectId(mesero.id) })
        const [deCuenta] = await eventos({ entidad: 'cuenta', entidadId: new ObjectId(cuenta.id) })
        expect(deCuenta).toMatchObject({ tipo: 'cambio_estado', de: null, a: 'abierta', usuario: new ObjectId(mesero.id) })
    })

    it('exige cuenta:abrir y comensales entre 1 y 50', async () => {
        const sinPermiso = sesionDe('cocina', ['pedido:ver'])
        expect(await error(abrir(sinPermiso))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
        expect(await error(abrir(mesero, { comensales: 0 }))).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' })
        expect(await error(abrir(mesero, { comensales: 51 }))).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' })
        expect(await error(abrir(mesero, { comensales: 2.5 }))).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' })
        expect(await Cuenta.countDocuments()).toBe(0)
    })

    it('mesa ocupada, bloqueada, inactiva o en zona inactiva → 409 MESA_NO_DISPONIBLE; inexistente → 404', async () => {
        await abrir()
        expect(await error(abrir())).toMatchObject({ status: 409, code: 'MESA_NO_DISPONIBLE' })
        await Mesa.updateOne({ _id: mesa2._id }, { estado: 'bloqueada' })
        expect(await error(abrir(mesero, { mesaId: String(mesa2._id) }))).toMatchObject({ status: 409, code: 'MESA_NO_DISPONIBLE' })
        await Mesa.updateOne({ _id: mesa2._id }, { estado: 'libre', activa: false })
        expect(await error(abrir(mesero, { mesaId: String(mesa2._id) }))).toMatchObject({ status: 409, code: 'MESA_NO_DISPONIBLE' })
        await Mesa.updateOne({ _id: mesa2._id }, { activa: true })
        await Zona.updateOne({ _id: zona._id }, { activa: false })
        expect(await error(abrir(mesero, { mesaId: String(mesa2._id) }))).toMatchObject({ status: 409, code: 'MESA_NO_DISPONIBLE' })
        expect(await error(abrir(mesero, { mesaId: String(new ObjectId()) }))).toMatchObject({ status: 404, code: 'MESA_NO_ENCONTRADA' })
        expect(await Cuenta.countDocuments()).toBe(1)
        expect((await Mesa.findById(mesa2._id).lean()).cuentaActual).toBeNull()
    })

    it('dos aperturas simultáneas de la misma mesa: una abre y la otra recibe 409 MESA_NO_DISPONIBLE', async () => {
        const resultados = await Promise.allSettled([abrir(mesero), abrir(otroMesero)])
        const ok = resultados.filter((r) => r.status === 'fulfilled')
        const fallos = resultados.filter((r) => r.status === 'rejected')
        expect(ok).toHaveLength(1)
        expect(fallos).toHaveLength(1)
        expect(fallos[0].reason).toMatchObject({ status: 409, code: 'MESA_NO_DISPONIBLE' })
        expect(await Cuenta.countDocuments()).toBe(1)
        expect(String((await Mesa.findById(mesa._id).lean()).cuentaActual)).toBe(ok[0].value.id)
    })

    it('abrir y desactivar la zona a la vez nunca deja una mesa ocupada en una zona inactiva', async () => {
        for (let intento = 0; intento < 5; intento += 1) {
            await Promise.allSettled([abrir(), actualizarZona(String(zona._id), { activa: false })])
            const [enZona, enMesa] = await Promise.all([Zona.findById(zona._id).lean(), Mesa.findById(mesa._id).lean()])
            expect(enZona.activa === false && enMesa.estado === 'ocupada').toBe(false)
            // Deja todo como al principio para el siguiente intento
            await Promise.all([Cuenta.deleteMany({}), Evento.deleteMany({})])
            await Mesa.updateOne({ _id: mesa._id }, { estado: 'libre', cuentaActual: null })
            await Zona.updateOne({ _id: zona._id }, { activa: true })
        }
    })

    it('una mesa anterior a 1.4 (sin el campo cuentaActual) cuenta como libre', async () => {
        const { insertedId } = await Mesa.collection.insertOne({
            numero: 9, nombre: '', zona: zona._id, capacidad: 2, estado: 'libre', combinable: false, activa: true, ejemplo: false,
        })
        expect((await Mesa.collection.findOne({ _id: insertedId })).cuentaActual).toBeUndefined()
        const cuenta = await abrir(mesero, { mesaId: String(insertedId) })
        expect(String((await Mesa.findById(insertedId).lean()).cuentaActual)).toBe(cuenta.id)

        // También admite las transiciones manuales
        const otra = await Mesa.collection.insertOne({
            numero: 10, nombre: '', zona: zona._id, capacidad: 2, estado: 'libre', combinable: false, activa: true, ejemplo: false,
        })
        const bloqueada = await cambiarEstadoMesa(String(otra.insertedId), { a: 'bloqueada', motivo: 'mantenimiento' }, sinComandas)
        expect(bloqueada.estado).toBe('bloqueada')
    })

    it('si otra cuenta abierta ya tiene la mesa (dato incoherente), abrir da 409 MESAS_INCONSISTENTES, no un 500', async () => {
        const cuenta = await abrir()
        await Mesa.updateOne({ _id: mesa._id }, { estado: 'libre', cuentaActual: null })
        expect(await error(abrir())).toMatchObject({ status: 409, code: 'MESAS_INCONSISTENTES' })
        expect(await Cuenta.countDocuments()).toBe(1)
        expect(cuenta.estado).toBe('abierta')
    })

    it('la BD tampoco admite dos cuentas abiertas con la misma mesa (índice único parcial)', async () => {
        const cuenta = await abrir()
        const copia = await Cuenta.findById(cuenta.id).lean()
        const segunda = { ...copia, _id: new ObjectId(), codigo: 'C-999999' }
        expect((await error(Cuenta.collection.insertOne(segunda))).code).toBe(11000)
        // Con la primera cerrada, la mesa sí puede estar en otra cuenta abierta
        await Cuenta.updateOne({ _id: cuenta.id }, { estado: 'cancelada' })
        await Cuenta.collection.insertOne(segunda)
    })
})

describe('Agregar ítems: snapshot, modificadores y disponibilidad (F1-14)', () => {
    it('guarda la copia de nombre, precio, modificadores y estación; el precio no cambia aunque cambie el menú', async () => {
        const cuenta = await abrir()
        const { cuenta: tras, item } = await agregarItem(cuenta.id, {
            productoId: String(huevos._id), cantidad: 2, nota: ' sin cebolla ', modificadores: conTermino('Yema líquida', ['Tocineta', 'Queso']),
        }, mesero)
        expect(item).toMatchObject({
            productoId: String(huevos._id), codigoProducto: 1, nombre: 'Huevos al gusto', precioBase: 15000,
            estacion: { id: String(cocina._id), codigo: 'cocina', nombre: cocina.nombre },
            cantidad: 2, nota: 'sin cebolla', precioUnitario: 20500, subtotal: 41000, estado: 'borrador',
        })
        expect(item.modificadores).toEqual([
            { grupoId: String(termino._id), grupo: 'Término del huevo', opcionId: opcion(termino, 'Yema líquida'), opcion: 'Yema líquida', precioExtra: 0 },
            { grupoId: String(extras._id), grupo: 'Extras', opcionId: opcion(extras, 'Tocineta'), opcion: 'Tocineta', precioExtra: 2500 },
            { grupoId: String(extras._id), grupo: 'Extras', opcionId: opcion(extras, 'Queso'), opcion: 'Queso', precioExtra: 3000 },
        ])
        expect(tras).toMatchObject({ pendiente: 41000, subtotal: 0, total: 0, version: cuenta.version + 1 })
        expect(tras.rondas).toHaveLength(1)
        expect(tras.rondas[0]).toMatchObject({ numeroRonda: 1, estado: 'borrador', subtotal: 41000 })

        await Producto.updateOne({ _id: huevos._id }, { precio: 99000, nombre: 'Otro nombre' })
        await GrupoModificadores.updateOne({ _id: extras._id, 'opciones.nombre': 'Queso' }, { $set: { 'opciones.$.precioExtra': 9000 } })
        const despues = await obtenerCuenta(cuenta.id, mesero)
        expect(despues.rondas[0].items[0]).toMatchObject({ nombre: 'Huevos al gusto', precioBase: 15000, subtotal: 41000 })
        const enviada = await enviar(cuenta.id)
        expect(enviada).toMatchObject({ subtotal: 41000, total: 41000, pendiente: 0 })

        const [agregado] = await eventos({ entidad: 'cuenta', tipo: 'item_agregado' })
        expect(agregado).toMatchObject({ entidadId: new ObjectId(cuenta.id), usuario: new ObjectId(mesero.id) })
        expect(agregado.datos).toMatchObject({ numeroRonda: 1, item: { nombre: 'Huevos al gusto', cantidad: 2, subtotal: 41000 } })
    })

    it('los ítems se suman a la misma ronda en borrador', async () => {
        const cuenta = await abrir()
        await agregarLatte(cuenta)
        const { cuenta: tras } = await agregarLatte(cuenta, mesero, { cantidad: 2 })
        expect(tras.rondas).toHaveLength(1)
        expect(tras.rondas[0].items).toHaveLength(2)
        expect(tras.pendiente).toBe(27000)
        expect(await Comanda.countDocuments()).toBe(1)
    })

    it('producto agotado → 409 PRODUCT_UNAVAILABLE; inexistente → 404; sin estación → 409 PRODUCTO_SIN_ESTACION', async () => {
        const cuenta = await abrir()
        await Producto.updateOne({ _id: latte._id }, { disponible: false })
        expect(await error(agregarLatte(cuenta))).toMatchObject({ status: 409, code: 'PRODUCT_UNAVAILABLE' })
        expect(await error(agregarItem(cuenta.id, { productoId: String(new ObjectId()), cantidad: 1 }, mesero)))
            .toMatchObject({ status: 404, code: 'PRODUCTO_NO_ENCONTRADO' })
        // Categoría anterior a migrate:1.3 (sin estación) y producto sin estación propia
        const { insertedId } = await Categoria.collection.insertOne({ nombre: 'Vieja' })
        const viejo = await Producto.create({ codigo: 50, nombre: 'Viejo', precio: 1000, categoria: insertedId })
        expect(await error(agregarItem(cuenta.id, { productoId: String(viejo._id), cantidad: 1 }, mesero)))
            .toMatchObject({ status: 409, code: 'PRODUCTO_SIN_ESTACION' })
        expect(await Comanda.countDocuments()).toBe(0)
    })

    it('valida los modificadores: obligatorio, mínimo/máximo, opción disponible, grupo del producto y sin repetir', async () => {
        const cuenta = await abrir()
        const agregar = (modificadores) => agregarItem(cuenta.id, { productoId: String(huevos._id), cantidad: 1, modificadores }, mesero)

        expect(await error(agregar([]))).toMatchObject({ status: 400, code: 'MODIFICADOR_REQUERIDO', details: { grupoId: String(termino._id) } })
        expect(await error(agregar([{ grupoId: String(termino._id), opcionIds: [opcion(termino, 'Yema media'), opcion(termino, 'Bien cocido')] }])))
            .toMatchObject({ status: 400, code: 'MODIFICADORES_FUERA_DE_RANGO' })
        expect(await error(agregar(conTermino('Yema media', ['Tocineta', 'Queso', 'Aguacate']))))
            .toMatchObject({ status: 400, code: 'MODIFICADORES_FUERA_DE_RANGO' })
        expect(await error(agregar(conTermino('Yema media', ['Aguacate']))))
            .toMatchObject({ status: 409, code: 'OPCION_NO_DISPONIBLE' })
        expect(await error(agregar([...conTermino(), { grupoId: String(extras._id), opcionIds: [opcion(extras, 'Queso'), opcion(extras, 'Queso')] }])))
            .toMatchObject({ status: 400, code: 'OPCION_NO_VALIDA' })
        expect(await error(agregar([...conTermino(), { grupoId: String(extras._id), opcionIds: [opcion(termino, 'Yema media')] }])))
            .toMatchObject({ status: 400, code: 'OPCION_NO_VALIDA' })
        expect(await error(agregar([...conTermino(), ...conTermino()]))).toMatchObject({ status: 400, code: 'GRUPO_NO_VALIDO' })
        // Grupo que no es del producto
        const leche = await GrupoModificadores.create({ nombre: 'Leche', obligatorio: false, min: 0, max: 1, opciones: [{ nombre: 'Almendra' }] })
        expect(await error(agregar([...conTermino(), { grupoId: String(leche._id), opcionIds: [String(leche.opciones[0]._id)] }])))
            .toMatchObject({ status: 400, code: 'GRUPO_NO_VALIDO' })
        // Un grupo desactivado deja de ofrecerse (y deja de exigirse)
        await GrupoModificadores.updateOne({ _id: termino._id }, { activo: false })
        expect(await error(agregar(conTermino()))).toMatchObject({ status: 400, code: 'GRUPO_NO_VALIDO' })
        const { item } = await agregar([])
        expect(item.modificadores).toEqual([])
    })

    it('cantidad entera entre 1 y 50 y nota de hasta 140 caracteres', async () => {
        const cuenta = await abrir()
        for (const cantidad of [0, 51, 1.5]) {
            expect(await error(agregarLatte(cuenta, mesero, { cantidad }))).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' })
        }
        expect(await error(agregarLatte(cuenta, mesero, { nota: 'x'.repeat(141) }))).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' })
    })

    it('una versión vieja → 409 CUENTA_MODIFICADA y no se escribe nada', async () => {
        const cuenta = await abrir()
        await agregarLatte(cuenta)
        const res = await error(agregarLatte(cuenta, mesero, { versionEsperada: cuenta.version }))
        expect(res).toMatchObject({ status: 409, code: 'CUENTA_MODIFICADA', details: { version: cuenta.version + 1 } })
        expect((await obtenerCuenta(cuenta.id, mesero)).rondas[0].items).toHaveLength(1)
    })

    it('con la cuenta pedida, agregar la reabre: cuenta abierta y mesa ocupada, con sus Eventos (D2)', async () => {
        const enviada = await cuentaConEnvio()
        await solicitarCuenta(enviada.id, { versionEsperada: enviada.version }, mesero)
        const { cuenta } = await agregarLatte(enviada)
        expect(cuenta.estado).toBe('abierta')
        expect((await Mesa.findById(mesa._id).lean()).estado).toBe('ocupada')
        const deCuenta = await eventos({ entidad: 'cuenta', entidadId: new ObjectId(enviada.id), tipo: 'cambio_estado' })
        expect(deCuenta.map((e) => e.a)).toEqual(['abierta', 'cuenta_pedida', 'abierta'])
        const deMesa = await eventos({ entidad: 'mesa', entidadId: mesa._id })
        expect(deMesa.map((e) => `${e.de}→${e.a}`)).toEqual(['libre→ocupada', 'ocupada→cuenta_pedida', 'cuenta_pedida→ocupada'])
    })

    it('F1-17: cualquier usuario con el permiso opera la cuenta; el Evento registra quién lo hizo', async () => {
        const cuenta = await abrir(mesero)
        const { cuenta: tras } = await agregarLatte(cuenta, otroMesero)
        expect(tras.mesero).toBe(mesero.id)
        const [agregado] = await eventos({ tipo: 'item_agregado' })
        expect(String(agregado.usuario)).toBe(otroMesero.id)
        // Sin comanda:tomar no
        expect(await error(agregarLatte(cuenta, sinComandas))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    })

    it('una cuenta cerrada no admite ítems (409 ESTADO_FINAL)', async () => {
        const cuenta = await abrir()
        await cancelarCuenta(cuenta.id, { motivo: 'se fueron', versionEsperada: cuenta.version }, mesero)
        expect(await error(agregarLatte(cuenta))).toMatchObject({ status: 409, code: 'ESTADO_FINAL' })
        expect(await error(agregarItem(String(new ObjectId()), { productoId: String(latte._id), cantidad: 1 }, mesero)))
            .toMatchObject({ status: 404, code: 'CUENTA_NO_ENCONTRADA' })
    })
})

describe('Editar y quitar en el borrador', () => {
    it('cambia cantidad y nota y recalcula; quitar deja Evento item_quitado y borra la ronda vacía', async () => {
        const cuenta = await abrir()
        const { item } = await agregarLatte(cuenta)
        const editada = await modificarItem(cuenta.id, item.id, { cantidad: 3, nota: 'tibio' }, mesero)
        expect(editada.rondas[0].items[0]).toMatchObject({ cantidad: 3, nota: 'tibio', subtotal: 27000 })
        expect(editada.pendiente).toBe(27000)

        const sinItems = await quitarItem(cuenta.id, item.id, {}, mesero)
        expect(sinItems).toMatchObject({ pendiente: 0, rondas: [] })
        expect(await Comanda.countDocuments()).toBe(0)
        const tipos = (await eventos({ entidad: 'cuenta' })).map((e) => e.tipo)
        expect(tipos).toEqual(['cambio_estado', 'item_agregado', 'item_modificado', 'item_quitado'])
    })

    it('un ítem ya enviado no se edita ni se quita (409 ITEM_NO_EDITABLE): se anula', async () => {
        const enviada = await cuentaConEnvio()
        const itemId = enviada.rondas[0].items[0].id
        expect(await error(quitarItem(enviada.id, itemId, {}, mesero))).toMatchObject({ status: 409, code: 'ITEM_NO_EDITABLE' })
        expect(await error(modificarItem(enviada.id, itemId, { cantidad: 2 }, mesero))).toMatchObject({ status: 409, code: 'ITEM_NO_EDITABLE' })
        expect(await error(quitarItem(enviada.id, String(new ObjectId()), {}, mesero))).toMatchObject({ status: 404, code: 'ITEM_NO_ENCONTRADO' })
    })
})

describe('Enviar la ronda', () => {
    it('pasa los ítems a enviado, suma la ronda al subtotal y registra ronda_enviada; lo siguiente va a la ronda 2', async () => {
        const cuenta = await abrir()
        await agregarLatte(cuenta, mesero, { cantidad: 2 })
        const enviada = await enviar(cuenta.id)
        expect(enviada).toMatchObject({ ultimaRonda: 1, subtotal: 18000, pendiente: 0, total: 18000 })
        expect(enviada.rondas[0]).toMatchObject({ numeroRonda: 1, estado: 'enviada', subtotal: 18000 })
        expect(enviada.rondas[0].items[0].estado).toBe('enviado')
        const comanda = await Comanda.findOne().lean()
        expect(comanda).toMatchObject({ estado: 'enviada', enviadaPor: new ObjectId(mesero.id) })
        expect(comanda.enviadaEn).toBeInstanceOf(Date)
        const [evento] = await eventos({ tipo: 'ronda_enviada' })
        expect(evento.datos).toMatchObject({ numeroRonda: 1, items: 1, subtotal: 18000 })

        const { cuenta: tras } = await agregarLatte(enviada)
        expect(tras.rondas.map((r) => [r.numeroRonda, r.estado])).toEqual([[1, 'enviada'], [2, 'borrador']])
    })

    it('exige comanda:enviar, número de ronda y versión; reenviar la misma ronda → 409 RONDA_YA_ENVIADA', async () => {
        const cuenta = await abrir()
        await agregarLatte(cuenta)
        const actual = await obtenerCuenta(cuenta.id, mesero)
        expect(await error(enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: actual.version }, sinComandas)))
            .toMatchObject({ status: 403, code: 'FORBIDDEN' })
        expect(await error(enviarRonda(cuenta.id, { numeroRonda: 1 }, mesero))).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' })
        await enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: actual.version }, mesero)
        expect(await error(enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: actual.version }, mesero)))
            .toMatchObject({ status: 409, code: 'RONDA_YA_ENVIADA', details: { numeroRonda: 1 } })
    })

    it('sin ítems en borrador → 409 RONDA_VACIA', async () => {
        const cuenta = await abrir()
        expect(await error(enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: cuenta.version }, mesero)))
            .toMatchObject({ status: 409, code: 'RONDA_VACIA' })
    })

    it('dos envíos simultáneos de la misma ronda: solo uno pasa', async () => {
        const cuenta = await abrir()
        await agregarLatte(cuenta)
        const actual = await obtenerCuenta(cuenta.id, mesero)
        const datos = { numeroRonda: 1, versionEsperada: actual.version }
        const resultados = await Promise.allSettled([enviarRonda(cuenta.id, datos, mesero), enviarRonda(cuenta.id, datos, otroMesero)])
        expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
        const [fallo] = resultados.filter((r) => r.status === 'rejected')
        expect(fallo.reason).toMatchObject({ status: 409, code: 'RONDA_YA_ENVIADA' })
        expect(await Evento.countDocuments({ tipo: 'ronda_enviada' })).toBe(1)
        expect((await obtenerCuenta(cuenta.id, mesero)).subtotal).toBe(9000)
    })

    it('si algo se agotó o se borró después de agregarlo, se rechaza toda la ronda con los ítems afectados (D3)', async () => {
        const cuenta = await abrir()
        const { item: itemHuevos } = await agregarItem(cuenta.id, {
            productoId: String(huevos._id), cantidad: 1, modificadores: conTermino('Yema media', ['Queso']),
        }, mesero)
        const { item: itemLatte } = await agregarLatte(cuenta)
        await GrupoModificadores.updateOne({ _id: extras._id, 'opciones.nombre': 'Queso' }, { $set: { 'opciones.$.disponible': false } })
        await Producto.deleteOne({ _id: latte._id })
        const actual = await obtenerCuenta(cuenta.id, mesero)
        const res = await error(enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: actual.version }, mesero))
        expect(res).toMatchObject({ status: 409, code: 'PRODUCT_UNAVAILABLE' })
        expect(res.details.items).toEqual(expect.arrayContaining([
            { itemId: itemHuevos.id, nombre: 'Huevos al gusto', motivo: 'opcion_agotada' },
            { itemId: itemLatte.id, nombre: 'Latte', motivo: 'producto_eliminado' },
        ]))
        const sinCambios = await obtenerCuenta(cuenta.id, mesero)
        expect(sinCambios).toMatchObject({ ultimaRonda: 0, subtotal: 0, version: actual.version })
        expect(sinCambios.rondas[0].estado).toBe('borrador')
    })

    it('la estación se recalcula al enviar (el KDS recibe la vigente)', async () => {
        const cuenta = await abrir()
        const { item } = await agregarLatte(cuenta)
        expect(item.estacion).toEqual({ id: String(barra._id), codigo: 'barra', nombre: barra.nombre })
        await Producto.updateOne({ _id: latte._id }, { estacion: cocina._id })
        const enviada = await enviar(cuenta.id)
        expect(enviada.rondas[0].items[0].estacion).toEqual({ id: String(cocina._id), codigo: 'cocina', nombre: cocina.nombre })
    })
})

describe('Concurrencia sobre la misma cuenta (el «toque» serializa)', () => {
    it('agregar y enviar a la vez: cada ítem queda en una sola ronda y los totales cuadran', async () => {
        for (let intento = 0; intento < 3; intento += 1) {
            const cuenta = await abrir(mesero, { mesaId: String((await Mesa.create({ numero: 20 + intento, zona: zona._id, capacidad: 2 }))._id) })
            await agregarLatte(cuenta)
            const actual = await obtenerCuenta(cuenta.id, mesero)
            await Promise.allSettled([
                agregarLatte(cuenta, otroMesero, { cantidad: 2 }),
                enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: actual.version }, mesero),
            ])
            const final = await obtenerCuenta(cuenta.id, mesero)
            const items = final.rondas.flatMap((r) => r.items)
            expect(items.length).toBeGreaterThanOrEqual(1)
            expect(final.subtotal + final.pendiente).toBe(items.reduce((t, i) => t + i.subtotal, 0))
        }
        expect(await verificarConsistenciaSalon()).toMatchObject({ ok: true })
    })

    it('cancelar y agregar a la vez: nunca queda un borrador en una cuenta cancelada', async () => {
        for (let intento = 0; intento < 3; intento += 1) {
            const cuenta = await abrir(mesero, { mesaId: String((await Mesa.create({ numero: 30 + intento, zona: zona._id, capacidad: 2 }))._id) })
            await Promise.allSettled([
                cancelarCuenta(cuenta.id, { motivo: 'error', versionEsperada: cuenta.version }, mesero),
                agregarLatte(cuenta, otroMesero),
            ])
            const final = await obtenerCuenta(cuenta.id, mesero)
            if (final.estado === 'cancelada') expect(final.rondas).toEqual([])
        }
        expect(await verificarConsistenciaSalon()).toMatchObject({ ok: true })
    })
})

describe('Anular un ítem enviado (F1-6, D1)', () => {
    it('solo con item:anular y motivo del catálogo; no se cobra y queda en el Evento', async () => {
        const enviada = await cuentaConEnvio()
        const itemId = enviada.rondas[0].items[0].id
        expect(await error(anularItem(enviada.id, itemId, { motivo: 'demora' }, mesero))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
        expect(await error(anularItem(enviada.id, itemId, { motivo: 'porque si' }, admin))).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' })
        expect(await error(anularItem(enviada.id, itemId, { motivo: 'otro' }, admin))).toMatchObject({ status: 400, code: 'MOTIVO_REQUERIDO' })

        const tras = await anularItem(enviada.id, itemId, { motivo: 'otro', detalle: 'se derramó' }, admin)
        expect(tras).toMatchObject({ subtotal: 0, total: 0 })
        expect(tras.rondas[0]).toMatchObject({ subtotal: 0 })
        expect(tras.rondas[0].items[0]).toMatchObject({ estado: 'anulado', anulacion: { motivo: 'otro', detalle: 'se derramó', por: admin.id } })
        const [evento] = await eventos({ tipo: 'item_anulado' })
        expect(evento).toMatchObject({ entidad: 'cuenta', de: 'enviado', a: 'anulado', motivo: 'otro: se derramó', usuario: new ObjectId(admin.id) })
        expect(evento.datos.item).toMatchObject({ productoId: String(latte._id), nombre: 'Latte', cantidad: 1, subtotal: 9000 })

        expect(await error(anularItem(enviada.id, itemId, { motivo: 'demora' }, admin))).toMatchObject({ status: 409, code: 'ESTADO_FINAL' })
    })

    it('desde en preparación o listo sí; servido o en borrador no', async () => {
        const enviada = await cuentaConEnvio()
        const itemId = enviada.rondas[0].items[0].id
        await Comanda.updateOne({ 'items._id': itemId }, { $set: { 'items.$.estado': 'listo' } })
        expect((await anularItem(enviada.id, itemId, { motivo: 'producto_defectuoso' }, admin)).rondas[0].items[0].estado).toBe('anulado')
        // en_preparacion, en otra cuenta
        const otra = await abrir(mesero, { mesaId: String(mesa2._id) })
        await agregarLatte(otra)
        const otraEnviada = await enviar(otra.id)
        const otroItem = otraEnviada.rondas[0].items[0].id
        await Comanda.updateOne({ 'items._id': otroItem }, { $set: { 'items.$.estado': 'en_preparacion' } })
        expect((await anularItem(otra.id, otroItem, { motivo: 'cliente_cambio' }, admin)).rondas[0].items[0].estado).toBe('anulado')

        const { item } = await agregarLatte(enviada)
        await Comanda.updateOne({ 'items._id': itemId }, { $set: { 'items.$.estado': 'servido', 'items.$.anulacion': null }, $inc: { subtotal: 9000 } })
        expect(await error(anularItem(enviada.id, itemId, { motivo: 'demora' }, admin))).toMatchObject({ status: 409, code: 'ESTADO_FINAL' })
        expect(await error(anularItem(enviada.id, item.id, { motivo: 'demora' }, admin))).toMatchObject({ status: 409, code: 'TRANSICION_INVALIDA' })
    })
})

describe('Permisos antes que el estado (no se filtra si la cuenta existe o en qué versión está)', () => {
    it('sin permiso → 403 aunque la cuenta no exista o la versión sea vieja', async () => {
        const enviada = await cuentaConEnvio()
        const cocinero = sesionDe('cocina', ['pedido:ver'])
        const vieja = { motivo: 'x', versionEsperada: 0 }
        const falsa = String(new ObjectId())
        const itemId = enviada.rondas[0].items[0].id
        for (const intento of [
            () => cerrarSinCobro(enviada.id, vieja, mesero),
            () => cerrarSinCobro(falsa, vieja, mesero),
            () => solicitarCuenta(falsa, vieja, cocinero),
            () => cancelarCuenta(enviada.id, vieja, cocinero),
            () => anularItem(falsa, itemId, { motivo: 'demora' }, mesero),
            () => cambiarEstadoMesa(falsa, { a: 'libre' }, cocinero),
            () => obtenerCuenta(enviada.id, cocinero),
            () => obtenerCuenta(falsa, cocinero),
        ]) {
            expect(await error(intento())).toMatchObject({ status: 403, code: 'FORBIDDEN' })
        }
    })
})

describe('Solicitar la cuenta', () => {
    it('pasa cuenta y mesa a cuenta_pedida', async () => {
        const enviada = await cuentaConEnvio()
        const pedida = await solicitarCuenta(enviada.id, { versionEsperada: enviada.version }, mesero)
        expect(pedida.estado).toBe('cuenta_pedida')
        expect((await Mesa.findById(mesa._id).lean()).estado).toBe('cuenta_pedida')
    })

    it('sin ningún ítem enviado y no anulado → 409 CUENTA_SIN_CONSUMO, que sugiere cancelar la cuenta', async () => {
        const cuenta = await abrir()
        const res = await error(solicitarCuenta(cuenta.id, { versionEsperada: cuenta.version }, mesero))
        expect(res).toMatchObject({ status: 409, code: 'CUENTA_SIN_CONSUMO' })
        expect(res.message).toMatch(/cancela/i)

        const enviada = await (async () => {
            await agregarLatte(cuenta)
            return enviar(cuenta.id)
        })()
        const anulada = await anularItem(enviada.id, enviada.rondas[0].items[0].id, { motivo: 'error_toma' }, admin)
        expect(await error(solicitarCuenta(cuenta.id, { versionEsperada: anulada.version }, mesero)))
            .toMatchObject({ status: 409, code: 'CUENTA_SIN_CONSUMO' })
    })

    it('con ítems sin enviar en el borrador → 409 RONDA_PENDIENTE', async () => {
        const enviada = await cuentaConEnvio()
        const { cuenta } = await agregarLatte(enviada)
        expect(await error(solicitarCuenta(cuenta.id, { versionEsperada: cuenta.version }, mesero)))
            .toMatchObject({ status: 409, code: 'RONDA_PENDIENTE' })
    })

    it('F1-18: anular el último ítem no anulado de una cuenta pedida la reabre (cuenta abierta, mesa ocupada, con Evento)', async () => {
        const cuenta = await abrir()
        await agregarLatte(cuenta)
        await agregarLatte(cuenta)
        const enviada = await enviar(cuenta.id)
        const pedida = await solicitarCuenta(cuenta.id, { versionEsperada: enviada.version }, mesero)
        const [primero, segundo] = pedida.rondas[0].items

        // Queda uno sin anular: sigue pedida
        const unaAnulada = await anularItem(cuenta.id, primero.id, { motivo: 'error_toma' }, admin)
        expect(unaAnulada.estado).toBe('cuenta_pedida')
        expect((await Mesa.findById(mesa._id).lean()).estado).toBe('cuenta_pedida')

        // Era el último: vuelve sola a abierta y la mesa a ocupada
        const reabierta = await anularItem(cuenta.id, segundo.id, { motivo: 'demora' }, admin)
        expect(reabierta).toMatchObject({ estado: 'abierta', subtotal: 0, total: 0 })
        expect((await Mesa.findById(mesa._id).lean()).estado).toBe('ocupada')
        const deCuenta = await eventos({ entidad: 'cuenta', entidadId: new ObjectId(cuenta.id), tipo: 'cambio_estado' })
        expect(deCuenta.at(-1)).toMatchObject({ de: 'cuenta_pedida', a: 'abierta', usuario: new ObjectId(admin.id) })
        expect(deCuenta.at(-1).motivo).toMatch(/anul/i)
        const deMesa = await eventos({ entidad: 'mesa', entidadId: mesa._id })
        expect(deMesa.at(-1)).toMatchObject({ de: 'cuenta_pedida', a: 'ocupada' })

        // Cancelar sigue sin permitirse (hubo ítems enviados): la cierra el admin sin cobro
        expect(await error(cancelarCuenta(cuenta.id, { motivo: 'x', versionEsperada: reabierta.version }, mesero)))
            .toMatchObject({ status: 409, code: 'CUENTA_CON_ITEMS_ENVIADOS' })
        const cerrada = await cerrarSinCobro(cuenta.id, { motivo: 'todo anulado', versionEsperada: reabierta.version }, admin)
        expect(cerrada.estado).toBe('cerrada_sin_cobro')
        expect(await verificarConsistenciaSalon()).toMatchObject({ ok: true })
    })

    it('exige cuenta:solicitar y la versión vigente', async () => {
        const enviada = await cuentaConEnvio()
        expect(await error(solicitarCuenta(enviada.id, { versionEsperada: enviada.version }, sinComandas)))
            .toMatchObject({ status: 403, code: 'FORBIDDEN' })
        expect(await error(solicitarCuenta(enviada.id, { versionEsperada: enviada.version - 1 }, mesero)))
            .toMatchObject({ status: 409, code: 'CUENTA_MODIFICADA' })
    })
})

describe('Cancelar la cuenta (D4)', () => {
    it('desde abierta sin ítems enviados: estado final cancelada, borrador descartado con Evento y mesa por limpiar', async () => {
        const cuenta = await abrir()
        const { cuenta: conBorrador } = await agregarLatte(cuenta)
        const cancelada = await cancelarCuenta(cuenta.id, { motivo: 'abierta por error', versionEsperada: conBorrador.version }, sinComandas)
        expect(cancelada).toMatchObject({ estado: 'cancelada', pendiente: 0, rondas: [], motivoCierre: 'abierta por error', cerradaPor: sinComandas.id })
        expect(await Comanda.countDocuments()).toBe(0)
        expect(await Mesa.findById(mesa._id).lean()).toMatchObject({ estado: 'por_limpiar', cuentaActual: null })
        const tipos = (await eventos({ entidad: 'cuenta' })).map((e) => `${e.tipo}:${e.a ?? ''}`)
        expect(tipos).toEqual(['cambio_estado:abierta', 'item_agregado:', 'ronda_descartada:', 'cambio_estado:cancelada'])
        const [, , descartada] = await eventos({ entidad: 'cuenta' })
        expect(descartada.datos).toMatchObject({ numeroRonda: 1, items: [{ nombre: 'Latte', cantidad: 1, subtotal: 9000 }] })
        const deMesa = await eventos({ entidad: 'mesa', entidadId: mesa._id })
        expect(deMesa.at(-1)).toMatchObject({ de: 'ocupada', a: 'por_limpiar' })
    })

    it('no desde cuenta_pedida, ni con ítems enviados (aunque estén anulados), ni sin motivo', async () => {
        const enviada = await cuentaConEnvio()
        expect(await error(cancelarCuenta(enviada.id, { motivo: 'x', versionEsperada: enviada.version }, mesero)))
            .toMatchObject({ status: 409, code: 'CUENTA_CON_ITEMS_ENVIADOS' })
        const anulada = await anularItem(enviada.id, enviada.rondas[0].items[0].id, { motivo: 'error_toma' }, admin)
        expect(await error(cancelarCuenta(enviada.id, { motivo: 'x', versionEsperada: anulada.version }, mesero)))
            .toMatchObject({ status: 409, code: 'CUENTA_CON_ITEMS_ENVIADOS' })

        // cuenta_pedida (en otra mesa)
        const otra = await abrir(mesero, { mesaId: String(mesa2._id) })
        await agregarLatte(otra)
        const otraEnviada = await enviar(otra.id)
        const pedida = await solicitarCuenta(otra.id, { versionEsperada: otraEnviada.version }, mesero)
        expect(await error(cancelarCuenta(otra.id, { motivo: 'x', versionEsperada: pedida.version }, mesero)))
            .toMatchObject({ status: 409, code: 'TRANSICION_INVALIDA' })

        const sinMotivo = await abrir(mesero, { mesaId: String((await Mesa.create({ numero: 3, zona: zona._id, capacidad: 2 }))._id) })
        expect(await error(cancelarCuenta(sinMotivo.id, { versionEsperada: sinMotivo.version }, mesero)))
            .toMatchObject({ status: 400, code: 'MOTIVO_REQUERIDO' })
        expect(await error(cancelarCuenta(sinMotivo.id, { motivo: 'x', versionEsperada: sinMotivo.version }, sesionDe('cocina', []))))
            .toMatchObject({ status: 403, code: 'FORBIDDEN' })
    })
})

describe('Cerrar sin cobro (F1-13)', () => {
    it('solo con cuenta:cerrar_sin_cobro (admin) y motivo; deja la mesa por limpiar y descarta el borrador', async () => {
        const enviada = await cuentaConEnvio()
        const { cuenta } = await agregarLatte(enviada)
        expect(await error(cerrarSinCobro(cuenta.id, { motivo: 'cortesía', versionEsperada: cuenta.version }, mesero)))
            .toMatchObject({ status: 403, code: 'FORBIDDEN' })
        expect(await error(cerrarSinCobro(cuenta.id, { versionEsperada: cuenta.version }, admin)))
            .toMatchObject({ status: 400, code: 'MOTIVO_REQUERIDO' })
        const cerrada = await cerrarSinCobro(cuenta.id, { motivo: 'cortesía de la casa', versionEsperada: cuenta.version }, admin)
        expect(cerrada).toMatchObject({ estado: 'cerrada_sin_cobro', subtotal: 9000, pendiente: 0, motivoCierre: 'cortesía de la casa', cerradaPor: admin.id })
        expect(cerrada.cerradaEn).toBeTruthy()
        expect(cerrada.rondas.map((r) => r.estado)).toEqual(['enviada'])
        expect(await Mesa.findById(mesa._id).lean()).toMatchObject({ estado: 'por_limpiar', cuentaActual: null })
        expect(await error(cerrarSinCobro(cuenta.id, { motivo: 'x', versionEsperada: cerrada.version }, admin)))
            .toMatchObject({ status: 409, code: 'ESTADO_FINAL' })
    })

    it('si una mesa de la cuenta ya no la apunta, no cierra nada (409 MESAS_INCONSISTENTES)', async () => {
        const cuenta = await abrir()
        await Mesa.updateOne({ _id: mesa._id }, { cuentaActual: null })
        expect(await error(cerrarSinCobro(cuenta.id, { motivo: 'x', versionEsperada: cuenta.version }, admin)))
            .toMatchObject({ status: 409, code: 'MESAS_INCONSISTENTES' })
        expect((await Cuenta.findById(cuenta.id).lean()).estado).toBe('abierta')
    })
})

describe('Transiciones manuales de la mesa', () => {
    it('por_limpiar → libre con mesa:operar, y libre ↔ bloqueada con mesa:bloquear y motivo, con su Evento', async () => {
        const cuenta = await abrir()
        await cancelarCuenta(cuenta.id, { motivo: 'error', versionEsperada: cuenta.version }, mesero)
        expect(await error(cambiarEstadoMesa(String(mesa._id), { a: 'libre' }, sesionDe('cocina', [])))).toMatchObject({ status: 403 })
        expect((await cambiarEstadoMesa(String(mesa._id), { a: 'libre' }, mesero)).estado).toBe('libre')
        expect(await error(cambiarEstadoMesa(String(mesa._id), { a: 'bloqueada' }, sinComandas))).toMatchObject({ status: 400, code: 'MOTIVO_REQUERIDO' })
        await cambiarEstadoMesa(String(mesa._id), { a: 'bloqueada', motivo: 'pata rota' }, sinComandas)
        expect(await error(abrir())).toMatchObject({ status: 409, code: 'MESA_NO_DISPONIBLE' })
        await cambiarEstadoMesa(String(mesa._id), { a: 'libre', motivo: 'arreglada' }, sinComandas)
        const ultimos = (await eventos({ entidad: 'mesa', entidadId: mesa._id })).slice(-3)
        expect(ultimos.map((e) => [e.de, e.a, e.motivo])).toEqual([
            ['por_limpiar', 'libre', ''], ['libre', 'bloqueada', 'pata rota'], ['bloqueada', 'libre', 'arreglada'],
        ])
    })

    it('una mesa con cuentaActual no cambia a mano: ocupada o con la cuenta pedida solo pasa a por_limpiar al cerrar o cancelar su cuenta', async () => {
        const enviada = await cuentaConEnvio()
        expect(await error(cambiarEstadoMesa(String(mesa._id), { a: 'por_limpiar' }, admin))).toMatchObject({ status: 409, code: 'TRANSICION_INVALIDA' })
        await solicitarCuenta(enviada.id, { versionEsperada: enviada.version }, mesero)
        expect(await error(cambiarEstadoMesa(String(mesa._id), { a: 'por_limpiar' }, admin))).toMatchObject({ status: 409, code: 'TRANSICION_INVALIDA' })
        expect(await error(cambiarEstadoMesa(String(mesa._id), { a: 'libre' }, admin))).toMatchObject({ status: 409, code: 'TRANSICION_INVALIDA' })

        // Aunque el estado diga por_limpiar o libre, si apunta a una cuenta no se toca (dato incoherente)
        await Mesa.updateOne({ _id: mesa._id }, { estado: 'por_limpiar' })
        expect(await error(cambiarEstadoMesa(String(mesa._id), { a: 'libre' }, admin))).toMatchObject({ status: 409, code: 'MESA_CON_CUENTA' })
        await Mesa.updateOne({ _id: mesa._id }, { estado: 'libre' })
        expect(await error(cambiarEstadoMesa(String(mesa._id), { a: 'bloqueada', motivo: 'x' }, admin))).toMatchObject({ status: 409, code: 'MESA_CON_CUENTA' })
        expect((await Mesa.findById(mesa._id).lean()).estado).toBe('libre')
    })
})

describe('Verificador de consistencia del salón', () => {
    it('sin problemas en un flujo normal', async () => {
        const enviada = await cuentaConEnvio()
        await agregarLatte(enviada)
        const resultado = await verificarConsistenciaSalon()
        expect(resultado).toMatchObject({ ok: true, problemas: [] })
        expect(resultado.revisadas).toMatchObject({ cuentas: 1, comandas: 2 })
    })

    it('detecta una cuenta con el total alterado', async () => {
        const enviada = await cuentaConEnvio()
        await Cuenta.updateOne({ _id: enviada.id }, { $set: { total: 1 } })
        const { ok, problemas } = await verificarConsistenciaSalon()
        expect(ok).toBe(false)
        expect(problemas).toContainEqual(expect.objectContaining({ codigo: 'TOTALES_INCONSISTENTES', entidad: 'cuenta', id: enviada.id }))
    })

    it('detecta una cuenta cerrada sin fecha de cierre (invariantes del esquema)', async () => {
        const cuenta = await abrir()
        await cancelarCuenta(cuenta.id, { motivo: 'error', versionEsperada: cuenta.version }, mesero)
        await Cuenta.updateOne({ _id: cuenta.id }, { $set: { cerradaEn: null } })
        const { problemas } = await verificarConsistenciaSalon({ desde: new Date(0) })
        expect(problemas).toContainEqual(expect.objectContaining({ codigo: 'CUENTA_INVALIDA', id: cuenta.id }))
    })

    it('detecta mesas y cuentas que no se apuntan entre sí y ítems con el subtotal alterado', async () => {
        const enviada = await cuentaConEnvio()
        await Mesa.updateOne({ _id: mesa._id }, { cuentaActual: null })
        await Mesa.updateOne({ _id: mesa2._id }, { estado: 'ocupada' })
        await Comanda.updateOne({}, { $set: { 'items.0.subtotal': 1 } })
        const codigos = (await verificarConsistenciaSalon()).problemas.map((p) => `${p.codigo}:${p.id}`)
        expect(codigos).toEqual(expect.arrayContaining([
            `MESA_NO_APUNTA_A_LA_CUENTA:${mesa._id}`,
            `MESA_OCUPADA_SIN_CUENTA:${mesa2._id}`,
            `COMANDA_INVALIDA:${enviada.rondas[0].id}`,
        ]))
    })
})
