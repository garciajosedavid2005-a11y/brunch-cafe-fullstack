import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import Usuario from './usuario.model.js'
import { config } from '../../config.js'
import { logger } from '../compartido/logger.js'
import { AppError } from '../compartido/errors.js'
import { enviarCorreoRecuperacion, smtpConfigurado } from './recuperacion.email.js'

const DURACION_TOKEN_MS = 30 * 60 * 1000
const MENSAJE_SOLICITUD = 'Si la cuenta existe, recibirás un enlace para restablecer tu contraseña.'

const hashToken = (token) => createHash('sha256').update(token).digest('hex')

// Solicitudes en curso (los tests las esperan; en el servidor corren en segundo plano)
const pendientes = new Set()
export const esperarRecuperacionesPendientes = () => Promise.allSettled([...pendientes])

const procesarSolicitud = async (correo) => {
    const usuario = await Usuario.findOne({ correo }).collation({ locale: 'en', strength: 2 })

    if (usuario && usuario.activo !== false) {
        const token = randomBytes(32).toString('hex')
        const tokenHash = hashToken(token)
        const url = new URL('/restablecer-contrasena', config.CLIENT_URLS[0])
        url.searchParams.set('token', token)

        usuario.passwordResetTokenHash = tokenHash
        usuario.passwordResetExpiresAt = new Date(Date.now() + DURACION_TOKEN_MS)
        await usuario.save()

        // Solo en desarrollo y sin SMTP: el enlace va al log para poder probar el flujo (0.15c).
        // Nunca se registra el correo; en test y producción el enlace no se escribe en ningún log.
        if (config.NODE_ENV === 'development' && !smtpConfigurado()) {
            logger.info({ usuarioId: usuario._id, enlace: url.toString() }, 'SMTP sin configurar: enlace de recuperación (solo en desarrollo; vence en 30 min)')
            return
        }

        try {
            await enviarCorreoRecuperacion({
                correo: usuario.correo,
                nombre: usuario.nombre,
                url: url.toString(),
            })
        } catch (error) {
            try {
                await Usuario.updateOne(
                    { _id: usuario._id, passwordResetTokenHash: tokenHash },
                    { $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 } },
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
            }, 'No se pudo enviar el correo de recuperación')
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
            $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 },
            $inc: { tokenVersion: 1 },
        },
        { returnDocument: 'after', runValidators: true },
    )

    if (!usuario) {
        throw new AppError(400, 'RESET_TOKEN_INVALID', 'El enlace venció o ya fue utilizado. Solicita uno nuevo.')
    }

    return usuario
}
