import { enviarCorreo, smtpConfigurado } from '../compartido/correo.js'

export { smtpConfigurado }

export const enviarCorreoRecuperacion = ({ correo, nombre, url }) => enviarCorreo({
    para: correo,
    asunto: 'Restablece tu contraseña de Brunch Café',
    texto: [
        `Hola${nombre ? ` ${nombre}` : ''}.`,
        '',
        'Recibimos una solicitud para restablecer la contraseña de tu cuenta.',
        `Abre este enlace antes de 30 minutos y úsalo una sola vez: ${url}`,
        '',
        'Si no solicitaste este cambio, puedes ignorar este mensaje.',
    ].join('\n'),
})
