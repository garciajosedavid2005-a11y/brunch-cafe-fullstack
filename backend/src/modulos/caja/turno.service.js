import { z } from 'zod'
import TurnoCaja, { codigoTurno } from './turno.model.js'
import Comprobante, { METODOS_PAGO_CAJA } from './comprobante.model.js'
import Contador from '../compartido/contador.model.js'
import Usuario from '../identidad/usuario.model.js'
import { AppError } from '../compartido/errors.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { registrarEvento } from '../compartido/estados.service.js'
import { tienePermiso } from '../identidad/permisos.js'
import { nombreCorto, CAMPOS_NOMBRE } from '../compartido/nombres.js'

// Fase 3b · Turno de caja (PLAN_FASE_3B, F3b-1 y F3b-2). Una sola caja: abrir con base, cobrar dentro del
// turno abierto y cerrar con el arqueo por método (contado frente a esperado).
const CONTADOR = 'turno'
const MAXIMO = 100_000_000
const MAX_HISTORIAL = 30

const enteroCOP = (campo) => z.number({ error: `${campo} debe ser un número` })
    .int({ error: `${campo} debe ser un entero en COP` })
    .min(0, { error: `${campo} no puede ser negativo` })
    .max(MAXIMO, { error: `${campo} es demasiado alto` })

export const abrirTurnoSchema = z.strictObject({ base: enteroCOP('La base') }, { error: 'Solo se acepta la base' })
export const cerrarTurnoSchema = z.strictObject({
    contado: z.strictObject(Object.fromEntries(METODOS_PAGO_CAJA.map((m) => [m, enteroCOP(`Lo contado en ${m}`)])),
        { error: 'Indica lo contado en efectivo, tarjeta y transferencia' }),
    nota: z.string({ error: 'La nota debe ser texto' }).trim().max(300, { error: 'La nota admite hasta 300 caracteres' }).optional(),
}, { error: 'Solo se aceptan lo contado y una nota' })

const validar = (schema, datos) => {
    const r = schema.safeParse(datos ?? {})
    if (!r.success) {
        throw new AppError(400, 'VALIDATION_ERROR', r.error.issues[0]?.message || 'Datos no válidos',
            r.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })))
    }
    return r.data
}

const exigir = (sesion, ...claves) => {
    if (!claves.some((c) => tienePermiso(sesion?.permisos || [], c))) {
        throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: claves })
    }
}

const personaDe = async (sesion, session) => {
    const u = await Usuario.findById(sesion.id).select(CAMPOS_NOMBRE).session(session ?? null).lean()
    return { id: sesion.id, nombre: nombreCorto(u) }
}

const quien = (sesion) => ({ usuario: sesion.id, actor: sesion.rol || 'staff' })

/** Lo cobrado y lo devuelto en el turno, por método (montos aplicados: el cambio ya salió de la caja). */
export const movimientosDelTurno = async (turnoId, session) => {
    const porMetodo = (filas) => new Map(filas.map((f) => [f._id, f.total]))
    const sumar = (Modelo) => Modelo.aggregate([
        { $match: { turno: turnoId } },
        { $unwind: '$pagos' },
        { $group: { _id: '$pagos.metodo', total: { $sum: '$pagos.monto' } } },
    ]).session(session ?? null)
    // 3b.3 · las notas crédito del turno se restan como devuelto
    // En secuencia: dentro de una transacción no se lanzan operaciones en paralelo con la misma sesión
    const cobrado = await sumar(Comprobante)
    const cobros = await Comprobante.countDocuments({ turno: turnoId }).session(session ?? null)
    const devuelto = []
    return { cobrado: porMetodo(cobrado), devuelto: porMetodo(devuelto), cobros }
}

/** Esperado por método: efectivo = base + cobrado − devuelto; tarjeta y transferencia = cobrado − devuelto. */
export const esperadoDe = (turno, { cobrado, devuelto }) => METODOS_PAGO_CAJA.map((metodo) => ({
    metodo,
    cobrado: cobrado.get(metodo) || 0,
    devuelto: devuelto.get(metodo) || 0,
    esperado: (metodo === 'efectivo' ? turno.base : 0) + (cobrado.get(metodo) || 0) - (devuelto.get(metodo) || 0),
}))

const formato = (turno, movimientos) => ({
    id: String(turno._id),
    codigo: turno.codigo,
    estado: turno.estado,
    base: turno.base,
    abiertoPor: turno.abiertoPor?.nombre || '',
    abiertoEn: turno.abiertoEn,
    cerradoPor: turno.cerradoPor?.nombre || '',
    cerradoEn: turno.cerradoEn,
    nota: turno.nota || '',
    ...(movimientos ? { cobros: movimientos.cobros, esperado: esperadoDe(turno, movimientos) } : {}),
    arqueo: (turno.arqueo || []).map(({ metodo, esperado, contado, diferencia }) => ({ metodo, esperado, contado, diferencia })),
})

/** GET /staff/caja/turno: el turno abierto (con lo esperado hasta ahora) o null. */
export const turnoActual = async (sesion) => {
    exigir(sesion, 'cuenta:cobrar', 'caja:abrir', 'caja:cerrar')
    const turno = await TurnoCaja.findOne({ estado: 'abierto' }).lean()
    if (!turno) return { turno: null }
    // El esperado (lo que debería haber en la caja) solo lo ve quien la cierra
    const verCuadre = tienePermiso(sesion.permisos, 'caja:cerrar')
    return { turno: formato(turno, verCuadre ? await movimientosDelTurno(turno._id) : null) }
}

/** GET /staff/caja/turnos: los últimos turnos (cerrados con su arqueo). */
export const historialTurnos = async (sesion) => {
    exigir(sesion, 'caja:cerrar')
    const turnos = await TurnoCaja.find().sort({ abiertoEn: -1 }).limit(MAX_HISTORIAL).lean()
    return { turnos: turnos.map((t) => formato(t)) }
}

export const asegurarContadorTurno = async () => {
    try {
        await Contador.updateOne({ _id: CONTADOR }, { $setOnInsert: { seq: 0 } }, { upsert: true })
    } catch (error) {
        if (error?.code !== 11000) throw error
    }
}

const yaAbierto = () => new AppError(409, 'TURNO_YA_ABIERTO', 'Ya hay un turno de caja abierto: ciérralo antes de abrir otro.')

/** POST /staff/caja/turno/abrir { base } */
export const abrirTurno = async (datos, sesion) => {
    exigir(sesion, 'caja:abrir')
    const { base } = validar(abrirTurnoSchema, datos)
    await asegurarContadorTurno()
    try {
        return await conTransaccion(async (session) => {
            if (await TurnoCaja.exists({ estado: 'abierto' }).session(session)) throw yaAbierto()
            const { seq: numero } = await Contador.findOneAndUpdate({ _id: CONTADOR }, { $inc: { seq: 1 } }, { returnDocument: 'after', upsert: true, session })
            const [turno] = await TurnoCaja.create([{
                numero, codigo: codigoTurno(numero), base, abiertoPor: await personaDe(sesion, session), abiertoEn: new Date(),
            }], { session })
            await registrarEvento({ entidad: 'turno', entidadId: turno._id, tipo: 'turno_abierto', ...quien(sesion), datos: { codigo: turno.codigo, base }, session })
            return { turno: formato(turno.toObject(), { cobrado: new Map(), devuelto: new Map(), cobros: 0 }) }
        })
    } catch (error) {
        // Dos aperturas a la vez: el índice único del turno abierto deja una (otro duplicado se relanza)
        if (error?.code === 11000 && error?.keyPattern?.estado) throw yaAbierto()
        throw error
    }
}

/** POST /staff/caja/turno/cerrar { contado: { efectivo, tarjeta, transferencia }, nota? } */
export const cerrarTurno = async (datos, sesion) => {
    exigir(sesion, 'caja:cerrar')
    const { contado, nota } = validar(cerrarTurnoSchema, datos)
    return conTransaccion(async (session) => {
        const turno = await TurnoCaja.findOne({ estado: 'abierto' }).session(session)
        if (!turno) throw new AppError(409, 'TURNO_CERRADO', 'No hay un turno de caja abierto.')
        const movimientos = await movimientosDelTurno(turno._id, session)
        turno.arqueo = esperadoDe(turno, movimientos).map(({ metodo, esperado }) => ({
            metodo, esperado, contado: contado[metodo], diferencia: contado[metodo] - esperado,
        }))
        turno.estado = 'cerrado'
        turno.cerradoPor = await personaDe(sesion, session)
        turno.cerradoEn = new Date()
        turno.nota = nota || ''
        turno.version += 1
        await turno.save({ session }) // escribe el turno: un cobro simultáneo choca y se reintenta
        await registrarEvento({
            entidad: 'turno', entidadId: turno._id, tipo: 'turno_cerrado', ...quien(sesion), motivo: turno.nota,
            datos: { codigo: turno.codigo, arqueo: turno.arqueo.map(({ metodo, esperado, contado: c, diferencia }) => ({ metodo, esperado, contado: c, diferencia })) },
            session,
        })
        return { turno: formato(turno.toObject(), movimientos) }
    })
}

/**
 * Dentro de la transacción de un cobro: el turno abierto (o 409 TURNO_CERRADO). Lo «toca» ($inc version)
 * para chocar con un cierre simultáneo.
 */
export const tomarTurnoAbierto = async (session) => {
    const turno = await TurnoCaja.findOneAndUpdate({ estado: 'abierto' }, { $inc: { version: 1 } }, { returnDocument: 'after', session }).lean()
    if (!turno) throw new AppError(409, 'TURNO_CERRADO', 'No hay un turno de caja abierto: ábrelo para cobrar.')
    return turno
}
