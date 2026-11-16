// Fase 5 · 5.4 (F5-5) · Proveedores (compra:gestionar), órdenes de compra (compra:gestionar) y recepción
// (compra:recibir): la recepción suma existencias, recalcula el costo promedio, guarda los lotes con vencimiento y
// reactiva lo que el sistema había agotado, todo en una transacción con su Evento.
import mongoose from 'mongoose'
import { z } from 'zod'
import Insumo from './insumo.model.js'
import Contador from '../compartido/contador.model.js'
import { Proveedor, OrdenCompra, Recepcion, Lote, COLACION_PROVEEDOR, codigoOrden, totalOrden, MAX_LINEAS_ORDEN } from './compras.model.js'
import { AppError } from '../compartido/errors.js'
import { registrarEvento } from '../compartido/estados.service.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { esFechaValida } from '../compartido/fechas.js'
import { texto, textoOpcional } from '../compartido/comunes.schema.js'
import { validar } from '../salon/cuentas.schema.js'
import { MAX_COSTO_UNITARIO, redondear } from './cantidades.js'
import { cantidad, id, motivoObligatorio } from './inventario.schema.js'
import { exigirPermiso } from './insumos.service.js'
import { tienePermiso } from '../identidad/permisos.js'
import { aplicarMovimientos, actorDe } from './movimientos.service.js'
import { revisarDisponibilidad, avisarCambiosDisponibilidad } from './consumo.service.js'

export const MAX_ORDENES = 200
const LECTURA = ['inventario:ver', 'compra:gestionar', 'compra:recibir']
const version = z.number({ error: 'La versión es requerida' }).int().min(0)

// ── Proveedores ──
const proveedorCampos = {
    nombre: texto('El nombre', 2, 80),
    nit: textoOpcional('El NIT', 20),
    contacto: textoOpcional('El contacto', 80),
    telefono: textoOpcional('El teléfono', 30),
    correo: z.union([z.literal(''), z.email({ error: 'El correo no es válido' })]).optional(),
    notas: textoOpcional('Las notas', 300),
}
export const crearProveedorSchema = z.strictObject(proveedorCampos)
export const editarProveedorSchema = z.strictObject({
    ...Object.fromEntries(Object.entries(proveedorCampos).map(([k, v]) => [k, v.optional()])),
    activo: z.boolean({ error: 'Activo debe ser verdadero o falso' }).optional(),
    versionEsperada: version,
})

const formatoProveedor = (p) => ({
    id: String(p._id), nombre: p.nombre, nit: p.nit, contacto: p.contacto, telefono: p.telefono, correo: p.correo,
    notas: p.notas, activo: p.activo, version: p.__v ?? 0,
})
const proveedorRepetido = (nombre) => new AppError(409, 'PROVEEDOR_DUPLICADO', `Ya existe un proveedor llamado «${nombre}».`)

export const listarProveedores = async (sesion) => {
    exigirPermiso(sesion, ...LECTURA)
    return (await Proveedor.find().collation(COLACION_PROVEEDOR).sort({ nombre: 1 }).limit(500).lean()).map(formatoProveedor)
}

export const crearProveedor = async (datos, sesion) => {
    exigirPermiso(sesion, 'compra:gestionar')
    const campos = validar(crearProveedorSchema, datos)
    try {
        return await conTransaccion(async (session) => {
            if (await Proveedor.exists({ nombre: campos.nombre }).collation(COLACION_PROVEEDOR).session(session)) throw proveedorRepetido(campos.nombre)
            const [p] = await Proveedor.create([campos], { session })
            await registrarEvento({ entidad: 'proveedor', entidadId: p._id, tipo: 'proveedor_creado', usuario: sesion.id, actor: actorDe(sesion), datos: { nombre: p.nombre }, session })
            return formatoProveedor(p.toObject())
        })
    } catch (error) {
        if (error?.code === 11000) throw proveedorRepetido(campos.nombre)
        throw error
    }
}

export const editarProveedor = async (proveedorId, datos, sesion) => {
    exigirPermiso(sesion, 'compra:gestionar')
    const { versionEsperada, ...cambios } = validar(editarProveedorSchema, datos)
    const noExiste = () => new AppError(404, 'PROVEEDOR_NO_ENCONTRADO', 'El proveedor no existe.')
    if (!mongoose.isValidObjectId(proveedorId)) throw noExiste()
    try {
        return await conTransaccion(async (session) => {
            const p = await Proveedor.findById(proveedorId).session(session)
            if (!p) throw noExiste()
            if (p.__v !== versionEsperada) throw new AppError(409, 'PROVEEDOR_CAMBIADO', 'Otra persona cambió este proveedor. Recarga e intenta de nuevo.')
            if (cambios.nombre && cambios.nombre !== p.nombre
                && await Proveedor.exists({ nombre: cambios.nombre, _id: { $ne: p._id } }).collation(COLACION_PROVEEDOR).session(session)) {
                throw proveedorRepetido(cambios.nombre)
            }
            const antes = {}
            for (const [k, v] of Object.entries(cambios)) {
                if (v !== undefined && v !== p[k]) {
                    antes[k] = p[k]
                    p[k] = v
                }
            }
            if (!Object.keys(antes).length) return formatoProveedor(p.toObject())
            p.increment()
            await p.save({ session })
            await registrarEvento({
                entidad: 'proveedor', entidadId: p._id, tipo: 'proveedor_editado', usuario: sesion.id, actor: actorDe(sesion),
                datos: { nombre: p.nombre, antes, despues: Object.fromEntries(Object.keys(antes).map((k) => [k, p[k]])) }, session,
            })
            return formatoProveedor(p.toObject())
        })
    } catch (error) {
        if (error?.code === 11000) throw proveedorRepetido(cambios.nombre)
        throw error
    }
}

// ── Órdenes de compra ──
const lineaOrden = z.strictObject({
    insumoId: id('El insumo'),
    cantidad: cantidad('La cantidad', { positiva: true }),
    costoUnitario: cantidad('El costo', { max: MAX_COSTO_UNITARIO, decimales: 2 }),
})
export const crearOrdenSchema = z.strictObject({
    proveedorId: id('El proveedor'),
    lineas: z.array(lineaOrden, { error: 'Agrega los insumos de la orden' })
        .min(1, { error: 'Agrega al menos un insumo' }).max(MAX_LINEAS_ORDEN, { error: `Una orden lleva hasta ${MAX_LINEAS_ORDEN} insumos` }),
    notas: textoOpcional('Las notas', 300),
})
export const cancelarOrdenSchema = z.strictObject({ motivo: motivoObligatorio, versionEsperada: version })
const fechaVencimiento = z.string({ error: 'La fecha de vencimiento no es válida' }).refine(esFechaValida, { error: 'La fecha de vencimiento no es válida' })
export const recepcionSchema = z.strictObject({
    versionEsperada: version,
    lineas: z.array(z.strictObject({
        lineaId: id('La línea de la orden'),
        cantidad: cantidad('La cantidad recibida', { positiva: true }),
        costoUnitario: cantidad('El costo', { max: MAX_COSTO_UNITARIO, decimales: 2 }).optional(),
        vencimiento: fechaVencimiento.nullable().optional(),
    }), { error: 'Indica lo recibido' }).min(1, { error: 'Indica al menos un insumo recibido' }).max(MAX_LINEAS_ORDEN),
    nota: textoOpcional('La nota', 300),
})

export const formatoOrden = (o) => ({
    id: String(o._id), codigo: o.codigo, proveedor: { id: String(o.proveedor), nombre: o.proveedorNombre }, estado: o.estado,
    lineas: o.lineas.map((l) => ({
        id: String(l._id), insumoId: String(l.insumo), insumo: l.insumoNombre, unidad: l.unidad, cantidad: l.cantidad,
        costoUnitario: l.costoUnitario, recibido: l.recibido, pendiente: redondear(Math.max(l.cantidad - l.recibido, 0)),
    })),
    total: o.total, notas: o.notas, motivoCancelacion: o.motivoCancelacion, creadaEn: o.createdAt, cerradaEn: o.cerradaEn, version: o.__v ?? 0,
})

export const listarOrdenes = async (sesion) => {
    exigirPermiso(sesion, ...LECTURA)
    // Abiertas y parciales primero; luego las cerradas más recientes
    const [vivas, cerradas] = await Promise.all([
        OrdenCompra.find({ estado: { $in: ['abierta', 'parcial'] } }).sort({ createdAt: -1 }).limit(MAX_ORDENES).lean(),
        OrdenCompra.find({ estado: { $in: ['recibida', 'cancelada'] } }).sort({ createdAt: -1 }).limit(50).lean(),
    ])
    return [...vivas, ...cerradas].map(formatoOrden)
}

const siguienteNumero = async (session) => {
    const { seq } = await Contador.findOneAndUpdate({ _id: 'ordenCompra' }, { $inc: { seq: 1 } }, { returnDocument: 'after', upsert: true, session })
    return seq
}

export const crearOrden = async (datos, sesion) => {
    exigirPermiso(sesion, 'compra:gestionar')
    const { proveedorId, lineas, notas = '' } = validar(crearOrdenSchema, datos)
    if (new Set(lineas.map((l) => l.insumoId)).size !== lineas.length) throw new AppError(400, 'VALIDATION_ERROR', 'Hay insumos repetidos en la orden.')
    // El contador se crea fuera de la transacción la primera vez (un upsert dentro chocaría con otro primer uso)
    await Contador.updateOne({ _id: 'ordenCompra' }, { $setOnInsert: { seq: 0 } }, { upsert: true }).catch((e) => { if (e?.code !== 11000) throw e })
    return conTransaccion(async (session) => {
        const proveedor = await Proveedor.findOne({ _id: proveedorId, activo: true }).session(session).lean()
        if (!proveedor) throw new AppError(409, 'PROVEEDOR_NO_DISPONIBLE', 'El proveedor no existe o está inactivo.')
        const insumos = await Insumo.find({ _id: { $in: lineas.map((l) => l.insumoId) }, activo: true }).session(session).lean()
        if (insumos.length !== lineas.length) throw new AppError(409, 'INSUMO_NO_DISPONIBLE', 'Algún insumo de la orden no existe o está inactivo.')
        const porId = new Map(insumos.map((i) => [String(i._id), i]))
        const lineasOrden = lineas.map((l) => {
            const i = porId.get(l.insumoId)
            return { insumo: i._id, insumoNombre: i.nombre, unidad: i.unidad, cantidad: l.cantidad, costoUnitario: l.costoUnitario, recibido: 0 }
        })
        const numero = await siguienteNumero(session)
        const [orden] = await OrdenCompra.create([{
            numero, codigo: codigoOrden(numero), proveedor: proveedor._id, proveedorNombre: proveedor.nombre,
            lineas: lineasOrden, total: totalOrden(lineasOrden), notas, creadaPor: sesion.id,
        }], { session })
        await registrarEvento({
            entidad: 'orden_compra', entidadId: orden._id, tipo: 'orden_creada', usuario: sesion.id, actor: actorDe(sesion),
            datos: { codigo: orden.codigo, proveedor: proveedor.nombre, total: orden.total, lineas: lineasOrden.length }, session,
        })
        return formatoOrden(orden.toObject())
    })
}

const ordenNoExiste = () => new AppError(404, 'ORDEN_NO_ENCONTRADA', 'La orden de compra no existe.')
const ordenCambiada = () => new AppError(409, 'ORDEN_CAMBIADA', 'La orden cambió mientras la mirabas. Recarga e intenta de nuevo.')

export const cancelarOrden = async (ordenId, datos, sesion) => {
    exigirPermiso(sesion, 'compra:gestionar')
    const { motivo, versionEsperada } = validar(cancelarOrdenSchema, datos)
    if (!mongoose.isValidObjectId(ordenId)) throw ordenNoExiste()
    return conTransaccion(async (session) => {
        const orden = await OrdenCompra.findById(ordenId).session(session)
        if (!orden) throw ordenNoExiste()
        if (orden.__v !== versionEsperada) throw ordenCambiada()
        if (!['abierta', 'parcial'].includes(orden.estado)) throw new AppError(409, 'ORDEN_CERRADA', 'La orden ya está recibida o cancelada.')
        const de = orden.estado
        orden.set({ estado: 'cancelada', motivoCancelacion: motivo, cerradaEn: new Date() })
        orden.increment()
        await orden.save({ session })
        await registrarEvento({
            entidad: 'orden_compra', entidadId: orden._id, tipo: 'orden_cancelada', de, a: 'cancelada', motivo, usuario: sesion.id, actor: actorDe(sesion),
            datos: { codigo: orden.codigo }, session,
        })
        return formatoOrden(orden.toObject())
    })
}

/**
 * Recepción (total o parcial) de una orden abierta o parcial. Escritura condicional por versión (__v): dos
 * recepciones simultáneas de la misma orden chocan y la segunda ve lo que ya se recibió. No se recibe más de
 * lo pendiente (409 RECEPCION_EXCEDE).
 */
export const recibirOrden = async (ordenId, datos, sesion) => {
    exigirPermiso(sesion, 'compra:recibir')
    const { versionEsperada, lineas, nota = '' } = validar(recepcionSchema, datos)
    if (new Set(lineas.map((l) => l.lineaId)).size !== lineas.length) throw new AppError(400, 'VALIDATION_ERROR', 'Hay líneas repetidas en la recepción.')
    if (!mongoose.isValidObjectId(ordenId)) throw ordenNoExiste()

    let cambios = []
    const resultado = await conTransaccion(async (session) => {
        cambios = []
        const orden = await OrdenCompra.findById(ordenId).session(session)
        if (!orden) throw ordenNoExiste()
        if (orden.__v !== versionEsperada) throw ordenCambiada()
        if (!['abierta', 'parcial'].includes(orden.estado)) throw new AppError(409, 'ORDEN_CERRADA', 'La orden ya está recibida o cancelada.')

        const recibidas = lineas.map((l) => {
            const linea = orden.lineas.id(l.lineaId)
            if (!linea) throw new AppError(404, 'LINEA_NO_ENCONTRADA', 'Esa línea no es de esta orden.')
            const pendiente = redondear(linea.cantidad - linea.recibido)
            if (l.cantidad > pendiente) {
                throw new AppError(409, 'RECEPCION_EXCEDE', `De ${linea.insumoNombre} quedan ${pendiente} ${linea.unidad} por recibir.`, { linea: l.lineaId, pendiente })
            }
            // Cambiar el costo pactado cambia el costo promedio y los márgenes: solo quien gestiona las compras
            if (l.costoUnitario !== undefined && l.costoUnitario !== linea.costoUnitario && !tienePermiso(sesion.permisos || [], 'compra:gestionar')) {
                throw new AppError(403, 'FORBIDDEN', 'Cambiar el costo pactado requiere el permiso compra:gestionar.', { requiere: ['compra:gestionar'] })
            }
            linea.recibido = redondear(linea.recibido + l.cantidad)
            return { linea: linea._id, insumo: linea.insumo, insumoNombre: linea.insumoNombre, cantidad: l.cantidad, costoUnitario: l.costoUnitario ?? linea.costoUnitario, vencimiento: l.vencimiento || null }
        })
        const completa = orden.lineas.every((l) => l.recibido >= l.cantidad)
        const de = orden.estado
        orden.estado = completa ? 'recibida' : 'parcial'
        if (completa) orden.cerradaEn = new Date()
        orden.increment()
        await orden.save({ session })

        const [recepcion] = await Recepcion.create([{
            orden: orden._id, ordenCodigo: orden.codigo, lineas: recibidas, total: totalOrden(recibidas), recibidaPor: sesion.id, nota,
        }], { session })
        const movimientos = await aplicarMovimientos(
            recibidas.map((r) => ({ insumo: r.insumo, cantidad: r.cantidad, tipo: 'recepcion', costoUnitario: r.costoUnitario })),
            { motivo: `compra ${orden.codigo} recibida`, sesion, session, referencia: { tipo: 'recepcion', id: recepcion._id, codigo: orden.codigo } },
        )
        const conVencimiento = recibidas.filter((r) => r.vencimiento)
        if (conVencimiento.length) {
            await Lote.create(conVencimiento.map((r) => ({
                insumo: r.insumo, recepcion: recepcion._id, ordenCodigo: orden.codigo, cantidad: r.cantidad, vencimiento: r.vencimiento,
            })), { session, ordered: true })
        }
        await registrarEvento({
            entidad: 'orden_compra', entidadId: orden._id, tipo: 'compra_recibida', de, a: orden.estado, usuario: sesion.id, actor: actorDe(sesion),
            datos: { codigo: orden.codigo, recepcion: recepcion._id, total: recepcion.total, movimientos: movimientos.map((m) => ({ nombre: m.nombre, cantidad: m.cantidad, existencia: m.existenciaDespues })) },
            session,
        })
        cambios = await revisarDisponibilidad(movimientos.map((m) => m.insumo), sesion, session)
        return { orden: formatoOrden(orden.toObject()), recepcion: { id: String(recepcion._id), total: recepcion.total, lineas: recibidas.length } }
    })
    avisarCambiosDisponibilidad(cambios)
    return resultado
}
