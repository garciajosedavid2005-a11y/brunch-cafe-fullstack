// Cambia el amarillo antiguo de los estados (#b78103, contraste 3.2:1 sobre #fff8e1)
// por el nuevo (#7a5000, ≥ 6:1). Solo toca los que tengan EXACTAMENTE el color
// anterior: los colores personalizados por el admin no se modifican. Idempotente.
export const COLOR_ANTERIOR = '#b78103'
export const COLOR_NUEVO = '#7a5000'

const FILTRO = { color: { $regex: `^${COLOR_ANTERIOR}$`, $options: 'i' } }

export const recolorearAmarillo = async (db, { dryRun = false } = {}) => {
    const estados = db.collection('estados')
    const afectados = await estados.find(FILTRO, { projection: { tipo: 1, codigo: 1, nombre: 1, color: 1 } }).toArray()
    if (!dryRun && afectados.length) {
        await estados.updateMany(FILTRO, { $set: { color: COLOR_NUEVO } })
    }
    // Informativo: sin color guardado → la API usa el del catálogo (no se modifican)
    const sinColor = await estados.countDocuments({ color: { $exists: false } })
    return { afectados, sinColor, aplicado: !dryRun }
}
