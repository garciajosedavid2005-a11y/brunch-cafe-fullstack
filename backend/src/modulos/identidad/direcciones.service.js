import mongoose from 'mongoose'
import Usuario, { MAX_DIRECCIONES } from './usuario.model.js'
import { AppError, notFound } from '../compartido/errors.js'

// 6.4 (F6-g) · Libreta de direcciones del usuario de la sesión (/api/v1/cliente/direcciones). Siempre sobre su propio
// documento (no hay IDOR posible: el id de una dirección ajena no está en su arreglo → 404). Cada cambio lee, modifica
// y guarda con la versión del documento (`increment`): dos pestañas a la vez no superan el límite ni dejan dos
// principales; la que llega tarde recibe 409.
const noEncontrada = () => notFound('La dirección no existe.')
const modificada = () => new AppError(409, 'DIRECCIONES_MODIFICADAS', 'Tus direcciones cambiaron en otra pestaña: recarga e inténtalo de nuevo.')

/** La principal primero; después, en el orden en que se guardaron. */
export const formatoDirecciones = (direcciones = []) => [...direcciones]
    .sort((a, b) => Number(b.principal) - Number(a.principal))
    .map((d) => ({
        id: String(d._id), etiqueta: d.etiqueta || '', direccion: d.direccion, barrio: d.barrio,
        indicaciones: d.indicaciones || '', principal: Boolean(d.principal),
    }))

const cargar = async (usuarioId) => {
    // Con __v: sin él, Mongoose no pone la versión en la condición del guardado y no habría control de concurrencia
    const usuario = await Usuario.findById(usuarioId).select('direcciones __v')
    if (!usuario) throw notFound('Usuario no encontrado')
    return usuario
}

const guardar = async (usuario) => {
    usuario.increment() // el guardado exige la misma versión que se leyó
    try {
        await usuario.save()
    } catch (error) {
        if (error instanceof mongoose.Error.VersionError) throw modificada()
        throw error
    }
    return { direcciones: formatoDirecciones(usuario.direcciones) }
}

const buscar = (usuario, direccionId) => {
    const direccion = mongoose.isValidObjectId(direccionId) ? usuario.direcciones.id(direccionId) : null
    if (!direccion) throw noEncontrada()
    return direccion
}

export const listarDirecciones = async (usuarioId) => {
    const usuario = await Usuario.findById(usuarioId).select('direcciones').lean()
    if (!usuario) throw notFound('Usuario no encontrado')
    return { direcciones: formatoDirecciones(usuario.direcciones) }
}

/** Agrega una dirección; la primera queda como principal. Con 5 ya guardadas, 409 LIMITE_DIRECCIONES. */
export const agregarDireccion = async (usuarioId, datos) => {
    const usuario = await cargar(usuarioId)
    if (usuario.direcciones.length >= MAX_DIRECCIONES) {
        throw new AppError(409, 'LIMITE_DIRECCIONES', `Puedes guardar hasta ${MAX_DIRECCIONES} direcciones: borra una para agregar otra.`)
    }
    usuario.direcciones.push({ ...datos, principal: usuario.direcciones.length === 0 })
    return guardar(usuario)
}

export const editarDireccion = async (usuarioId, direccionId, datos) => {
    const usuario = await cargar(usuarioId)
    buscar(usuario, direccionId).set(datos)
    return guardar(usuario)
}

/** Borra una dirección; si era la principal, la siguiente pasa a serlo. */
export const borrarDireccion = async (usuarioId, direccionId) => {
    const usuario = await cargar(usuarioId)
    const direccion = buscar(usuario, direccionId)
    const eraPrincipal = direccion.principal
    usuario.direcciones.pull(direccion._id)
    if (eraPrincipal && usuario.direcciones.length) usuario.direcciones[0].principal = true
    return guardar(usuario)
}

export const marcarPrincipal = async (usuarioId, direccionId) => {
    const usuario = await cargar(usuarioId)
    const elegida = buscar(usuario, direccionId)
    for (const d of usuario.direcciones) d.principal = d._id.equals(elegida._id)
    return guardar(usuario)
}
