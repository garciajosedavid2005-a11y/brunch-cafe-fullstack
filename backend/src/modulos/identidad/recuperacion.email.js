import { enviarCorreo, smtpConfigurado } from '../compartido/correo.js'
import { correoCreacion, correoRecuperacion } from '../compartido/plantillasCorreo.js'

export { smtpConfigurado }

// 3.7.4 · Con las plantillas HTML de la marca (y su versión en texto plano)
export const enviarCorreoRecuperacion = ({ correo, nombre, url }) => enviarCorreo({
    para: correo,
    ...correoRecuperacion({ nombre, enlace: url }),
})

// 1.5b · Cuenta creada por el administrador: el enlace sirve para definir la contraseña (24 h, un uso).
// 3.7.4 · Con el rol del empleado («te creó una cuenta como Mesero»).
/** Rol que va en el correo: el nombre visible del rol del personal; un cliente no lleva rol (título neutro). */
export const rolParaCorreo = (rol) => (rol && rol.nombre !== 'cliente' ? rol.etiqueta || rol.nombre : undefined)

export const enviarCorreoCreacion = ({ correo, nombre, rol, url }) => enviarCorreo({
    para: correo,
    ...correoCreacion({ nombre, rol, enlace: url }),
})
