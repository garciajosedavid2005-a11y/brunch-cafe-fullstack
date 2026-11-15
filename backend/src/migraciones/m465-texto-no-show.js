// Migración 4.6.5 (pendiente de la Fase 4): corrige SOLO la descripción del estado de reserva «No asistió»
// (`no_show`), que decía «…de la reserva confirmada» y desde 4.3 (F4-g) también se marca desde «pendiente».
// No toca ningún otro campo ni documento. Idempotente: up cambia solo si la descripción es exactamente la anterior
// (si alguien la editó, no la pisa); down vuelve a la anterior solo si es exactamente la nueva.
export const DESCRIPCION_ANTERIOR = 'Los comensales no llegaron a la reserva confirmada.'
export const DESCRIPCION_NUEVA = 'Los comensales no llegaron a la reserva.'
const FILTRO = { tipo: 'reserva', codigo: 'no_show' }

const cambiar = async (db, de, a, { dryRun }) => {
    const estados = db.collection('estados')
    const filtro = { ...FILTRO, descripcion: de }
    const pendientes = await estados.countDocuments(filtro)
    if (!dryRun && pendientes) await estados.updateOne(filtro, { $set: { descripcion: a } })
    return { cambiar: pendientes, aplicado: !dryRun && pendientes > 0 }
}

export const up = (db, { dryRun = false } = {}) => cambiar(db, DESCRIPCION_ANTERIOR, DESCRIPCION_NUEVA, { dryRun })
export const down = (db, { dryRun = false } = {}) => cambiar(db, DESCRIPCION_NUEVA, DESCRIPCION_ANTERIOR, { dryRun })
