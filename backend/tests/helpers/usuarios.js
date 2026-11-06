import bcrypt from 'bcryptjs'
import { agente } from './app.js'
import Usuario from '../../src/modulos/identidad/usuario.model.js'
import Rol from '../../src/modulos/identidad/rol.model.js'

const CLAVE = 'secreta123'
let contador = 0

/**
 * Crea un usuario con el rol indicado (los roles los siembra setup.js)
 * y devuelve { usuario, sesion } con la cookie ya iniciada.
 */
export const crearConSesion = async (rolNombre = 'cliente', extra = {}) => {
    const rol = await Rol.findOne({ nombre: rolNombre })
    if (!rol) throw new Error(`Rol de prueba inexistente: ${rolNombre}`)
    contador += 1
    const usuario = await Usuario.create({
        nombre: rolNombre,
        apellido: `Prueba${contador}`,
        correo: `${rolNombre}${contador}@example.com`,
        contraseña: await bcrypt.hash(CLAVE, 4),
        rol: rol._id,
        ...extra,
    })
    const sesion = agente()
    const res = await sesion.post('/api/v1/auth/login').send({ correo: usuario.correo, contraseña: CLAVE })
    if (res.status !== 200) throw new Error(`Login de prueba falló (${res.status}): ${JSON.stringify(res.body)}`)
    return { usuario, sesion }
}

export const rolId = async (nombre) => (await Rol.findOne({ nombre }))._id.toString()
