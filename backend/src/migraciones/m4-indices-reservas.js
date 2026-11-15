// Migración 4 (Fase 4 · reservas conectadas al salón): solo AGREGA índices; no toca documentos.
//   - reservas.mesa_inicio { mesa, inicio }, parcial (solo reservas con mesa): choques por horario (4.1) y
//     reservas próximas del plano (4.3).
//   - reservas.inicio_estado { inicio, estado }: aforo por franja (4.2).
// Idempotente: up crea los que falten; down quita solo los de esta lista. Cada ítem de la fase que necesite
// otro índice lo agrega aquí y se vuelve a aplicar (up de nuevo crea solo el nuevo).
export const INDICES = [
    { coleccion: 'reservas', nombre: 'mesa_inicio', clave: { mesa: 1, inicio: 1 }, opciones: { partialFilterExpression: { mesa: { $type: 'objectId' } } } },
    { coleccion: 'reservas', nombre: 'inicio_estado', clave: { inicio: 1, estado: 1 }, opciones: {} },
]

const existentes = async (db, coleccion) => {
    try {
        return (await db.collection(coleccion).indexes()).map((i) => i.name)
    } catch (error) {
        if (error?.codeName === 'NamespaceNotFound' || error?.code === 26) return []
        throw error
    }
}

export const up = async (db, { dryRun = false } = {}) => {
    const crear = []
    for (const indice of INDICES) {
        if (!(await existentes(db, indice.coleccion)).includes(indice.nombre)) crear.push(`${indice.coleccion}.${indice.nombre}`)
    }
    if (!dryRun) {
        for (const indice of INDICES.filter((i) => crear.includes(`${i.coleccion}.${i.nombre}`))) {
            await db.collection(indice.coleccion).createIndex(indice.clave, { name: indice.nombre, ...indice.opciones })
        }
    }
    return { crear, aplicado: !dryRun && crear.length > 0 }
}

export const down = async (db, { dryRun = false } = {}) => {
    const quitar = []
    for (const indice of INDICES) {
        if ((await existentes(db, indice.coleccion)).includes(indice.nombre)) quitar.push(`${indice.coleccion}.${indice.nombre}`)
    }
    if (!dryRun) {
        for (const indice of INDICES.filter((i) => quitar.includes(`${i.coleccion}.${i.nombre}`))) {
            await db.collection(indice.coleccion).dropIndex(indice.nombre)
        }
    }
    return { quitar, aplicado: !dryRun && quitar.length > 0 }
}
