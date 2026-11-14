// Transporte SMTP único del backend (0.16): lo usan la recuperación de contraseña, «Crea tu contraseña» y
// la confirmación de reservas. Las credenciales vienen de SMTP_* en .env.
// 3.7.4 · HTML + texto plano + adjuntos (el logo por CID; ver plantillasCorreo.js). Fuera del puerto 465
// (TLS implícito) se exige STARTTLS (requireTLS): si el servidor no lo ofrece, el envío falla en vez de
// mandar las credenciales en claro.
import nodemailer from 'nodemailer'
import { config } from '../../config.js'

export const smtpConfigurado = () => Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASSWORD)

export const enviarCorreo = async ({ para, asunto, texto, html, adjuntos }) => {
    if (!smtpConfigurado()) {
        const error = new Error('Configura SMTP_HOST, SMTP_USER y SMTP_PASSWORD para enviar correos.')
        error.code = 'SMTP_CONFIG_MISSING'
        throw error
    }
    const tlsImplicito = config.SMTP_PORT === 465
    const transportador = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: tlsImplicito,
        requireTLS: !tlsImplicito,
        auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
    })
    await transportador.sendMail({
        from: config.SMTP_FROM || config.SMTP_USER,
        to: para,
        subject: asunto,
        text: texto,
        ...(html ? { html } : {}),
        ...(adjuntos?.length ? { attachments: adjuntos } : {}),
    })
}
