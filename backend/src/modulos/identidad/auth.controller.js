import Usuario from './usuario.model.js'
import Rol from './rol.model.js'
import { ROL_CLIENTE } from './permisos.js'
import bcrypt from 'bcryptjs'
import { tokenDeSesion } from './jwt.js'
import { ponerCookieSesion, borrarCookieSesion } from './cookies.js'
import { AppError } from '../compartido/errors.js'
import { solicitarRecuperacion as solicitar, restablecerContrasena as restablecer } from './recuperacion.service.js'

// Comparación sin distinguir mayúsculas: las cuentas antiguas pueden tener
// el correo guardado con mayúsculas (ver scripts/reportar-correos-duplicados.js)
const SIN_MAYUSCULAS = { locale: 'en', strength: 2 }

const MENSAJE_LOGIN = 'Correo o contraseña incorrectos.'
const MENSAJE_REGISTRO = 'No fue posible completar el registro con esos datos. Si ya tienes una cuenta, inicia sesión.'

// Hash fijo para comparar aunque el correo no exista (tiempo de respuesta similar)
const HASH_FICTICIO = bcrypt.hashSync('contraseña-ficticia-para-tiempo-constante', 10)

const usuarioPublico = (usuario, rol) => ({
    id: usuario._id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    correo: usuario.correo,
    telefono: usuario.telefono,
    rol: rol.nombre,
    rolEtiqueta: rol.etiqueta || rol.nombre,
    permisos: rol.permisos || [],
    // El frontend separa al personal del cliente sin comparar nombres de rol (0.15d)
    esPersonal: rol.nombre !== ROL_CLIENTE,
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

    // El token solo identifica al usuario; rol y permisos se leen de la BD en cada petición
    const token = await tokenDeSesion(usuarioGuardado)
    ponerCookieSesion(res, token)
    res.json(usuarioPublico(usuarioGuardado, rolCliente))
}

export const login = async (req, res) => {
    const { correo, contraseña } = req.validado

    const usuario = await Usuario.findOne({ correo }).collation(SIN_MAYUSCULAS).populate('rol')
    const coincide = await bcrypt.compare(contraseña, usuario?.contraseña || HASH_FICTICIO)
    if (!usuario || !coincide || !usuario.rol) {
        throw new AppError(401, 'CREDENCIALES_INVALIDAS', MENSAJE_LOGIN)
    }
    // Solo se informa después de validar la contraseña
    if (usuario.activo === false) {
        throw new AppError(403, 'ACCOUNT_DISABLED', 'Tu cuenta está desactivada. Contacta al administrador.')
    }

    const token = await tokenDeSesion(usuario)
    ponerCookieSesion(res, token)
    res.json(usuarioPublico(usuario, usuario.rol))
}

export const logout = (req, res) => {
    borrarCookieSesion(res)
    return res.sendStatus(200)
}

export const solicitarRecuperacion = (req, res) => {
    res.status(202).json({ message: solicitar(req.validado.correo) })
}

export const restablecerContrasena = async (req, res) => {
    await restablecer(req.validado)
    res.json({ message: 'Tu contraseña fue restablecida. Ya puedes iniciar sesión.' })
}
