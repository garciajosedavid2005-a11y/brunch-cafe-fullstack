// Horarios del café en BD (0.8, decisión 15). Se siembran al arrancar y con `npm run seed:base`;
// las peticiones solo leen (no crean la configuración si falta).
import Configuracion from './configuracion.model.js'
import { AppError } from '../compartido/errors.js'
import { registrarEvento } from '../compartido/estados.service.js'
import { conTransaccion } from '../compartido/transacciones.js'

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

/** Crea los horarios por defecto si no existen. No modifica los editados. Idempotente. */
export const sembrarHorarios = async () => {
    const res = await Configuracion.updateOne(
        { clave: CLAVE_HORARIOS },
        { $setOnInsert: { clave: CLAVE_HORARIOS, ...HORARIOS_POR_DEFECTO } },
        { upsert: true },
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

/** Para el admin: los horarios y quién/cuándo los cambió por última vez. */
export const obtenerHorariosAdmin = async () => {
    const doc = await leer()
    return { horarios: aHorarios(doc), actualizadoEn: doc.updatedAt, actualizadoPor: doc.actualizadoPor }
}

// Rutas de los campos que cambian entre dos horarios («domicilio.hasta»); todos los valores son hojas
const camposCambiados = (antes, despues, prefijo = '') => Object.keys(despues).flatMap((clave) => {
    const ruta = `${prefijo}${clave}`
    if (despues[clave] !== null && typeof despues[clave] === 'object') {
        return camposCambiados(antes?.[clave] ?? {}, despues[clave], `${ruta}.`)
    }
    return antes?.[clave] === despues[clave] ? [] : [ruta]
})

/**
 * `datos` ya validados con horariosSchema. 1.14 · El cambio y su Evento (quién, cuándo, antes,
 * después y qué campos) van en una transacción: o quedan los dos o ninguno. Si un cambio concurrente
 * escribe entre la lectura y la escritura, la transacción se reintenta y el «antes» vuelve a leerse.
 * Guardar sin cambios no escribe nada: ni Evento ni «actualizado por».
 * Si la configuración no existe (sin seed), el PUT la crea, como antes de 1.14, con «antes» null.
 */
export const actualizarHorarios = async (datos, sesion) => {
    const doc = await conTransaccion(async (session) => {
        const anterior = await Configuracion.findOne({ clave: CLAVE_HORARIOS }).session(session).lean()
        const antes = anterior ? aHorarios(anterior) : null
        const cambios = camposCambiados(antes, aHorarios(datos))
        if (anterior && !cambios.length) return anterior
        const actualizado = await Configuracion.findOneAndUpdate(
            { clave: CLAVE_HORARIOS },
            { $set: { ...datos, actualizadoPor: sesion.id } },
            { returnDocument: 'after', runValidators: true, upsert: true, setDefaultsOnInsert: true, session },
        ).lean()
        await registrarEvento({
            entidad: 'configuracion', entidadId: actualizado._id, tipo: 'horarios_cambiados',
            usuario: sesion.id, actor: sesion.rol || 'staff', datos: { antes, despues: aHorarios(actualizado), cambios }, session,
        })
        return actualizado
    })
    return { horarios: aHorarios(doc), actualizadoEn: doc.updatedAt, actualizadoPor: doc.actualizadoPor }
}
