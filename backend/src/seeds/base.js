import bcrypt from 'bcryptjs'
import { z } from 'zod'
import Rol from '../models/rol.model.js'
import Usuario from '../models/usuario.model.js'

// Roles mínimos para que el sistema funcione. Los roles de staff (mesero, cocina…)
// se agregan en 0.4 junto con sus permisos.
export const ROLES_BASE = [
    { nombre: 'admin', etiqueta: 'Administrador', descripcion: 'Acceso total al sistema.' },
    { nombre: 'cliente', etiqueta: 'Cliente', descripcion: 'Cliente registrado en el sitio web.' },
]

// Nombres con los que alguien pudo crear el rol admin a mano en su BD
const ALIAS_ADMIN = /^(admin|administrador|administrator)$/i

/**
 * Crea los roles base si no existen y los marca como de sistema.
 * No sobrescribe etiqueta ni descripción si el admin ya las editó. Idempotente.
 */
export const sembrarRoles = async () => {
    const roles = {}
    for (const { nombre, ...valores } of ROLES_BASE) {
        roles[nombre] = await Rol.findOneAndUpdate(
            { nombre },
            { $setOnInsert: { nombre, ...valores }, $set: { esSistema: true } },
            { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
        )
    }
    return roles
}

/**
 * Reasigna al rol canónico "admin" a los usuarios cuyo rol se llama "Admin",
 * "Administrador", etc. (creados a mano). No borra el rol viejo. Idempotente.
 */
export const unificarRolesAdmin = async (rolAdmin) => {
    const alias = await Rol.find({ nombre: ALIAS_ADMIN, _id: { $ne: rolAdmin._id } })
    if (!alias.length) return { rolesAlias: [], usuariosReasignados: 0 }
    const resultado = await Usuario.updateMany(
        { rol: { $in: alias.map((r) => r._id) } },
        { $set: { rol: rolAdmin._id } }
    )
    return { rolesAlias: alias.map((r) => r.nombre), usuariosReasignados: resultado.modifiedCount }
}

const adminEnvSchema = z.object({
    ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email({ error: 'ADMIN_EMAIL no es un correo válido' })),
    ADMIN_PASSWORD: z.string().min(10, { error: 'ADMIN_PASSWORD debe tener al menos 10 caracteres' }),
    ADMIN_NOMBRE: z.string().trim().min(1, { error: 'ADMIN_NOMBRE es requerido' }).max(120),
})

/**
 * Crea el primer administrador desde variables de entorno. Idempotente:
 * - Si el correo ya existe, NO toca su contraseña ni sus datos; solo asegura el rol admin.
 * - Si faltan las variables, no hace nada (devuelve { omitido: true }).
 * Nunca devuelve ni registra la contraseña.
 */
export const sembrarAdmin = async (rolAdmin, env = process.env) => {
    if (!env.ADMIN_EMAIL && !env.ADMIN_PASSWORD && !env.ADMIN_NOMBRE) {
        return { omitido: true, motivo: 'ADMIN_EMAIL, ADMIN_PASSWORD y ADMIN_NOMBRE no están definidos' }
    }
    const parsed = adminEnvSchema.safeParse(env)
    if (!parsed.success) {
        throw new Error(`Configuración del admin inválida: ${parsed.error.issues.map((i) => i.message).join('; ')}`)
    }
    const { ADMIN_EMAIL: correo, ADMIN_PASSWORD: password, ADMIN_NOMBRE: nombreCompleto } = parsed.data

    const existente = await Usuario.findOne({ correo }).collation({ locale: 'en', strength: 2 })
    if (existente) {
        if (String(existente.rol) === String(rolAdmin._id)) return { correo, accion: 'sin_cambios' }
        existente.rol = rolAdmin._id
        await existente.save()
        return { correo, accion: 'rol_asignado' }
    }

    // "Brayan Arboleda" → nombre "Brayan", apellido "Arboleda" (apellido es obligatorio)
    const [nombre, ...resto] = nombreCompleto.split(/\s+/)
    await Usuario.create({
        nombre,
        apellido: resto.join(' ') || 'Administrador',
        correo,
        contraseña: await bcrypt.hash(password, 10),
        rol: rolAdmin._id,
    })
    return { correo, accion: 'creado' }
}

// Todo lo necesario para una BD nueva
export const sembrarBase = async (env = process.env) => {
    const roles = await sembrarRoles()
    const unificacion = await unificarRolesAdmin(roles.admin)
    const admin = await sembrarAdmin(roles.admin, env)
    return { roles: Object.keys(roles), unificacion, admin }
}
