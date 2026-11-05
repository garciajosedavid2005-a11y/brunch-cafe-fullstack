// Seed idempotente de roles base y primer administrador.
// Uso: npm run seed:base   (lee ADMIN_EMAIL, ADMIN_PASSWORD y ADMIN_NOMBRE del .env)
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { sembrarBase } from '../src/seeds/base.js'

try {
    await mongoose.connect(config.MONGO_URI)
    const { roles, unificacion, admin, estados } = await sembrarBase()

    console.log(`Roles base asegurados: ${roles.join(', ')}`)
    console.log(`Estados asegurados: ${estados.join(', ')}`)
    if (unificacion.usuariosReasignados || unificacion.rolesAlias.length) {
        console.log(`Roles alias de admin encontrados: ${unificacion.rolesAlias.join(', ')} → ${unificacion.usuariosReasignados} usuario(s) reasignados al rol "admin" (los roles viejos se conservan)`)
    }
    if (admin.omitido) {
        console.log(`Administrador: omitido (${admin.motivo}).`)
    } else {
        const textos = {
            creado: 'creado',
            rol_asignado: 'ya existía; se le asignó el rol admin (contraseña y datos sin cambios)',
            sin_cambios: 'ya existía con rol admin (sin cambios)',
        }
        console.log(`Administrador ${admin.correo}: ${textos[admin.accion]}.`)
    }
} catch (error) {
    console.error('No se pudo ejecutar el seed base:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
