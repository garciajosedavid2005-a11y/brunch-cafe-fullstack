// Migración 5 (Fase 5 · inventario y reportes): rol «compras» e índices de las colecciones nuevas. Solo agrega.
//   npm run migrate:5 -- --dry-run         simulacro (no escribe)
//   npm run migrate:5                      aplica
//   npm run migrate:5 -- --down --dry-run  simulacro de la reversión
//   npm run migrate:5 -- --down            revierte (el rol solo si lo creó esta migración y nadie lo tiene)
// Antes de aplicar en una BD con datos: respaldo con mongodump (ver README).
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down } from '../src/migraciones/m5-inventario.js'
import { leerArgumentos } from '../src/migraciones/argumentos.js'

const { dryRun, reversa } = leerArgumentos(process.argv.slice(2))

const TEXTO_ROL = {
    crear: 'no existe: se crea con los permisos de inventario',
    'ya-existe': 'ya existe (lo creó el servidor o el admin): no se toca',
    quitar: 'lo creó esta migración y nadie lo tiene: se quita',
    'no-lo-creo': 'no lo creó esta migración: no se toca',
}

try {
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}`)
    const r = reversa ? await down(db, { dryRun }) : await up(db, { dryRun })
    const rol = TEXTO_ROL[r.rol] || (r.rol.startsWith('en-uso') ? `lo tienen ${r.rol.split(':')[1]} usuario(s): no se quita` : r.rol)
    console.log(`Rol compras: ${rol}`)
    const indices = reversa ? r.quitar : r.crear
    console.log(`Índices ${reversa ? 'por quitar' : 'por crear'}: ${indices.length ? indices.join(', ') : 'ninguno'}`)
    console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Listo.')
} catch (error) {
    console.error('La migración falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
