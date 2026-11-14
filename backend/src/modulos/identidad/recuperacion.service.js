import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import Usuario from './usuario.model.js'
import { config } from '../../config.js'
import { logger } from '../compartido/logger.js'
import { AppError } from '../compartido/errors.js'
import { enviarCorreoRecuperacion, enviarCorreoCreacion, smtpConfigurado } from './recuperacion.email.js'

const DURACION_TOKEN_MS = 30 * 60 * 1000
// 1.5b · Enlace «Crea tu contraseña» (alta desde el admin y, desde 2.10d, la recuperación de esas cuentas)
export const DURACION_ENLACE_CREACION_MS = 24 * 60 * 60 * 1000
// Espera mínima entre correos de recuperación a la misma cuenta (también desde varias IP; pendiente de 2.8)
export const ESPERA_ENTRE_CORREOS_MS = 60 * 1000
const MENSAJE_SOLICITUD = 'Si la cuenta existe, recibirás un enlace para restablecer tu contraseña.'

const hashToken = (token) => createHash('sha256').update(token).digest('hex')

/** Token de un solo uso para definir la contraseña: { token (va en el enlace), hash (se guarda), expira }. */
export const nuevoTokenDeContrasena = (duracionMs = DURACION_TOKEN_MS) => {
    const token = randomBytes(32).toString('hex')
    return { token, hash: hashToken(token), expira: new Date(Date.now() + duracionMs) }
}

// Solicitudes en curso (los tests las esperan; en el servidor corren en segundo plano)
const pendientes = new Set()
export const esperarRecuperacionesPendientes = () => Promise.allSettled([...pendientes])

const procesarSolicitud = async (correo) => {
    const usuario = await Usuario.findOne({ correo }).collation({ locale: 'en', strength: 2 })

    if (usuario && usuario.activo !== false) {
        // 2.10d (Brayan) · Si aún no creó su contraseña, se le envía de nuevo «Crea tu contraseña» (24 h):
        // un enlace de recuperación de 30 min acortaría el que le mandó el admin
        const crear = usuario.contraseñaPendiente === true
        const { token, hash: tokenHash, expira } = nuevoTokenDeContrasena(crear ? DURACION_ENLACE_CREACION_MS : DURACION_TOKEN_MS)
        const url = new URL('/restablecer-contrasena', config.CLIENT_URLS[0])
        url.searchParams.set('token', token)
        if (crear) url.searchParams.set('tipo', 'crear')

        // Escritura condicional: dentro del minuto no se regenera el enlace ni se envía otro correo (dos
        // solicitudes a la vez: solo una gana). La respuesta al cliente es la misma en los dos casos.
        const ahora = new Date()
        const { modifiedCount } = await Usuario.updateOne(
            { _id: usuario._id, contraseñaPendiente: crear ? true : { $ne: true }, $or: [{ passwordResetSolicitadoEn: null }, { passwordResetSolicitadoEn: { $lte: new Date(ahora - ESPERA_ENTRE_CORREOS_MS) } }] },
            { $set: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expira, passwordResetSolicitadoEn: ahora } },
        )
        if (modifiedCount === 0) return

        // Solo en desarrollo y sin SMTP: el enlace va al log para poder probar el flujo (0.15c).
        // Nunca se registra el correo; en test y producción el enlace no se escribe en ningún log.
        if (config.NODE_ENV === 'development' && !smtpConfigurado()) {
            logger.info({ usuarioId: usuario._id, enlace: url.toString() }, crear
                ? 'SMTP sin configurar: enlace «Crea tu contraseña» (solo en desarrollo; vence en 24 h)'
                : 'SMTP sin configurar: enlace de recuperación (solo en desarrollo; vence en 30 min)')
            return
        }

        try {
            await (crear ? enviarCorreoCreacion : enviarCorreoRecuperacion)({
                correo: usuario.correo,
                nombre: usuario.nombre,
                url: url.toString(),
            })
        } catch (error) {
            try {
                await Usuario.updateOne(
                    { _id: usuario._id, passwordResetTokenHash: tokenHash },
                    { $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1, passwordResetSolicitadoEn: 1 } },
                )
            } catch (errorLimpieza) {
                logger.error({
                    errorCode: errorLimpieza?.code || 'TOKEN_CLEANUP_FAILED',
                    errorName: errorLimpieza?.name,
                    usuarioId: usuario._id,
                }, 'No se pudo invalidar un enlace de recuperación no enviado')
            }
            logger.error({
                errorCode: error?.code || 'SMTP_SEND_FAILED',
                errorName: error?.name,
                usuarioId: usuario._id,
            }, crear ? 'No se pudo enviar el correo «Crea tu contraseña»' : 'No se pudo enviar el correo de recuperación')
        }
    }
}

// Responde de inmediato y procesa en segundo plano: esperar al SMTP haría que el tiempo de
// respuesta revelara qué correos tienen cuenta (0.15c).
export const solicitarRecuperacion = (correo) => {
    const tarea = procesarSolicitud(correo)
        .catch((error) => logger.error({
            errorCode: error?.code || 'RECOVERY_FAILED',
            errorName: error?.name,
        }, 'No se pudo procesar una solicitud de recuperación'))
        .finally(() => pendientes.delete(tarea))
    pendientes.add(tarea)
    return MENSAJE_SOLICITUD
}

export const restablecerContrasena = async ({ token, nueva }) => {
    const ahora = new Date()
    const contrasenaHash = await bcrypt.hash(nueva, 10)
    const usuario = await Usuario.findOneAndUpdate(
        {
            passwordResetTokenHash: hashToken(token),
            passwordResetExpiresAt: { $gt: ahora },
            activo: { $ne: false },
        },
        {
            $set: { contraseña: contrasenaHash },
            $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1, passwordResetSolicitadoEn: 1, contraseñaPendiente: 1 },
            $inc: { tokenVersion: 1 },
        },
        { returnDocument: 'after', runValidators: true },
    )

    if (!usuario) {
        throw new AppError(400, 'RESET_TOKEN_INVALID', 'El enlace venció o ya fue utilizado. Solicita uno nuevo.')
    }

    return usuario
}
