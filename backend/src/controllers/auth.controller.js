import Usuario from '../models/usuario.model.js'
import Rol from '../models/rol.model.js'
import bcrypt from 'bcryptjs'
import { generarToken } from '../libs/jwt.js'
import { ponerCookieSesion, borrarCookieSesion } from '../libs/cookies.js'
import { AppError } from '../libs/errors.js'

// Comparación sin distinguir mayúsculas: las cuentas antiguas pueden tener
// el correo guardado con mayúsculas (ver scripts/reportar-correos-duplicados.js)
const SIN_MAYUSCULAS = { locale: 'en', strength: 2 }

const MENSAJE_LOGIN = 'Correo o contraseña incorrectos.'
const MENSAJE_REGISTRO = 'No fue posible completar el registro con esos datos. Si ya tienes una cuenta, inicia sesión.'

// Hash fijo para comparar aunque el correo no exista (tiempo de respuesta similar)
const HASH_FICTICIO = bcrypt.hashSync('contraseña-ficticia-para-tiempo-constante', 10)

const usuarioPublico = (usuario, rolNombre) => ({
    id: usuario._id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    correo: usuario.correo,
    telefono: usuario.telefono,
    rol: rolNombre,
    createdAt: usuario.createdAt,
    updatedAt: usuario.updatedAt,
})

export const register = async (req, res) => {
    const { nombre, apellido, correo, contraseña, telefono } = req.validado

    const existe = await Usuario.exists({ correo }).collation(SIN_MAYUSCULAS)
    if (existe) throw new AppError(400, 'REGISTRO_NO_DISPONIBLE', MENSAJE_REGISTRO)

    // El rol "cliente" lo crea sembrarRoles() al arrancar (sin upserts en peticiones)
    const rolCliente = await Rol.findOne({ nombre: 'cliente' })
    if (!rolCliente) throw new Error('Falta el rol "cliente": ejecuta npm run seed:base')

    let usuarioGuardado
    try {
        usuarioGuardado = await Usuario.create({
            nombre,
            apellido,
            correo,
            contraseña: await bcrypt.hash(contraseña, 10),
            telefono,
            rol: rolCliente._id,
        })
    } catch (error) {
        // Carrera entre dos registros con el mismo correo
        if (error.code === 11000) throw new AppError(400, 'REGISTRO_NO_DISPONIBLE', MENSAJE_REGISTRO)
        throw error
    }

    const token = await generarToken({ id: usuarioGuardado._id, rol: rolCliente.nombre })
    ponerCookieSesion(res, token)
    res.json(usuarioPublico(usuarioGuardado, rolCliente.nombre))
}

export const login = async (req, res) => {
    const { correo, contraseña } = req.validado

    const usuario = await Usuario.findOne({ correo }).collation(SIN_MAYUSCULAS).populate('rol')
    const coincide = await bcrypt.compare(contraseña, usuario?.contraseña || HASH_FICTICIO)
    if (!usuario || !coincide || !usuario.rol) {
        throw new AppError(401, 'CREDENCIALES_INVALIDAS', MENSAJE_LOGIN)
    }

    const token = await generarToken({ id: usuario._id, rol: usuario.rol.nombre })
    ponerCookieSesion(res, token)
    res.json(usuarioPublico(usuario, usuario.rol.nombre))
}

export const logout = (req, res) => {
    borrarCookieSesion(res)
    return res.sendStatus(200)
}
