// Migración 6.1: rellena Pedido.canal = 'domicilio' solo donde falta; reversible.
//   npm run migrate:6.1 -- --dry-run         simulacro (no escribe)
//   npm run migrate:6.1                      aplica
//   npm run migrate:6.1 -- --down --dry-run  simulacro de la reversión
//   npm run migrate:6.1 -- --down            revierte (deja esos pedidos sin canal, como estaban)
// Orden: se aplica ANTES de arrancar el backend de 6.1 y se revierte DESPUÉS de volver al código anterior (el de 6.1
// filtra por canal: 'domicilio' y no vería los pedidos sin canal).
// Antes de aplicar en una BD con datos: respaldo con mongodump.
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import { up, down } from '../src/migraciones/m61-canal-pedidos.js'
import { leerArgumentos } from '../src/migraciones/argumentos.js'

const { dryRun, reversa } = leerArgumentos(process.argv.slice(2))

try {
    await mongoose.connect(config.MONGO_URI)
    const db = mongoose.connection.db
    console.log(`BD: ${db.databaseName} · ${reversa ? 'DOWN' : 'UP'}${dryRun ? ' · SIMULACRO (no escribe)' : ''}`)
    const total = await db.collection('pedidos').countDocuments()
    if (reversa) {
        const r = await down(db, { dryRun })
        console.log(`Pedidos a los que se les quita el canal rellenado: ${r.revertir} ${dryRun ? '(se revertirían)' : '(revertidos)'}.`)
        console.log('Recuerda: revierte primero el código de 6.1 (filtra por canal y no vería estos pedidos).')
    } else {
        const r = await up(db, { dryRun })
        console.log(`Pedidos en total: ${total} · sin canal: ${r.rellenar} → canal 'domicilio' ${dryRun ? '(se rellenarían)' : '(rellenados)'}.`)
        console.log('Campos que cambia: solo `canal` en esos pedidos (ningún otro campo ni pedido). Además anota sus ids')
        console.log('en la colección nueva `migracion_6_1_canal` (solo para que `--down` sea exacto).')
    }
    console.log(dryRun ? '\n✓ Simulacro sin problemas.' : '\n✓ Listo.')
} catch (error) {
    console.error('La migración falló:', error.message)
    process.exitCode = 1
} finally {
    await mongoose.disconnect()
}
