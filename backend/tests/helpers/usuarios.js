import bcrypt from 'bcryptjs'
import { agente } from './app.js'
import Usuario from '../../src/modulos/identidad/usuario.model.js'
import Rol from '../../src/modulos/identidad/rol.model.js'
import { CONSENTIMIENTO_VERSION } from '../../src/modulos/identidad/consentimiento.js'

const CLAVE = 'secreta123'
// 2.4 · Para los tests que abren conexiones sin el agente (SSE con http.get)
export const CLAVE_PRUEBA = CLAVE
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
        // 6.4 · Con el consentimiento vigente (si no, toda la API del cliente da 403); `extra` lo puede quitar
        consentimiento: { version: CONSENTIMIENTO_VERSION, aceptadoEn: new Date() },
        ...extra,
    })
    const sesion = agente()
    const res = await sesion.post('/api/v1/auth/login').send({ correo: usuario.correo, contraseña: CLAVE })
    if (res.status !== 200) throw new Error(`Login de prueba falló (${res.status}): ${JSON.stringify(res.body)}`)
    return { usuario, sesion }
}

export const rolId = async (nombre) => (await Rol.findOne({ nombre }))._id.toString()
