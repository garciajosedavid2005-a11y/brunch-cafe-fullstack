// Horarios del café en BD (0.8, decisión 15). Se siembran al arrancar y con `npm run seed:base`;
// las peticiones solo leen (no crean la configuración si falta).
import Configuracion from './configuracion.model.js'
import { AppError } from '../compartido/errors.js'
import { registrarEvento } from '../compartido/estados.service.js'
import { conTransaccion } from '../compartido/transacciones.js'
import Evento from '../compartido/evento.model.js'

export const CLAVE_HORARIOS = 'horarios'

export const HORARIOS_POR_DEFECTO = {
    domicilio: { desde: '08:00', hasta: '16:00', anticipacionMinutos: 60 },
    reservas: {
        entreSemana: { desde: '08:00', hasta: '19:00' },
        finDeSemana: { desde: '08:00', hasta: '17:00' },
    },
}

// Solo los campos del contrato (sin _id, clave ni marcas de tiempo)
const aHorarios = (doc) => ({
    domicilio: {
        desde: doc.domicilio.desde,
        hasta: doc.domicilio.hasta,
        anticipacionMinutos: doc.domicilio.anticipacionMinutos,
    },
    reservas: {
        entreSemana: { desde: doc.reservas.entreSemana.desde, hasta: doc.reservas.entreSemana.hasta },
        finDeSemana: { desde: doc.reservas.finDeSemana.desde, hasta: doc.reservas.finDeSemana.hasta },
    },
})

/**
 * Crea los horarios por defecto si no existen. No modifica los editados. Idempotente.
 * 1.15 · Sin marcas de tiempo automáticas: con un documento existente no escribe nada (antes, cada
 * arranque del servidor movía `updatedAt` y «Última modificación» mostraba la hora del arranque).
 */
export const sembrarHorarios = async () => {
    const ahora = new Date()
    const res = await Configuracion.updateOne(
        { clave: CLAVE_HORARIOS },
        { $setOnInsert: { clave: CLAVE_HORARIOS, ...HORARIOS_POR_DEFECTO, version: 0, modificadoEn: null, createdAt: ahora, updatedAt: ahora } },
        { upsert: true, timestamps: false },
    )
    return { creado: res.upsertedCount > 0 }
}

const leer = async () => {
    const doc = await Configuracion.findOne({ clave: CLAVE_HORARIOS }).lean()
    if (!doc) {
        throw new AppError(503, 'CONFIG_PENDIENTE', 'Los horarios del café no están configurados. Ejecuta `npm run seed:base`.')
    }
    return doc
}

export const obtenerHorarios = async () => aHorarios(await leer())

// Fecha del último cambio real: `modificadoEn` (desde 1.15) o, para los guardados de 1.14, el último
// Evento del cambio; null si nunca se cambiaron
const ultimoCambio = async (doc) => {
    if (doc.modificadoEn) return doc.modificadoEn
    const evento = await Evento.findOne({ entidad: 'configuracion', entidadId: doc._id, tipo: 'horarios_cambiados' })
        .sort({ createdAt: -1 }).select('createdAt').lean()
    return evento?.createdAt ?? null
}

// Quién y cuándo van juntos: sin fecha de un cambio real (p. ej. editados entre 0.8 y 1.13, sin Evento
// ni modificadoEn) tampoco se informa quién
const respuestaAdmin = async (doc) => {
    const actualizadoEn = await ultimoCambio(doc)
    return {
        horarios: aHorarios(doc),
        version: doc.version ?? 0,
        actualizadoEn,
        actualizadoPor: actualizadoEn ? doc.actualizadoPor ?? null : null,
    }
}

/** Para el admin: los horarios, su versión y quién/cuándo los cambió de verdad por última vez. */
export const obtenerHorariosAdmin = async () => respuestaAdmin(await leer())

// Rutas de los campos que cambian entre dos horarios («domicilio.hasta»); todos los valores son hojas
const camposCambiados = (antes, despues, prefijo = '') => Object.keys(despues).flatMap((clave) => {
    const ruta = `${prefijo}${clave}`
    if (despues[clave] !== null && typeof despues[clave] === 'object') {
        return camposCambiados(antes?.[clave] ?? {}, despues[clave], `${ruta}.`)
    }
    return antes?.[clave] === despues[clave] ? [] : [ruta]
})

const versionReal = async (session) => {
    const actual = await Configuracion.findOne({ clave: CLAVE_HORARIOS }).select('version').session(session).lean()
    return actual?.version ?? 0
}

const horariosModificados = (version) => new AppError(
    409, 'HORARIOS_MODIFICADOS', 'Otro usuario cambió los horarios; recarga para ver los cambios.', { version },
)

/**
 * `datos` ya validados con horariosSchema (con `versionEsperada`). 1.14 · El cambio y su Evento (quién,
 * cuándo, antes, después y qué campos) van en una transacción: o quedan los dos o ninguno.
 * 1.15 · Control de versión como las cuentas: si la versión no es la que leyó el admin → 409
 * HORARIOS_MODIFICADOS; la escritura es condicional sobre la versión (si otro escribe en medio, la
 * transacción se reintenta y vuelve a comprobarla). Cada cambio real sube la versión y fija `modificadoEn`.
 * Guardar sin cambios no escribe nada: ni Evento, ni «actualizado por», ni versión.
 * Si la configuración no existe (sin seed), el PUT la crea con «antes» null (versión esperada 0).
 */
export const actualizarHorarios = async ({ versionEsperada, ...datos }, sesion) => {
    const doc = await conTransaccion(async (session) => {
        const anterior = await Configuracion.findOne({ clave: CLAVE_HORARIOS }).session(session).lean()
        const versionActual = anterior?.version ?? 0
        if (versionEsperada !== versionActual) throw horariosModificados(versionActual)
        const antes = anterior ? aHorarios(anterior) : null
        const cambios = camposCambiados(antes, aHorarios(datos))
        if (anterior && !cambios.length) return anterior
        // Sin el campo o en null (documentos anteriores a 1.15) la versión es 0: $in con null cubre los dos
        const filtroVersion = { version: versionActual === 0 ? { $in: [0, null] } : versionActual }
        let actualizado
        try {
            actualizado = await Configuracion.findOneAndUpdate(
                { clave: CLAVE_HORARIOS, ...(anterior ? filtroVersion : {}) },
                { $set: { ...datos, actualizadoPor: sesion.id, modificadoEn: new Date(), version: versionActual + 1 } },
                { returnDocument: 'after', runValidators: true, upsert: !anterior, setDefaultsOnInsert: true, session },
            ).lean()
        } catch (error) {
            // Dos PUT crean a la vez la configuración inexistente: el segundo choca con la clave única
            if (error?.code === 11000) throw horariosModificados(await versionReal(session))
            throw error
        }
        // La escritura condicional no encontró la versión leída: otro la cambió entre medias
        if (!actualizado) throw horariosModificados(await versionReal(session))
        await registrarEvento({
            entidad: 'configuracion', entidadId: actualizado._id, tipo: 'horarios_cambiados',
            usuario: sesion.id, actor: sesion.rol || 'staff', datos: { antes, despues: aHorarios(actualizado), cambios }, session,
        })
        return actualizado
    })
    return respuestaAdmin(doc)
}
