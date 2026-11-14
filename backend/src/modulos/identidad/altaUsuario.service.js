import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import Usuario from './usuario.model.js'
import Rol from './rol.model.js'
import { config } from '../../config.js'
import { logger } from '../compartido/logger.js'
import { AppError } from '../compartido/errors.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { registrarEvento } from '../compartido/estados.service.js'
import { puedeOtorgarRol } from './permisos.js'
import { enviarCorreoCreacion, smtpConfigurado } from './recuperacion.email.js'
import { nuevoTokenDeContrasena, DURACION_ENLACE_CREACION_MS } from './recuperacion.service.js'

// 1.5b · Alta de usuarios desde Admin › Usuarios (usuario:gestionar). El admin no escribe la
// contraseña: la cuenta nace con un hash de bytes aleatorios que nadie conoce (ninguna contraseña
// sirve) y con un enlace «Crea tu contraseña» de 24 h y un solo uso, el mismo mecanismo que la
// recuperación (POST /auth/restablecer-contrasena lo consume y sube tokenVersion).
export { DURACION_ENLACE_CREACION_MS }
const COLACION_CORREO = { locale: 'en', strength: 2 }

const pendientes = new Set()
export const esperarAltasPendientes = () => Promise.allSettled([...pendientes])

const enviarEnSegundoPlano = ({ usuarioId, correo, nombre, url }) => {
    const tarea = enviarCorreoCreacion({ correo, nombre, url })
        .catch((error) => logger.error({
            errorCode: error?.code || 'SMTP_SEND_FAILED', errorName: error?.name, usuarioId,
        }, 'No se pudo enviar el correo «Crea tu contraseña»; la persona puede pedir uno nuevo con «¿Olvidaste tu contraseña?»'))
        .finally(() => pendientes.delete(tarea))
    pendientes.add(tarea)
}

/**
 * Crea la cuenta y deja el Evento con quién la creó (sin el correo en la bitácora).
 * Devuelve { usuario, entrega }: 'correo' (se envía por SMTP en segundo plano), 'registro_desarrollo'
 * (desarrollo sin SMTP: el enlace va al log) o 'sin_smtp' (sin SMTP fuera de desarrollo: no se envía).
 */
export const crearUsuarioAdmin = async ({ nombre, apellido, correo, telefono, rolId }, sesion) => {
    const rol = await Rol.findById(rolId).select('nombre etiqueta permisos').lean()
    if (!rol) throw new AppError(400, 'ROL_NO_VALIDO', 'El rol seleccionado no existe.')
    // Nadie da más permisos de los que tiene (crear un administrador exige ser administrador)
    if (!puedeOtorgarRol(sesion.permisos || [], rol.permisos || [])) {
        throw new AppError(403, 'FORBIDDEN', 'No puedes crear una cuenta con un rol que tiene permisos que tú no tienes.')
    }

    const { token, hash, expira } = nuevoTokenDeContrasena(DURACION_ENLACE_CREACION_MS)
    const contraseña = await bcrypt.hash(randomBytes(32).toString('hex'), 10)
    const existente = () => new AppError(409, 'USUARIO_EXISTENTE', 'Ese correo ya está registrado. Busca la cuenta en la lista o usa otro correo.')

    const usuario = await conTransaccion(async (session) => {
        if (await Usuario.exists({ correo }).collation(COLACION_CORREO).session(session)) throw existente()
        let creado
        try {
            ;[creado] = await Usuario.create([{
                nombre, apellido, correo, contraseña, rol: rol._id, activo: true,
                ...(telefono ? { telefono } : {}),
                passwordResetTokenHash: hash, passwordResetExpiresAt: expira, contraseñaPendiente: true,
            }], { session })
        } catch (error) {
            if (error?.code === 11000) throw existente()
            throw error
        }
        await registrarEvento({
            entidad: 'usuario', entidadId: creado._id, tipo: 'usuario_creado',
            usuario: sesion.id, actor: sesion.rol || 'admin', datos: { rol: rol.nombre }, session,
        })
        return creado
    })

    const entrega = entregarEnlace(usuario, token)
    return { usuario: { ...usuario.toObject(), rol: { _id: rol._id, nombre: rol.nombre, etiqueta: rol.etiqueta } }, entrega }
}

/**
 * Envía (o, en desarrollo sin SMTP, registra) el enlace «Crea tu contraseña» y dice cómo salió:
 * 'correo' (SMTP en segundo plano), 'registro_desarrollo' (al log, nunca el correo) o 'sin_smtp'.
 */
const entregarEnlace = (usuario, token) => {
    const url = new URL('/restablecer-contrasena', config.CLIENT_URLS[0])
    url.searchParams.set('token', token)
    url.searchParams.set('tipo', 'crear')
    if (smtpConfigurado()) {
        enviarEnSegundoPlano({ usuarioId: usuario._id, correo: usuario.correo, nombre: usuario.nombre, url: url.toString() })
        return 'correo'
    }
    if (config.NODE_ENV !== 'development') return 'sin_smtp'
    // Solo en desarrollo: el enlace al log (nunca el correo), como en la recuperación (0.15c)
    logger.info({ usuarioId: usuario._id, enlace: url.toString() }, 'SMTP sin configurar: enlace «Crea tu contraseña» (solo en desarrollo; vence en 24 h)')
    return 'registro_desarrollo'
}

/**
 * Ajuste tras 1.5b · Reenvía «Crea tu contraseña» a una cuenta que aún no la definió: invalida el
 * enlace anterior (se reemplaza el hash), crea uno nuevo de 24 h y deja un Evento con quién lo hizo.
 * Escritura condicional: si la persona creó su contraseña mientras tanto, 409 y no se toca nada.
 */
export const reenviarEnlaceCreacion = async (usuarioId, sesion) => {
    const noExiste = () => new AppError(404, 'NOT_FOUND', 'Usuario no encontrado')
    if (!mongoose.isValidObjectId(usuarioId)) throw noExiste()
    const usuario = await Usuario.findById(usuarioId).populate('rol', 'nombre etiqueta permisos')
    if (!usuario) throw noExiste()
    if (!puedeOtorgarRol(sesion.permisos || [], usuario.rol?.permisos || [])) {
        throw new AppError(403, 'FORBIDDEN', 'No puedes modificar una cuenta que tiene permisos que tú no tienes.')
    }
    if (usuario.activo === false) throw new AppError(409, 'USUARIO_INACTIVO', 'La cuenta está desactivada: actívala antes de reenviar el enlace.')
    const yaCreada = () => new AppError(409, 'CONTRASENA_YA_CREADA', 'Esta persona ya creó su contraseña. Si la olvidó, puede usar «¿Olvidaste tu contraseña?».')
    if (usuario.contraseñaPendiente !== true) throw yaCreada()

    const { token, hash, expira } = nuevoTokenDeContrasena(DURACION_ENLACE_CREACION_MS)
    await conTransaccion(async (session) => {
        const { matchedCount } = await Usuario.updateOne(
            { _id: usuario._id, contraseñaPendiente: true, activo: { $ne: false } },
            { $set: { passwordResetTokenHash: hash, passwordResetExpiresAt: expira } },
            { session },
        )
        if (matchedCount !== 1) {
            // Cambió entre la lectura y la escritura: se dice qué pasó de verdad
            const ahora = await Usuario.findById(usuario._id).select('activo contraseñaPendiente').session(session).lean()
            if (ahora?.activo === false) throw new AppError(409, 'USUARIO_INACTIVO', 'La cuenta está desactivada: actívala antes de reenviar el enlace.')
            throw yaCreada()
        }
        await registrarEvento({
            entidad: 'usuario', entidadId: usuario._id, tipo: 'enlace_reenviado',
            usuario: sesion.id, actor: sesion.rol || 'admin', datos: { vence: expira }, session,
        })
    })
    const entrega = entregarEnlace(usuario, token)
    return { usuario: usuario.toObject(), entrega }
}
