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

// 1.5b · Cuenta creada por el administrador: el enlace sirve para definir la contraseña (24 h, un uso)
export const textoCorreoCreacion = ({ nombre, url }) => ({
    asunto: 'Crea tu contraseña de Brunch Café',
    texto: [
        `Hola${nombre ? ` ${nombre}` : ''}.`,
        '',
        'El equipo de Brunch Café te creó una cuenta.',
        `Crea tu contraseña con este enlace antes de 24 horas (sirve una sola vez): ${url}`,
        '',
        'Si no esperabas este mensaje, puedes ignorarlo.',
    ].join('\n'),
})

export const enviarCorreoCreacion = ({ correo, nombre, url }) => {
    const { asunto, texto } = textoCorreoCreacion({ nombre, url })
    return enviarCorreo({ para: correo, asunto, texto })
}
