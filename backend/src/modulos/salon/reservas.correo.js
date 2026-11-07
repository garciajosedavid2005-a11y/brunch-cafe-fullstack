// Confirmación de reserva por correo (0.16). Sustituye a EmailJS, que enviaba los datos del
// cliente a un servicio externo desde el navegador. Se envía después de guardar la reserva y
// en segundo plano: si el SMTP falla, la reserva no se pierde y el error queda en el log.
import { config } from '../../config.js'
import { logger } from '../compartido/logger.js'
import { enviarCorreo, smtpConfigurado } from '../compartido/correo.js'

// Envíos en curso (los tests los esperan; en el servidor corren en segundo plano)
const pendientes = new Set()
export const esperarNotificacionesReserva = () => Promise.allSettled([...pendientes])

const fechaTexto = (fecha) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(fecha))
const horaTexto = (hora) => new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
    .format(new Date(`2000-01-01T${hora}:00Z`))

export const contenidoReserva = (reserva) => ({
    asunto: 'Recibimos tu solicitud de reserva en Brunch Café',
    texto: [
        `Hola${reserva.nombre ? ` ${reserva.nombre}` : ''}.`,
        '',
        'Recibimos tu solicitud de reserva en Brunch Café. Quedó pendiente de confirmación.',
        '',
        `Fecha: ${fechaTexto(reserva.fecha)}`,
        `Hora: ${horaTexto(reserva.hora)}`,
        `Personas: ${reserva.cantidadPersonas} ${reserva.cantidadPersonas === 1 ? 'persona' : 'personas'}`,
        `Motivo: ${reserva.motivo || '—'}`,
        `Observaciones: ${reserva.observaciones || 'Ninguna'}`,
        '',
        'Te avisaremos cuando la confirmemos.',
    ].join('\n'),
})

const enviar = async (reserva) => {
    const { asunto, texto } = contenidoReserva(reserva)
    const reservaId = String(reserva._id)
    if (!smtpConfigurado()) {
        // Solo en desarrollo: el contenido va al log para poder revisarlo (sin la dirección)
        if (config.NODE_ENV === 'development') {
            logger.info({ reservaId, asunto, contenido: texto }, 'SMTP sin configurar: confirmación de reserva (solo en desarrollo)')
        }
        return
    }
    try {
        await enviarCorreo({ para: reserva.correo, asunto, texto })
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
