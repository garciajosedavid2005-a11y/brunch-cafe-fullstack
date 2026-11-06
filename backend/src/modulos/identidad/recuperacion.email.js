import nodemailer from 'nodemailer'
import { config } from '../../config.js'

export const enviarCorreoRecuperacion = async ({ correo, nombre, url }) => {
    if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASSWORD) {
        const error = new Error('Configura SMTP_HOST, SMTP_USER y SMTP_PASSWORD para enviar enlaces de recuperación.')
        error.code = 'SMTP_CONFIG_MISSING'
        throw error
    }

    const transportador = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_PORT === 465,
        auth: {
            user: config.SMTP_USER,
            pass: config.SMTP_PASSWORD,
        },
    })

    await transportador.sendMail({
        from: config.SMTP_FROM || config.SMTP_USER,
        to: correo,
        subject: 'Restablece tu contraseña de Brunch Café',
        text: [
            `Hola${nombre ? ` ${nombre}` : ''}.`,
            '',
            'Recibimos una solicitud para restablecer la contraseña de tu cuenta.',
            `Abre este enlace antes de 30 minutos y úsalo una sola vez: ${url}`,
            '',
            'Si no solicitaste este cambio, puedes ignorar este mensaje.',
        ].join('\n'),
    })
}
