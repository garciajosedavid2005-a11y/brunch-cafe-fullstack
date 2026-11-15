// Migración 3b.4: índices de comprobantes para el cobro de domicilios (Fase 3b).
//
// Un comprobante es de una cuenta o (3b.4) de un pedido. Los índices únicos pasan a ser parciales para que los
// de pedido (sin cuenta) no choquen entre sí por «null»:
//   - una_parte_por_cuenta { cuenta, parte.numero } único, solo donde hay cuenta (antes, para todos).
//   - un_comprobante_por_pedido { pedido } único, solo donde hay pedido (nuevo).
// No toca documentos. up: rehace el primero si no es parcial (lo quita y lo crea; con el servidor detenido) y
// crea el segundo. Idempotente. down: si ya hay comprobantes de pedidos no revierte; si no, lo deja como 3b.2.
export const PARTES = 'una_parte_por_cuenta'
export const PEDIDO = 'un_comprobante_por_pedido'
const PARCIAL_CUENTA = { cuenta: { $type: 'objectId' } }
const PARCIAL_PEDIDO = { pedido: { $type: 'objectId' } }

const coleccion = (db) => db.collection('comprobantes')
const indices = async (db) => {
    try {
        return await coleccion(db).indexes()
    } catch (error) {
        if (error?.codeName === 'NamespaceNotFound' || error?.code === 26) return []
        throw error
    }
}

export const up = async (db, { dryRun = false } = {}) => {
    const actuales = await indices(db)
    const partes = actuales.find((i) => i.name === PARTES)
    const plan = {
        rehacerPartes: !partes || !partes.partialFilterExpression,
        crearPedido: !actuales.some((i) => i.name === PEDIDO),
    }
    if (!dryRun) {
        if (plan.rehacerPartes) {
            if (partes) await coleccion(db).dropIndex(PARTES)
            await coleccion(db).createIndex({ cuenta: 1, 'parte.numero': 1 }, { unique: true, name: PARTES, partialFilterExpression: PARCIAL_CUENTA })
        }
        if (plan.crearPedido) await coleccion(db).createIndex({ pedido: 1 }, { unique: true, name: PEDIDO, partialFilterExpression: PARCIAL_PEDIDO })
    }
    return { ...plan, aplicado: !dryRun && (plan.rehacerPartes || plan.crearPedido) }
}

export const down = async (db, { dryRun = false } = {}) => {
    const actuales = await indices(db)
    if (await coleccion(db).findOne({ pedido: { $type: 'objectId' } }, { projection: { _id: 1 } })) {
        return { rehacerPartes: false, quitarPedido: false, aplicado: false, bloqueo: 'ya hay comprobantes de domicilios' }
    }
    const partes = actuales.find((i) => i.name === PARTES)
    const plan = {
        rehacerPartes: Boolean(partes?.partialFilterExpression) || !partes,
        quitarPedido: actuales.some((i) => i.name === PEDIDO),
    }
    if (!dryRun) {
        if (plan.quitarPedido) await coleccion(db).dropIndex(PEDIDO)
        if (plan.rehacerPartes) {
            if (partes) await coleccion(db).dropIndex(PARTES)
            await coleccion(db).createIndex({ cuenta: 1, 'parte.numero': 1 }, { unique: true, name: PARTES })
        }
    }
    return { ...plan, aplicado: !dryRun && (plan.rehacerPartes || plan.quitarPedido) }
}
