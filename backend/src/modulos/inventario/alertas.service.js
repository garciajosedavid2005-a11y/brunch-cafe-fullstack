// Fase 5 · 5.5 (F5-6) · Alertas del inventario: stock bajo (existencia ≤ mínimo, insumos activos) y vencimiento
// próximo (lotes que vencen en los próximos 7 días o ya vencidos y que, según la existencia, aún tienen algo).
// F5-g · Lo que queda de cada lote se estima repartiendo la existencia actual desde la recepción más reciente
// (primero en entrar, primero en salir): no se escribe nada al enviar rondas.
import mongoose from 'mongoose'
import { z } from 'zod'
import Insumo from './insumo.model.js'
import { Lote } from './compras.model.js'
import { AppError } from '../compartido/errors.js'
import { registrarEvento } from '../compartido/estados.service.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { fechaLocal } from '../compartido/fechas.js'
import { validar } from '../salon/cuentas.schema.js'
import { redondear } from './cantidades.js'
import { motivoObligatorio } from './inventario.schema.js'
import { exigirPermiso, nivelExistencia } from './insumos.service.js'
import { aplicarMovimientos, actorDe } from './movimientos.service.js'
import { revisarDisponibilidad, avisarCambiosDisponibilidad } from './consumo.service.js'

export const DIAS_AVISO_VENCIMIENTO = 7
const LECTURA = ['inventario:ver', 'inventario:gestionar', 'inventario:ajustar', 'compra:gestionar', 'compra:recibir']

/** "AAAA-MM-DD" + n días (calendario). */
const sumarDias = (fecha, n) => {
    const d = new Date(`${fecha}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
}

/** Lo que queda de cada lote no descartado de esos insumos: Map loteId → cantidad estimada. */
export const restantesDeLotes = async (insumoIds, session = null) => {
    const [lotes, insumos] = await Promise.all([
        Lote.find({ insumo: { $in: insumoIds }, descartado: false }).sort({ createdAt: -1, _id: -1 }).session(session).lean(),
        Insumo.find({ _id: { $in: insumoIds } }).select('existencia').session(session).lean(),
    ])
    const disponible = new Map(insumos.map((i) => [String(i._id), Math.max(i.existencia, 0)]))
    const restantes = new Map()
    for (const lote of lotes) {
        const clave = String(lote.insumo)
        const queda = disponible.get(clave) || 0
        const asignado = redondear(Math.min(queda, lote.cantidad))
        restantes.set(String(lote._id), asignado)
        disponible.set(clave, redondear(queda - asignado))
    }
    return restantes
}

export const listarAlertas = async (sesion, ahora = new Date()) => {
    exigirPermiso(sesion, ...LECTURA)
    const hoy = fechaLocal(ahora)
    const limite = sumarDias(hoy, DIAS_AVISO_VENCIMIENTO)
    const [bajos, proximos] = await Promise.all([
        // 5.8.6 · Los negativos primero ANTES del límite (ninguno se queda fuera por su nombre)
        Insumo.aggregate([
            { $match: { activo: true, $expr: { $lte: ['$existencia', '$minimo'] } } },
            { $addFields: { negativo: { $lt: ['$existencia', 0] } } },
            { $sort: { negativo: -1, nombre: 1 } },
            { $limit: 200 },
        ]),
        // Sin límite antes de filtrar: los lotes ya consumidos (restante 0) no deben ocupar el cupo de los reales
        Lote.find({ descartado: false, vencimiento: { $lte: limite } }).sort({ vencimiento: 1 }).populate('insumo', 'nombre unidad').lean(),
    ])
    const restantes = await restantesDeLotes([...new Set(proximos.map((l) => String(l.insumo?._id)))])
    return {
        hoy,
        // 5.8.6 · Las existencias negativas van primero (nivel «negativo»)
        stockBajo: bajos.map((i) => ({
            id: String(i._id), nombre: i.nombre, unidad: i.unidad, existencia: i.existencia, minimo: i.minimo,
            nivel: nivelExistencia(i),
        })),
        vencimientos: proximos
            .map((l) => ({
                id: String(l._id), insumoId: String(l.insumo?._id), insumo: l.insumo?.nombre || '', unidad: l.insumo?.unidad || '',
                vencimiento: l.vencimiento, vencido: l.vencimiento < hoy, ordenCodigo: l.ordenCodigo,
                recibido: l.cantidad, restante: restantes.get(String(l._id)) ?? 0,
            }))
            .filter((l) => l.restante > 0)
            .slice(0, 200),
    }
}

export const descartarLoteSchema = z.strictObject({ motivo: motivoObligatorio })

/**
 * Registra el vencimiento de lo que queda de un lote (movimiento «vencimiento», con motivo) y lo marca descartado
 * (ya no alerta). Escritura condicional sobre el lote: dos descartes a la vez → el segundo recibe 409.
 */
export const descartarLote = async (loteId, datos, sesion) => {
    exigirPermiso(sesion, 'inventario:ajustar')
    const { motivo } = validar(descartarLoteSchema, datos)
    const noExiste = () => new AppError(404, 'LOTE_NO_ENCONTRADO', 'El lote no existe.')
    if (!mongoose.isValidObjectId(loteId)) throw noExiste()
    let cambios = []
    const resultado = await conTransaccion(async (session) => {
        cambios = []
        const previo = await Lote.findById(loteId).select('insumo').session(session).lean()
        if (!previo) throw noExiste()
        // Lo que queda se estima ANTES de marcarlo (un lote descartado ya no entra en el reparto)
        const restante = (await restantesDeLotes([previo.insumo], session)).get(String(loteId)) ?? 0
        const lote = await Lote.findOneAndUpdate({ _id: loteId, descartado: false }, { $set: { descartado: true, descartadoEn: new Date() } }, { session }).lean()
        if (!lote) throw new AppError(409, 'LOTE_YA_DESCARTADO', 'Ese lote ya se descartó.')
        let movimiento = null
        if (restante > 0) {
            ;[movimiento] = await aplicarMovimientos([{ insumo: lote.insumo, cantidad: -restante, tipo: 'vencimiento' }], {
                motivo, sesion, session, referencia: { tipo: 'manual', id: lote._id, codigo: lote.ordenCodigo },
            })
            cambios = await revisarDisponibilidad([String(lote.insumo)], sesion, session)
        }
        await registrarEvento({
            entidad: 'insumo', entidadId: lote.insumo, tipo: 'inventario_ajustado', usuario: sesion.id, actor: actorDe(sesion), motivo,
            datos: { tipo: 'vencimiento', lote: lote._id, vencimiento: lote.vencimiento, cantidad: movimiento?.cantidad ?? 0, existencia: movimiento?.existenciaDespues }, session,
        })
        return { lote: String(lote._id), descartado: redondear(restante), existencia: movimiento?.existenciaDespues ?? null }
    })
    avisarCambiosDisponibilidad(cambios)
    return resultado
}
