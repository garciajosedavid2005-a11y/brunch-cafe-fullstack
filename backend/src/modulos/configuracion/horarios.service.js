// Horarios del café en BD (0.8, decisión 15). Se siembran al arrancar y con `npm run seed:base`;
// las peticiones solo leen (no crean la configuración si falta).
import Configuracion from './configuracion.model.js'
import { AppError } from '../compartido/errors.js'

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

/** `datos` ya validados con horariosSchema. */
export const actualizarHorarios = async (datos, sesion) => {
    const doc = await Configuracion.findOneAndUpdate(
        { clave: CLAVE_HORARIOS },
        { $set: { ...datos, actualizadoPor: sesion.id } },
        { returnDocument: 'after', runValidators: true, upsert: true, setDefaultsOnInsert: true },
    ).lean()
    return { horarios: aHorarios(doc), actualizadoEn: doc.updatedAt, actualizadoPor: doc.actualizadoPor }
}
