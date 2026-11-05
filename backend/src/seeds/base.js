import bcrypt from 'bcryptjs'
import { z } from 'zod'
import Rol from '../models/rol.model.js'
import Usuario from '../models/usuario.model.js'
import Permiso from '../models/permiso.model.js'
import { COMODIN, PERMISOS, ROLES_STAFF, ROL_ADMIN, ROL_CLIENTE } from '../libs/permisos.js'
import { sembrarEstados } from './estados.js'

// Roles con reglas fijas: admin siempre tiene "*" y cliente nunca tiene permisos de staff
export const ROLES_BASE = [
    { nombre: ROL_ADMIN, etiqueta: 'Administrador', descripcion: 'Acceso total al sistema.', permisos: [COMODIN] },
    { nombre: ROL_CLIENTE, etiqueta: 'Cliente', descripcion: 'Cliente registrado en el sitio web.', permisos: [] },
]

/** Refleja el catálogo de permisos del código en la colección Permiso. Idempotente. */
export const sembrarPermisos = async () => {
    await Permiso.bulkWrite(PERMISOS.map(({ clave, modulo, descripcion, reservado = false }) => ({
        updateOne: {
            filter: { clave },
            update: { $set: { modulo, descripcion, reservado } },
            upsert: true,
        },
    })))
    // Claves que ya no existen en el código se eliminan del reflejo (no de los roles)
    await Permiso.deleteMany({ clave: { $nin: PERMISOS.map((p) => p.clave) } })
}

// Nombres con los que alguien pudo crear el rol admin a mano en su BD
const ALIAS_ADMIN = /^(admin|administrador|administrator)$/i

/**
 * Crea los roles base y de staff si no existen y los marca como de sistema.
 * - admin y cliente: sus permisos se fuerzan siempre (["*"] y []).
 * - staff: los permisos mínimos solo se asignan al crear el rol; luego los edita el admin.
 * No sobrescribe etiqueta ni descripción editadas (salvo una etiqueta igual al código o vacía). Idempotente.
 */
export const sembrarRoles = async () => {
    await sembrarPermisos()
    // Etiqueta igual al código ("cliente"), vacía o ausente (la UI mostraba el código)
    // → la del catálogo ("Cliente"). Una etiqueta personalizada no se toca.
    await Rol.bulkWrite([...ROLES_BASE, ...ROLES_STAFF].map(({ nombre, etiqueta }) => ({
        updateOne: { filter: { nombre, etiqueta: { $in: [nombre, '', null] } }, update: { $set: { etiqueta } } },
    })))
    const roles = {}
    for (const { nombre, permisos, ...valores } of ROLES_BASE) {
        roles[nombre] = await Rol.findOneAndUpdate(
            { nombre },
            { $setOnInsert: { nombre, ...valores }, $set: { esSistema: true, permisos } },
            { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
        )
    }
    for (const { nombre, permisos, ...valores } of ROLES_STAFF) {
        roles[nombre] = await Rol.findOneAndUpdate(
            { nombre },
            { $setOnInsert: { nombre, permisos, ...valores }, $set: { esSistema: true } },
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
    const estados = await sembrarEstados()
    return { roles: Object.keys(roles), unificacion, admin, estados }
}
