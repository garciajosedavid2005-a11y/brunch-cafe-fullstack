// Migración 5 (Fase 5 · inventario y reportes): solo AGREGA; no modifica ni borra documentos existentes.
//   - Rol «compras» con los permisos de inventario (F5-8), si no existe. Se marca con `_migracion5` para que
//     el down quite solo lo que creó (y solo si nadie lo tiene asignado).
//   - Índices de las colecciones nuevas de la fase (cada ítem que necesite otro lo agrega aquí y se vuelve a
//     aplicar: up crea solo lo que falte).
// Nota: el servidor también crea el rol (sembrarRoles) y los índices (autoIndex) al arrancar; esta migración
// deja la BD lista sin depender del arranque y documenta qué agrega la fase.
export const MARCA = '_migracion5'

// Copia fija (no se importa del catálogo)
export const ROL_COMPRAS = {
    nombre: 'compras',
    etiqueta: 'Compras',
    descripcion: 'Gestiona el inventario, los proveedores y las compras.',
    permisos: ['inventario:ver', 'inventario:gestionar', 'inventario:ajustar', 'compra:gestionar', 'compra:recibir'],
    estaciones: [],
    esSistema: true,
}

export const INDICES = [
    { coleccion: 'insumos', nombre: 'nombre_unico', clave: { nombre: 1 }, opciones: { unique: true, collation: { locale: 'es', strength: 1 } } },
    { coleccion: 'movimientos_inventario', nombre: 'insumo_1_createdAt_-1', clave: { insumo: 1, createdAt: -1 }, opciones: {} },
    { coleccion: 'movimientos_inventario', nombre: 'referencia.tipo_1_referencia.id_1', clave: { 'referencia.tipo': 1, 'referencia.id': 1 }, opciones: {} },
    { coleccion: 'movimientos_inventario', nombre: 'createdAt_-1', clave: { createdAt: -1 }, opciones: {} },
    {
        coleccion: 'movimientos_inventario', nombre: 'una_vez_por_referencia', clave: { insumo: 1, 'referencia.tipo': 1, 'referencia.id': 1, tipo: 1 },
        opciones: { unique: true, partialFilterExpression: { tipo: { $in: ['consumo', 'devolucion', 'recepcion'] } } },
    },
    // 5.2 · Recetas: una por producto, una por opción y búsqueda por insumo
    { coleccion: 'recetas', nombre: 'una_por_producto', clave: { producto: 1 }, opciones: { unique: true, partialFilterExpression: { tipo: 'producto' } } },
    { coleccion: 'recetas', nombre: 'una_por_opcion', clave: { grupo: 1, opcion: 1 }, opciones: { unique: true, partialFilterExpression: { tipo: 'opcion' } } },
    { coleccion: 'recetas', nombre: 'lineas.insumo_1', clave: { 'lineas.insumo': 1 }, opciones: {} },
    // 5.4 · Proveedores, órdenes de compra, recepciones y lotes
    { coleccion: 'proveedores', nombre: 'nombre_unico', clave: { nombre: 1 }, opciones: { unique: true, collation: { locale: 'es', strength: 1 } } },
    { coleccion: 'ordenes_compra', nombre: 'numero_unico', clave: { numero: 1 }, opciones: { unique: true } },
    { coleccion: 'ordenes_compra', nombre: 'estado_1_createdAt_-1', clave: { estado: 1, createdAt: -1 }, opciones: {} },
    { coleccion: 'ordenes_compra', nombre: 'proveedor_1_createdAt_-1', clave: { proveedor: 1, createdAt: -1 }, opciones: {} },
    { coleccion: 'recepciones', nombre: 'orden_1_createdAt_1', clave: { orden: 1, createdAt: 1 }, opciones: {} },
    { coleccion: 'lotes', nombre: 'descartado_1_vencimiento_1', clave: { descartado: 1, vencimiento: 1 }, opciones: {} },
    { coleccion: 'lotes', nombre: 'insumo_1_createdAt_-1', clave: { insumo: 1, createdAt: -1 }, opciones: {} },
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
    const roles = db.collection('rols')
    const rolExiste = Boolean(await roles.findOne({ nombre: ROL_COMPRAS.nombre }))
    const crear = []
    for (const indice of INDICES) {
        if (!(await existentes(db, indice.coleccion)).includes(indice.nombre)) crear.push(`${indice.coleccion}.${indice.nombre}`)
    }
    if (!dryRun) {
        if (!rolExiste) {
            const ahora = new Date()
            // upsert con $setOnInsert: si el servidor lo creó entre la lectura y aquí, no se toca
            await roles.updateOne(
                { nombre: ROL_COMPRAS.nombre },
                { $setOnInsert: { ...ROL_COMPRAS, [MARCA]: true, createdAt: ahora, updatedAt: ahora } },
                { upsert: true },
            )
        }
        for (const indice of INDICES.filter((i) => crear.includes(`${i.coleccion}.${i.nombre}`))) {
            await db.collection(indice.coleccion).createIndex(indice.clave, { name: indice.nombre, ...indice.opciones })
        }
    }
    return { rol: rolExiste ? 'ya-existe' : 'crear', crear, aplicado: !dryRun && (!rolExiste || crear.length > 0) }
}

export const down = async (db, { dryRun = false } = {}) => {
    const roles = db.collection('rols')
    const rol = await roles.findOne({ nombre: ROL_COMPRAS.nombre, [MARCA]: true })
    let accionRol = 'no-lo-creo'
    if (rol) {
        const usuarios = await db.collection('usuarios').countDocuments({ rol: rol._id })
        accionRol = usuarios ? `en-uso:${usuarios}` : 'quitar'
    }
    const quitar = []
    for (const indice of INDICES) {
        if ((await existentes(db, indice.coleccion)).includes(indice.nombre)) quitar.push(`${indice.coleccion}.${indice.nombre}`)
    }
    if (!dryRun) {
        if (accionRol === 'quitar') await roles.deleteOne({ _id: rol._id, [MARCA]: true })
        for (const indice of INDICES.filter((i) => quitar.includes(`${i.coleccion}.${i.nombre}`))) {
            await db.collection(indice.coleccion).dropIndex(indice.nombre)
        }
    }
    return { rol: accionRol, quitar, aplicado: !dryRun }
}
