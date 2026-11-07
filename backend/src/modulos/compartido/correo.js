// Transporte SMTP único del backend (0.16): lo usan la recuperación de contraseña y la
// confirmación de reservas. Las credenciales vienen de SMTP_* en .env.
import nodemailer from 'nodemailer'
import { config } from '../../config.js'

export const smtpConfigurado = () => Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASSWORD)

export const enviarCorreo = async ({ para, asunto, texto }) => {
    if (!smtpConfigurado()) {
        const error = new Error('Configura SMTP_HOST, SMTP_USER y SMTP_PASSWORD para enviar correos.')
        error.code = 'SMTP_CONFIG_MISSING'
        throw error
    }
    const transportador = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_PORT === 465,
        auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
    })
    await transportador.sendMail({ from: config.SMTP_FROM || config.SMTP_USER, to: para, subject: asunto, text: texto })
}
