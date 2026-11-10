// Migración 1.5b (eliminar los roles anfitrion y compras; sus tareas pasan al mesero). Reversible.
//   npm run migrate:1.5b -- --dry-run         simulacro (no escribe)
//   npm run migrate:1.5b                      aplica
//   npm run migrate:1.5b -- --down --dry-run  simulacro de la reversión
//   npm run migrate:1.5b -- --down            revierte (restaura los roles y devuelve los usuarios)
// Antes de aplicar en una BD con datos: respaldo con mongodump en backups/ (ver README).
// Orden: primero el código de 1.5b (el anterior vuelve a sembrar los roles al arrancar), luego esta
// migración y reinicia el backend (caché de sesiones de 30 s). No imprime correos ni nombres.
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { leerArgumentos } from '../src/migraciones/argumentos.js'
import { up, down, PERMISOS_PARA_MESERO } from '../src/migraciones/m15b-quitar-roles.js'

try {
    const { dryRun, reversa } = leerArgumentos(process.argv.slice(2))
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}`)
    const verbo = (futuro, pasado) => (dryRun ? futuro : pasado)
    if (reversa) {
        const r = await down(db, { dryRun })
        console.log(`Roles a restaurar: ${r.rolesARestaurar.join(', ') || '(ninguno: no hay copia de up)'}`)
        console.log(`Usuarios que ${verbo('volverían', 'volvieron')} a su rol anterior: ${r.usuarios}`)
        if (r.cambiadosDespues) console.log(`  ${r.cambiadosDespues} con un rol cambiado después de up: se ${verbo('respetaría', 'respetó')} (solo se quita la marca)`)
        console.log(`Permisos que se ${verbo('quitarían', 'quitaron')} al mesero: ${r.mesero.quitar.join(', ') || '(ninguno)'}`)
        console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Reversión aplicada.')
    } else {
        const r = await up(db, { dryRun })
        console.log(`Usuarios con rol anfitrion → mesero: ${r.usuarios.anfitrion}`)
        console.log(`Usuarios con rol compras → cliente: ${r.usuarios.compras}`)
        console.log(`Permisos que ${verbo('recibiría', 'recibió')} el mesero: ${r.mesero.agregar.join(', ') || '(ya los tenía todos)'}`)
        console.log(`  (tareas del anfitrión previstas: ${PERMISOS_PARA_MESERO.join(', ')})`)
        if (r.sinEquivalente.length) console.log(`  ⚠ Permisos del anfitrión que el mesero no tendrá: ${r.sinEquivalente.join(', ')}`)
        console.log(`Roles que se ${verbo('eliminarían', 'eliminaron')} (copia en migracion_15b_roles): ${r.rolesAEliminar.join(', ') || '(ninguno)'}`)
        console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Migración aplicada. Reinicia el backend.')
    }
} catch (error) {
    console.error('La migración falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
