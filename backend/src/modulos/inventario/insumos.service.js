// Fase 5 · 5.1 · Insumos: listar, crear (con su existencia inicial como movimiento) y editar. No se borran:
// se desactivan. Cada alta y edición deja su Evento en la misma transacción.
import mongoose from 'mongoose'
import Insumo, { COLACION_INSUMO } from './insumo.model.js'
import MovimientoInventario from './movimiento.model.js'
import { AppError } from '../compartido/errors.js'
import { registrarEvento } from '../compartido/estados.service.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { tienePermiso } from '../identidad/permisos.js'
import { validar } from '../salon/cuentas.schema.js'
import { crearInsumoSchema, editarInsumoSchema } from './inventario.schema.js'
import { aplicarMovimientos, actorDe } from './movimientos.service.js'

export const MAX_INSUMOS = 500
export const MAX_MOVIMIENTOS = 200

export const exigirPermiso = (sesion, ...claves) => {
    if (!claves.some((c) => tienePermiso(sesion?.permisos || [], c))) {
        throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: claves })
    }
}
const noEncontrado = () => new AppError(404, 'INSUMO_NO_ENCONTRADO', 'El insumo no existe.')
const nombreRepetido = (nombre) => new AppError(409, 'INSUMO_DUPLICADO', `Ya existe un insumo llamado «${nombre}».`)

/** Estado de la existencia frente al mínimo (texto, no solo color, en la pantalla). */
export const nivelExistencia = (i) => (i.existencia <= 0 ? 'agotado' : i.existencia <= i.minimo ? 'bajo' : 'ok')

export const formatoInsumo = (i) => ({
    id: String(i._id),
    nombre: i.nombre,
    unidad: i.unidad,
    existencia: i.existencia,
    minimo: i.minimo,
    costoPromedio: i.costoPromedio,
    // Valor del inventario de ese insumo en COP entero (la existencia negativa no resta)
    valor: Math.round(Math.max(i.existencia, 0) * i.costoPromedio),
    activo: i.activo,
    nivel: nivelExistencia(i),
    version: i.__v ?? 0,
    actualizadoEn: i.updatedAt,
})

const LECTURA = ['inventario:ver', 'inventario:gestionar', 'inventario:ajustar', 'compra:gestionar', 'compra:recibir']

export const listarInsumos = async (sesion) => {
    exigirPermiso(sesion, ...LECTURA)
    const insumos = await Insumo.find().collation(COLACION_INSUMO).sort({ nombre: 1 }).limit(MAX_INSUMOS).lean()
    return insumos.map(formatoInsumo)
}

const traducirDuplicado = (error, nombre) => {
    if (error?.code === 11000) throw nombreRepetido(nombre)
    throw error
}

export const crearInsumo = async (datos, sesion) => {
    exigirPermiso(sesion, 'inventario:gestionar')
    const { existenciaInicial = 0, ...campos } = validar(crearInsumoSchema, datos)
    try {
        return await conTransaccion(async (session) => {
            if (await Insumo.exists({ nombre: campos.nombre }).collation(COLACION_INSUMO).session(session)) throw nombreRepetido(campos.nombre)
            const [insumo] = await Insumo.create([campos], { session })
            const movimientos = existenciaInicial > 0
                ? await aplicarMovimientos([{ insumo: insumo._id, cantidad: existenciaInicial, tipo: 'inicial' }], {
                    motivo: 'existencia inicial', sesion, referencia: { tipo: 'insumo', id: insumo._id }, session,
                })
                : []
            await registrarEvento({
                entidad: 'insumo', entidadId: insumo._id, tipo: 'insumo_creado', usuario: sesion.id, actor: actorDe(sesion),
                datos: { nombre: insumo.nombre, unidad: insumo.unidad, minimo: insumo.minimo, costoPromedio: insumo.costoPromedio, existenciaInicial }, session,
            })
            const guardado = movimientos.length ? await Insumo.findById(insumo._id).session(session).lean() : insumo.toObject()
            return formatoInsumo(guardado)
        })
    } catch (error) {
        return traducirDuplicado(error, campos.nombre)
    }
}

const CAMPOS_EDITABLES = ['nombre', 'unidad', 'minimo', 'costoPromedio', 'activo']

export const editarInsumo = async (insumoId, datos, sesion) => {
    exigirPermiso(sesion, 'inventario:gestionar')
    const { versionEsperada, ...cambios } = validar(editarInsumoSchema, datos)
    if (!mongoose.isValidObjectId(insumoId)) throw noEncontrado()
    try {
        return await conTransaccion(async (session) => {
            const insumo = await Insumo.findById(insumoId).session(session)
            if (!insumo) throw noEncontrado()
            if (versionEsperada !== undefined && versionEsperada !== insumo.__v) {
                throw new AppError(409, 'INSUMO_CAMBIADO', 'Otra persona cambió este insumo. Recarga e intenta de nuevo.', { version: insumo.__v })
            }
            if (cambios.nombre && cambios.nombre !== insumo.nombre
                && await Insumo.exists({ nombre: cambios.nombre, _id: { $ne: insumo._id } }).collation(COLACION_INSUMO).session(session)) {
                throw nombreRepetido(cambios.nombre)
            }
            // Cambiar la unidad con historial cambiaría el sentido de las cantidades ya registradas
            if (cambios.unidad && cambios.unidad !== insumo.unidad
                && await MovimientoInventario.exists({ insumo: insumo._id }).session(session)) {
                throw new AppError(409, 'UNIDAD_CON_MOVIMIENTOS', 'Este insumo ya tiene movimientos: no se puede cambiar su unidad. Crea otro insumo.')
            }
            const antes = {}
            const despues = {}
            for (const campo of CAMPOS_EDITABLES) {
                if (cambios[campo] !== undefined && cambios[campo] !== insumo[campo]) {
                    antes[campo] = insumo[campo]
                    despues[campo] = cambios[campo]
                    insumo[campo] = cambios[campo]
                }
            }
            if (!Object.keys(despues).length) return formatoInsumo(insumo.toObject())
            insumo.increment() // __v: dos ediciones de la misma versión no se pisan
            await insumo.save({ session })
            await registrarEvento({
                entidad: 'insumo', entidadId: insumo._id, tipo: 'insumo_editado', usuario: sesion.id, actor: actorDe(sesion),
                datos: { nombre: insumo.nombre, antes, despues }, session,
            })
            return formatoInsumo(insumo.toObject())
        })
    } catch (error) {
        return traducirDuplicado(error, cambios.nombre)
    }
}

/** Kárdex de un insumo: los últimos movimientos, con quién y por qué. */
export const movimientosDeInsumo = async (insumoId, sesion) => {
    exigirPermiso(sesion, ...LECTURA)
    if (!mongoose.isValidObjectId(insumoId)) throw noEncontrado()
    const insumo = await Insumo.findById(insumoId).lean()
    if (!insumo) throw noEncontrado()
    const movimientos = await MovimientoInventario.find({ insumo: insumo._id })
        .sort({ createdAt: -1, _id: -1 }).limit(MAX_MOVIMIENTOS).populate('usuario', 'nombre apellido').lean()
    return {
        insumo: formatoInsumo(insumo),
        movimientos: movimientos.map((m) => ({
            id: String(m._id),
            tipo: m.tipo,
            cantidad: m.cantidad,
            existenciaDespues: m.existenciaDespues,
            costoUnitario: m.costoUnitario,
            motivo: m.motivo,
            autor: m.usuario ? [m.usuario.nombre, m.usuario.apellido].filter(Boolean).join(' ') : (m.actor === 'sistema' ? 'Sistema' : ''),
            actor: m.actor,
            referencia: { tipo: m.referencia.tipo, codigo: m.referencia.codigo || '' },
            fecha: m.createdAt,
        })),
    }
}
