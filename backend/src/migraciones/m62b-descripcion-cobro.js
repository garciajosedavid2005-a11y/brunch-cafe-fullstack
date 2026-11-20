// Migración 6.2b (pendiente de 3b.q, aprobada por Brayan el 2026-11-19): corrige SOLO la descripción del permiso
// `pedido:cobrar`, que decía «cobro contra entrega» y desde 3b.q se cobra cualquier domicilio con su método real.
// No toca ningún otro campo ni documento (ni los roles). Idempotente: up cambia solo si la descripción es exactamente
// la anterior (si alguien la editó, no la pisa); down vuelve a la anterior solo si es exactamente la nueva.
export const DESCRIPCION_ANTERIOR = 'Registrar el cobro contra entrega de un domicilio'
export const DESCRIPCION_NUEVA = 'Registrar en la caja el cobro de un domicilio'
const FILTRO = { clave: 'pedido:cobrar' }

const cambiar = async (db, de, a, { dryRun }) => {
    const permisos = db.collection('permisos')
    const filtro = { ...FILTRO, descripcion: de }
    if (dryRun) {
        const pendientes = await permisos.countDocuments(filtro)
        return { cambiar: pendientes, aplicado: false }
    }
    // El resultado sale de la propia escritura condicional (no de un conteo previo)
    const r = await permisos.updateOne(filtro, { $set: { descripcion: a } })
    return { cambiar: r.modifiedCount, aplicado: r.modifiedCount > 0 }
}

export const up = (db, { dryRun = false } = {}) => cambiar(db, DESCRIPCION_ANTERIOR, DESCRIPCION_NUEVA, { dryRun })
export const down = (db, { dryRun = false } = {}) => cambiar(db, DESCRIPCION_NUEVA, DESCRIPCION_ANTERIOR, { dryRun })
