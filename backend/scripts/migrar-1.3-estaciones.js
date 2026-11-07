// Migración 1.3 (estación por defecto en las categorías existentes: bebidas → Barra, el resto →
// Cocina; crea Cocina y Barra si faltan). Reversible.
//   npm run migrate:1.3 -- --dry-run         simulacro (no escribe)
//   npm run migrate:1.3                      aplica
//   npm run migrate:1.3 -- --down --dry-run  simulacro de la reversión
//   npm run migrate:1.3 -- --down            revierte (solo lo que marcó up)
// Con el servidor detenido y, en una BD con datos, tras un respaldo con mongodump (ver README).
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down } from '../src/migraciones/m13-estaciones.js'
import { leerArgumentos } from '../src/migraciones/argumentos.js'

let argumentos
try {
    argumentos = leerArgumentos(process.argv.slice(2))
} catch (error) {
    console.error(error.message)
    process.exit(1) // antes de conectar: no se toca la BD
}
const { dryRun, reversa } = argumentos
const verbo = (futuro, pasado) => (dryRun ? futuro : pasado)

const EXPLICACION_UP = {
    asignar: (c) => `sin estación → ${c.estacion === 'barra' ? 'Barra' : 'Cocina'}`,
    'ya-tiene': () => 'ya tiene estación (no se toca)',
    'estacion-inexistente': () => '⚠ apunta a una estación que no existe: asígnale una en Admin › Categorías',
    'cambio-concurrente': () => 'recibió una estación durante la migración: no se tocó',
}
const EXPLICACION_DOWN = {
    quitar: () => verbo('se quitaría la estación que puso up', 'se quitó la estación que puso up'),
    cambiada: () => 'el admin cambió la estación después de up: se conserva (solo se quita la marca)',
    'cambio-concurrente': () => 'cambió durante la reversión: no se tocó; vuelve a ejecutarla',
}

try {
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}`)
    if (reversa) {
        const { categorias, estaciones } = await down(db, { dryRun })
        console.log(`\nCategorías marcadas por up: ${categorias.length}`)
        for (const c of categorias) console.log(`  ${c.nombre.padEnd(24)} ${EXPLICACION_DOWN[c.accion]()}`)
        console.log(`\nEstaciones creadas por up: ${estaciones.length}`)
        for (const e of estaciones) {
            console.log(`  ${e.codigo.padEnd(24)} ${e.accion === 'borrar' ? verbo('se borraría', 'se borró') : 'en uso por otras categorías o productos: se conserva'}`)
        }
        const pendientes = categorias.filter((c) => c.accion === 'cambio-concurrente')
        if (pendientes.length) console.log(`\n⚠ Cambiaron durante la reversión: ${pendientes.map((c) => c.nombre).join(', ')}.`)
        else console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Reversión aplicada.')
    } else {
        const { estaciones, categorias, bloqueo } = await up(db, { dryRun })
        if (bloqueo) {
            console.log(`\n✗ No se ${verbo('aplicaría', 'aplicó')} nada: ${bloqueo}`)
            process.exitCode = 1
        } else {
            console.log('\nEstaciones:')
            for (const e of estaciones) console.log(`  ${e.nombre.padEnd(24)} ${e.accion === 'crear' ? verbo('no existe: se crearía', 'creada') : 'ya existe'}`)
            console.log(`\nCategorías (${categorias.length}):`)
            for (const c of categorias) console.log(`  ${c.nombre.padEnd(24)} ${EXPLICACION_UP[c.accion](c)}`)
            const asignar = categorias.filter((c) => c.accion === 'asignar')
            const enCocina = asignar.filter((c) => c.estacion === 'cocina').length
            console.log(`\nResumen: ${enCocina} → Cocina, ${asignar.length - enCocina} → Barra, ${categorias.length - asignar.length} sin cambios.`)
            const avisos = categorias.filter((c) => ['cambio-concurrente', 'estacion-inexistente'].includes(c.accion))
            if (avisos.length) console.log(`\n⚠ Revisa: ${avisos.map((c) => c.nombre).join(', ')} (ver arriba).`)
            else console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Migración aplicada.')
        }
    }
} catch (error) {
    console.error('La migración falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
