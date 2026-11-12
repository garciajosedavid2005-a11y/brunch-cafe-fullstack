// 2.2 · Cocina y barra: transiciones del ítem con permiso (PLAN_FASE_2 §2.2; F2-1, F2-2, F2-7).
// La cola es una lectura de las rondas enviadas (2.3): no hay colección nueva. Cada cambio va en una
// transacción sobre su Comanda y su Cuenta, guarda quién y cuándo en el ítem y deja un Evento (entidad
// 'cuenta', tipo 'item_estado_cambiado', datos.item). La cuenta sube `versionCocina`, no `version`: la
// tablet del mesero manda `versionEsperada` al enviar o anular y no debe recibir 409 por lo que marca la
// cocina; tocar la cuenta igual serializa la operación con su cierre o una anulación.
import mongoose from 'mongoose'
import Comanda from '../salon/comanda.model.js'
import Cuenta from '../salon/cuenta.model.js'
import { AppError } from '../compartido/errors.js'
import { MAQUINA_ITEM, MAQUINA_CUENTA, ESTADOS_CUENTA_ABIERTA } from '../compartido/estadosSalon.js'
import { registrarEvento } from '../compartido/estados.service.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { resumenItem } from '../salon/cuentas.service.js'
import { validar } from '../salon/cuentas.schema.js'
import { COMODIN, tienePermiso } from '../identidad/permisos.js'
import { cambioEstadoItemSchema, todoListoSchema } from './cocina.schema.js'

// F2-7: quien marcó «listo» lo puede deshacer durante 10 s; después, solo el admin con motivo
export const VENTANA_DESHACER_MS = 10_000

const permisosDe = (sesion) => sesion?.permisos || []
const itemNoEncontrado = () => new AppError(404, 'ITEM_NO_ENCONTRADO', 'El ítem no existe.')
const PERMISO_DESTINO = { en_preparacion: 'item:preparar', listo: 'item:preparar', servido: 'item:servir' }
const exigir = (sesion, clave) => {
    if (!tienePermiso(permisosDe(sesion), clave)) {
        throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: [clave] })
    }
}

/** La cuenta sigue abierta o con la cuenta pedida: sube su versionCocina (si no, 409 o 404). */
const tocarCuentaCocina = async (cuentaId, session) => {
    const cuenta = await Cuenta.findOneAndUpdate(
        { _id: cuentaId, estado: { $in: ESTADOS_CUENTA_ABIERTA } },
        { $inc: { versionCocina: 1 } },
        { returnDocument: 'after', session },
    )
    if (cuenta) return cuenta
    const actual = await Cuenta.findById(cuentaId).select('estado').session(session).lean()
    if (!actual) throw new AppError(404, 'CUENTA_NO_ENCONTRADA', 'La cuenta no existe.')
    if (MAQUINA_CUENTA.esFinal(actual.estado)) {
        throw new AppError(409, 'ESTADO_FINAL', 'La cuenta ya está cerrada y no admite cambios.', { estado: actual.estado })
    }
    throw new AppError(409, 'CUENTA_NO_EDITABLE', `La cuenta está «${actual.estado}».`, { estado: actual.estado })
}
const resumenCuenta = (cuenta) => ({ id: String(cuenta._id), versionCocina: cuenta.versionCocina })
// Qué momento guarda cada destino (iniciadoEn/Por, listoEn/Por, servidoEn/Por)
const MOMENTO = { en_preparacion: 'iniciado', listo: 'listo', servido: 'servido' }

export const formatoItem = (item) => ({
    id: String(item._id),
    estado: item.estado,
    estacion: item.estacion?.codigo ?? null,
    iniciadoEn: item.iniciadoEn ?? null,
    listoEn: item.listoEn ?? null,
    listoPor: item.listoPor ? String(item.listoPor) : null,
    servidoEn: item.servidoEn ?? null,
})

const marcar = (item, a, sesion, ahora) => {
    item[`${MOMENTO[a]}En`] = ahora
    item[`${MOMENTO[a]}Por`] = sesion.id
    item.estado = a
}

// `foto`: resumen del ítem en ese paso (en «Todo listo» cada Evento guarda el suyo)
const eventoItem = (cuenta, comanda, foto, { de, a, motivo = '', sesion, session }) => registrarEvento({
    entidad: 'cuenta', entidadId: cuenta._id, tipo: 'item_estado_cambiado', de, a, motivo,
    usuario: sesion.id, actor: sesion.rol || 'staff',
    datos: { comanda: comanda._id, numeroRonda: comanda.numeroRonda, item: foto }, session,
})

/** «Deshacer» de listo: quien lo marcó en los 10 s siguientes o, después, el admin con motivo (F2-7). */
const motivoDeshacer = (item, sesion, motivo, ahora) => {
    const propio = String(item.listoPor) === String(sesion.id) && ahora.getTime() - new Date(item.listoEn).getTime() <= VENTANA_DESHACER_MS
    if (propio) return motivo || ''
    if (!permisosDe(sesion).includes(COMODIN)) {
        throw new AppError(403, 'DESHACER_NO_PERMITIDO',
            'Solo quien lo marcó puede deshacerlo en los 10 segundos siguientes; después, un administrador con motivo.')
    }
    if (!motivo) throw new AppError(400, 'MOTIVO_REQUERIDO', 'Indica el motivo para deshacer «listo».')
    return motivo
}

/**
 * Cambia el estado de un ítem enviado: en_preparacion o listo (item:preparar), servido (item:servir) o
 * el «Deshacer» listo → en_preparacion. `de` (obligatorio) es el estado que vio la pantalla: si otro ya lo
 * movió → 409 ITEM_MODIFICADO. Dos tablets a la vez: la transacción que pierde se reintenta, vuelve a
 * leer y termina en 409.
 */
export const cambiarEstadoItem = async (itemId, datos, sesion) => {
    const { a, de, motivo } = validar(cambioEstadoItemSchema, datos)
    // Permiso del destino antes de leer nada: sin él no se sabe ni el estado del ítem
    exigir(sesion, PERMISO_DESTINO[a])
    const esDeshacer = de === 'listo' && a === 'en_preparacion'
    if (motivo && !esDeshacer) throw new AppError(400, 'MOTIVO_NO_APLICA', 'El motivo solo se indica al deshacer «listo».')
    if (!mongoose.isValidObjectId(itemId)) throw itemNoEncontrado()

    return conTransaccion(async (session) => {
        const comanda = await Comanda.findOne({ 'items._id': itemId }).session(session)
        if (!comanda) throw itemNoEncontrado()
        const item = comanda.items.id(itemId)
        if (item.estado !== de) {
            throw new AppError(409, 'ITEM_MODIFICADO', 'Otra persona ya cambió este ítem: recarga la pantalla.', { estado: item.estado })
        }
        const actual = item.estado
        MAQUINA_ITEM.validar(actual, a, { permisos: permisosDe(sesion) })
        const cuenta = await tocarCuentaCocina(comanda.cuenta, session)
        const ahora = new Date()
        let texto = ''
        if (actual === 'listo' && a === 'en_preparacion') {
            texto = motivoDeshacer(item, sesion, motivo, ahora)
            item.listoEn = null
            item.listoPor = null
            item.estado = a
        } else {
            marcar(item, a, sesion, ahora)
        }
        await comanda.save({ session })
        await eventoItem(cuenta, comanda, resumenItem(item), { de: actual, a, motivo: texto, sesion, session })
        return { item: formatoItem(item), cuenta: resumenCuenta(cuenta) }
    })
}

/**
 * «Todo listo» (F2-1): pasa a listo los ítems pendientes de una ronda enviada en una estación,
 * pasando por en_preparacion en la misma transacción (se guardan los dos tiempos y sus Eventos).
 */
export const todoListo = async (comandaId, datos, sesion) => {
    const { estacion } = validar(todoListoSchema, datos)
    exigir(sesion, 'item:preparar')
    if (!mongoose.isValidObjectId(comandaId)) throw new AppError(404, 'RONDA_NO_ENCONTRADA', 'La ronda no existe.')

    return conTransaccion(async (session) => {
        const comanda = await Comanda.findById(comandaId).session(session)
        if (!comanda || comanda.estado !== 'enviada') throw new AppError(404, 'RONDA_NO_ENCONTRADA', 'La ronda no existe o no se ha enviado.')
        const pendientes = comanda.items.filter((i) => i.estacion?.codigo === estacion && ['enviado', 'en_preparacion'].includes(i.estado))
        if (!pendientes.length) {
            throw new AppError(409, 'NADA_PENDIENTE', 'No hay ítems pendientes de esta estación en la ronda.', { estacion })
        }
        const cuenta = await tocarCuentaCocina(comanda.cuenta, session)
        const ahora = new Date()
        const pasos = []
        for (const item of pendientes) {
            for (const a of item.estado === 'enviado' ? ['en_preparacion', 'listo'] : ['listo']) {
                const de = item.estado
                MAQUINA_ITEM.validar(de, a, { permisos: permisosDe(sesion) })
                marcar(item, a, sesion, ahora)
                pasos.push({ foto: resumenItem(item), de, a })
            }
        }
        await comanda.save({ session })
        for (const { foto, de, a } of pasos) await eventoItem(cuenta, comanda, foto, { de, a, sesion, session })
        return { items: pendientes.map(formatoItem), cuenta: resumenCuenta(cuenta) }
    })
}
