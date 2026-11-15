// Migración 4.6 (mesa apartada con anticipación): solo AGREGA `reservas.apartarMesaMin: 60` (el valor por
// defecto) a los horarios que no lo tienen. No cambia ningún otro campo ni un valor ya guardado.
// Idempotente: up solo toca documentos sin el campo. down quita el campo solo donde vale 60 (el valor por
// defecto): uno que el admin cambió se conserva. Sin el campo, el servidor lo lee igual como 60, así que down es la
// inversa «semántica»: también quita un 60 que no escribió up (sembrado o guardado después de 4.6), sin efecto.
const FILTRO_SIN_CAMPO = { clave: 'horarios', 'reservas.apartarMesaMin': { $exists: false } }
const FILTRO_POR_DEFECTO = { clave: 'horarios', 'reservas.apartarMesaMin': 60 }
export const VALOR_POR_DEFECTO = 60

export const up = async (db, { dryRun = false } = {}) => {
    const configuraciones = db.collection('configuraciones')
    const pendientes = await configuraciones.countDocuments(FILTRO_SIN_CAMPO)
    if (!dryRun && pendientes) {
        await configuraciones.updateMany(FILTRO_SIN_CAMPO, { $set: { 'reservas.apartarMesaMin': VALOR_POR_DEFECTO } })
    }
    return { agregar: pendientes, aplicado: !dryRun && pendientes > 0 }
}

export const down = async (db, { dryRun = false } = {}) => {
    const configuraciones = db.collection('configuraciones')
    const pendientes = await configuraciones.countDocuments(FILTRO_POR_DEFECTO)
    if (!dryRun && pendientes) {
        await configuraciones.updateMany(FILTRO_POR_DEFECTO, { $unset: { 'reservas.apartarMesaMin': '' } })
    }
    return { quitar: pendientes, aplicado: !dryRun && pendientes > 0 }
}
