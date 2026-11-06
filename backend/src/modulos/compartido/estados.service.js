// Aplica la máquina de transiciones (src/modulos/compartido/estados.js) sobre pedidos y reservas
// y deja cada cambio en la bitácora Evento.
import mongoose from 'mongoose'
import Estado from './estado.model.js'
import Evento from './evento.model.js'
import { AppError } from './errors.js'
import { conTransaccion } from './transacciones.js'
import { validarTransicion, transicionesDisponibles, definicionEstado } from './estados.js'

const catalogoIncompleto = (tipo, codigo) =>
    new AppError(500, 'INTERNAL_ERROR', `Falta el estado ${tipo}.${codigo} en la BD (revisa el seed de estados).`)

/** Estado de la BD por código; el seed garantiza que existe. */
export const estadoPorCodigo = async (tipo, codigo) => {
    const estado = await Estado.findOne({ tipo, codigo })
    if (!estado) throw catalogoIncompleto(tipo, codigo)
    return estado
}

/** Mapa codigo → documento Estado de un tipo (para serializar listas). */
export const estadosDelTipo = async (tipo) => {
    const lista = await Estado.find({ tipo }).lean()
    return new Map(lista.map((estado) => [estado.codigo, estado]))
}

/**
 * Código de destino a partir del body: acepta `codigo` o (compatibilidad con el
 * dashboard actual) `estado` con el _id del Estado.
 */
export const codigoDestino = async (tipo, { codigo, estado } = {}) => {
    if (typeof codigo === 'string' && codigo.trim()) return codigo.trim()
    if (mongoose.isValidObjectId(estado)) {
        const encontrado = await Estado.findOne({ _id: estado, tipo }).select('codigo').lean()
        if (encontrado?.codigo) return encontrado.codigo
    }
    throw new AppError(400, 'ESTADO_INVALIDO', `El estado enviado no existe o no es de tipo ${tipo}.`)
}

/** Código del estado actual de un documento (con `estado` poblado o como id). */
export const codigoActual = async (documento) => {
    if (documento.estado?.codigo) return documento.estado.codigo
    const estado = await Estado.findById(documento.estado?._id || documento.estado).select('codigo').lean()
    if (!estado?.codigo) throw new AppError(500, 'INTERNAL_ERROR', 'El documento tiene un estado sin código.')
    return estado.codigo
}

/** Agrega un registro a la bitácora. Con `session`, dentro de la transacción de quien llama. */
export const registrarEvento = async ({ entidad, entidadId, de = null, a, motivo = '', usuario = null, actor, datos, session }) => {
    const [evento] = await Evento.create([{ entidad, entidadId, de, a, motivo, usuario, actor, datos }], { session })
    return evento
}

/**
 * Cambia el estado de `documento` (pedido o reserva) a `a`.
 * - Valida la transición, el permiso y el motivo.
 * - Actualiza de forma condicional (si otro cambio llegó antes → 409 CONFLICTO_ESTADO).
 * - `cambios` permite guardar otros campos en la misma escritura (p. ej. editar una reserva).
 * - Registra el Evento con el usuario y su rol como actor.
 * - Cambio y Evento van en una transacción (0.9): o quedan los dos o ninguno.
 */
export const cambiarEstado = async ({
    tipo, Modelo, documento, a, actor = 'staff', sesion, motivo, contexto, cambios = {}, filtro = {},
}) => {
    const de = await codigoActual(documento)
    const { motivo: motivoFinal } = validarTransicion(tipo, de, a, {
        actor, permisos: sesion?.permisos || [], motivo, contexto,
    })
    const [actual, destino] = await Promise.all([estadoPorCodigo(tipo, de), estadoPorCodigo(tipo, a)])

    return conTransaccion(async (session) => {
        const actualizado = await Modelo.findOneAndUpdate(
            { _id: documento._id, estado: actual._id, ...filtro },
            { $set: { ...cambios, estado: destino._id } },
            { returnDocument: 'after', runValidators: true, session }
        )
        if (!actualizado) {
            throw new AppError(409, 'CONFLICTO_ESTADO', 'El estado cambió mientras lo editabas. Recarga e intenta de nuevo.')
        }
        await registrarEvento({
            entidad: tipo,
            entidadId: documento._id,
            de,
            a,
            motivo: motivoFinal,
            usuario: sesion?.id || null,
            actor: sesion?.rol || actor,
            session,
        })
        return actualizado
    })
}

/** Opciones de cambio que el dashboard puede ofrecer para un documento. */
export const opcionesDeCambio = (tipo, codigo, { permisos, contexto }, estados) =>
    transicionesDisponibles(tipo, codigo, { actor: 'staff', permisos, contexto }).map((t) => {
        const estado = estados.get(t.a)
        return {
            codigo: t.a,
            estadoId: estado?._id || null,
            nombre: estado?.nombre || definicionEstado(tipo, t.a)?.nombre || t.a,
            requiereMotivo: Boolean(t.requiereMotivo),
            permiso: t.permiso,
        }
    })
