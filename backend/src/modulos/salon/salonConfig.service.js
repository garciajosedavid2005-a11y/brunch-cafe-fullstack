import mongoose from 'mongoose'
import Zona, { COLACION_NOMBRE } from './zona.model.js'
import Mesa from './mesa.model.js'
import { AppError, notFound, detallesZod } from '../compartido/errors.js'
import { z } from 'zod'
import { conTransaccion } from '../compartido/transacciones.js'
import { sinUndefined } from '../compartido/utils.js'

// 1.2 · Zonas y mesas (Admin › Salón). Protecciones en el servidor:
//   - una mesa que no está libre no se borra, no se desactiva, no cambia de zona, número ni
//     «combinable» (escritura condicional sobre estado: 'libre' → 409 MESA_EN_USO);
//   - una zona con mesas no se borra (se desactiva) y no se desactiva con mesas en uso;
//   - crear una mesa y borrar su zona se serializan: ambas transacciones escriben la zona.
// Pendiente de 1.5: ocupar una mesa debe escribir también su zona (filtro activa: true); si no,
// desactivar la zona y ocupar una de sus mesas a la vez no entran en conflicto (write skew).

const duplicada = () => new AppError(409, 'ZONA_DUPLICADA', 'Ya existe una zona con ese nombre.')
const numeroDuplicado = (numero) => new AppError(409, 'MESA_NUMERO_DUPLICADO', `Ya existe la mesa ${numero}.`)
const mesaEnUso = () => new AppError(409, 'MESA_EN_USO',
    'La mesa está en uso: libérala antes de borrarla, desactivarla o cambiarla de zona.')
const zonaNoValida = () => new AppError(400, 'ZONA_NO_VALIDA', 'La zona no existe o está inactiva.')

const buscarPorId = async (Modelo, id, mensaje) => {
    if (!mongoose.isValidObjectId(id)) throw notFound(mensaje)
    const doc = await Modelo.findById(id)
    if (!doc) throw notFound(mensaje)
    return doc
}

const esDuplicado = (error, campo) => error?.code === 11000 && campo in (error.keyPattern || error.keyValue || {})

// ── Formatos de respuesta ──────────────────────────────────────────────────────────────
const formatoZona = (zona, mesas = 0) => ({
    id: String(zona._id),
    nombre: zona.nombre,
    orden: zona.orden,
    activa: zona.activa,
    ejemplo: Boolean(zona.ejemplo),
    mesas,
})

const formatoMesa = (mesa, zona) => ({
    id: String(mesa._id),
    numero: mesa.numero,
    nombre: mesa.nombre || '',
    zona: zona ? { id: String(zona._id), nombre: zona.nombre } : { id: String(mesa.zona), nombre: '' },
    capacidad: mesa.capacidad,
    estado: mesa.estado,
    combinable: mesa.combinable,
    activa: mesa.activa,
    posicion: mesa.posicion ? { x: mesa.posicion.x, y: mesa.posicion.y } : null,
    ejemplo: Boolean(mesa.ejemplo),
})

// ── Zonas ──────────────────────────────────────────────────────────────────────────────
export const listarZonas = async () => {
    const [zonas, conteos] = await Promise.all([
        Zona.find().sort({ orden: 1, nombre: 1 }).lean(),
        Mesa.aggregate([{ $group: { _id: '$zona', total: { $sum: 1 } } }]),
    ])
    const porZona = new Map(conteos.map((c) => [String(c._id), c.total]))
    return zonas.map((z) => formatoZona(z, porZona.get(String(z._id)) || 0))
}

const nombreLibre = async (nombre, excepto) => {
    const filtro = excepto ? { nombre, _id: { $ne: excepto } } : { nombre }
    if (await Zona.exists(filtro).collation(COLACION_NOMBRE)) throw duplicada()
}

export const crearZona = async ({ nombre, orden, activa }) => {
    await nombreLibre(nombre)
    try {
        return formatoZona(await Zona.create(sinUndefined({ nombre, orden, activa })))
    } catch (error) {
        if (esDuplicado(error, 'nombre')) throw duplicada() // dos altas simultáneas
        throw error
    }
}

export const actualizarZona = async (id, { nombre, orden, activa }) => {
    const zona = await buscarPorId(Zona, id, 'Zona no encontrada.')
    if (nombre !== undefined) await nombreLibre(nombre, zona._id)

    return conTransaccion(async (session) => {
        if (activa === false) {
            const enUso = await Mesa.countDocuments({ zona: zona._id, estado: { $ne: 'libre' } }).session(session)
            if (enUso > 0) {
                throw new AppError(409, 'ZONA_CON_MESAS_EN_USO',
                    `No se puede desactivar: hay ${enUso} mesa(s) en uso en esta zona.`)
            }
        }
        let actualizada
        try {
            actualizada = await Zona.findOneAndUpdate(
                { _id: zona._id },
                { $set: sinUndefined({ nombre, orden, activa }) },
                { returnDocument: 'after', runValidators: true, session },
            )
        } catch (error) {
            if (esDuplicado(error, 'nombre')) throw duplicada()
            throw error
        }
        const mesas = await Mesa.countDocuments({ zona: zona._id }).session(session)
        return formatoZona(actualizada, mesas)
    })
}

export const eliminarZona = async (id) => {
    const zona = await buscarPorId(Zona, id, 'Zona no encontrada.')
    await conTransaccion(async (session) => {
        const mesas = await Mesa.countDocuments({ zona: zona._id }).session(session)
        if (mesas > 0) {
            throw new AppError(409, 'ZONA_CON_MESAS',
                `No se puede eliminar: la zona tiene ${mesas} mesa(s). Desactívala o mueve sus mesas.`)
        }
        await Zona.deleteOne({ _id: zona._id }, { session })
    })
}

// ── Mesas ──────────────────────────────────────────────────────────────────────────────
export const listarMesas = async ({ zona } = {}) => {
    if (zona !== undefined && !mongoose.isValidObjectId(zona)) {
        const error = new z.ZodError([{ code: 'custom', path: ['zona'], message: 'La zona del filtro no es válida', input: zona }])
        throw new AppError(400, 'VALIDATION_ERROR', 'La zona del filtro no es válida.', detallesZod(error))
    }
    const filtro = zona ? { zona } : {}
    const [mesas, zonas] = await Promise.all([
        Mesa.find(filtro).sort({ numero: 1 }).lean(),
        Zona.find().select('nombre').lean(),
    ])
    const porId = new Map(zonas.map((z) => [String(z._id), z]))
    return mesas.map((m) => formatoMesa(m, porId.get(String(m.zona))))
}

/**
 * Comprueba dentro de la transacción que la zona exista y esté activa, y la «toca» (escribe
 * updatedAt): así una transacción que borre la zona a la vez entra en conflicto con esta y
 * nunca queda una mesa en una zona borrada.
 */
const reservarZona = async (zonaId, session) => {
    if (!mongoose.isValidObjectId(zonaId)) throw zonaNoValida()
    const zona = await Zona.findOneAndUpdate(
        { _id: zonaId, activa: true },
        { $currentDate: { updatedAt: true } },
        { returnDocument: 'after', session },
    )
    if (!zona) throw zonaNoValida()
    return zona
}

export const crearMesa = async (datos) => {
    try {
        return await conTransaccion(async (session) => {
            const zona = await reservarZona(datos.zona, session)
            const [mesa] = await Mesa.create([sinUndefined({ ...datos, zona: zona._id })], { session })
            return formatoMesa(mesa, zona)
        })
    } catch (error) {
        if (esDuplicado(error, 'numero')) throw numeroDuplicado(datos.numero)
        throw error
    }
}

// Si la escritura condicional no afectó a nada: 404 si la mesa ya no existe, 409 si está en uso
const mesaNoEscrita = async (id) => ((await Mesa.exists({ _id: id })) ? mesaEnUso() : notFound('Mesa no encontrada.'))

export const actualizarMesa = async (id, datos) => {
    await buscarPorId(Mesa, id, 'Mesa no encontrada.')

    try {
        return await conTransaccion(async (session) => {
            // Se lee dentro de la transacción: lo que decide (zona, número…) no queda desfasado
            const mesa = await Mesa.findById(id).session(session)
            if (!mesa) throw notFound('Mesa no encontrada.')
            const cambia = (campo) => datos[campo] !== undefined && String(datos[campo]) !== String(mesa[campo])
            const cambiaZona = cambia('zona')
            // Con la mesa en uso solo se editan nombre, capacidad y posición (la cuenta abierta y
            // las uniones de 1.4/1.5 dependen del resto)
            const exigeLibre = cambiaZona || cambia('numero') || cambia('combinable') || datos.activa === false

            const zona = cambiaZona
                ? await reservarZona(datos.zona, session)
                : await Zona.findById(mesa.zona).select('nombre').session(session)
            // Escritura condicional sobre lo leído: si otra operación la ocupó o la movió → no escribe
            const filtro = { _id: mesa._id, zona: mesa.zona, ...(exigeLibre ? { estado: 'libre' } : {}) }
            const actualizada = await Mesa.findOneAndUpdate(
                filtro,
                { $set: sinUndefined({ ...datos, zona: cambiaZona ? zona._id : undefined }) },
                { returnDocument: 'after', runValidators: true, session },
            )
            if (!actualizada) throw await mesaNoEscrita(mesa._id)
            return formatoMesa(actualizada, zona)
        })
    } catch (error) {
        if (esDuplicado(error, 'numero')) throw numeroDuplicado(datos.numero)
        throw error
    }
}

export const eliminarMesa = async (id) => {
    const mesa = await buscarPorId(Mesa, id, 'Mesa no encontrada.')
    // Solo libre (condicional). Desde 1.4, además, sin cuentas que la referencien.
    const { deletedCount } = await Mesa.deleteOne({ _id: mesa._id, estado: 'libre' })
    if (deletedCount === 0) throw await mesaNoEscrita(mesa._id)
}
