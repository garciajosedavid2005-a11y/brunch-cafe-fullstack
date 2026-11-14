// Confirmación de reserva por correo (0.16). Sustituye a EmailJS, que enviaba los datos del
// cliente a un servicio externo desde el navegador. Se envía después de guardar la reserva y
// en segundo plano: si el SMTP falla, la reserva no se pierde y el error queda en el log.
import { config } from '../../config.js'
import { logger } from '../compartido/logger.js'
import { enviarCorreo, smtpConfigurado } from '../compartido/correo.js'
import { correoReserva } from '../compartido/plantillasCorreo.js'

// Envíos en curso (los tests los esperan; en el servidor corren en segundo plano)
const pendientes = new Set()
export const esperarNotificacionesReserva = () => Promise.allSettled([...pendientes])

// 3.7.4 · Plantilla HTML de la marca (y texto plano). El botón lleva a «Mis reservas» si la hizo el cliente
// desde su cuenta, o al menú si la registró el personal (la persona no tiene cuenta).
export const contenidoReserva = (reserva) => {
    const conCuenta = Boolean(reserva.usuario)
    return correoReserva({
        nombre: reserva.nombre, fecha: reserva.fecha, hora: reserva.hora, cantidadPersonas: reserva.cantidadPersonas,
        motivo: reserva.motivo, observaciones: reserva.observaciones, conCuenta,
        enlace: new URL(conCuenta ? '/cuenta' : '/menu', config.CLIENT_URLS[0]).toString(),
    })
}

const enviar = async (reserva) => {
    const correo = contenidoReserva(reserva)
    const { asunto, texto } = correo
    const reservaId = String(reserva._id)
    if (!smtpConfigurado()) {
        // Solo en desarrollo: el contenido va al log para poder revisarlo (sin la dirección)
        if (config.NODE_ENV === 'development') {
            logger.info({ reservaId, asunto, contenido: texto }, 'SMTP sin configurar: confirmación de reserva (solo en desarrollo)')
        }
        return
    }
    try {
        await enviarCorreo({ para: reserva.correo, ...correo })
    } catch (error) {
        logger.error({ errorCode: error?.code || 'SMTP_SEND_FAILED', errorName: error?.name, reservaId },
            'No se pudo enviar la confirmación de la reserva (la reserva quedó guardada)')
    }
}

/** Programa el correo de confirmación si la reserva tiene correo. No espera el envío. */
export const notificarReservaCreada = (reserva) => {
    if (!reserva?.correo) return
    const tarea = enviar(reserva).finally(() => pendientes.delete(tarea))
    pendientes.add(tarea)
}
