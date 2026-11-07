// Migración 1.3: estación por defecto en las categorías existentes (F1-3).
//
// Las categorías anteriores a 1.3 no tienen `estacion`; los productos la heredan de su categoría
// (Producto.estacion es solo una sobrescritura), así que basta con completar las categorías.
// up (no destructiva, idempotente)
//   - Se detiene sin escribir nada (y lo informa en `bloqueo`) si Cocina o Barra existen pero
//     están inactivas, o si su nombre ya lo usa otra estación con otro código.
//   - Asegura los índices únicos de `estaciones` (código; nombre sin mayúsculas ni tildes), los
//     mismos que declara el modelo, antes de crear nada.
//   - Crea Cocina y Barra si no existe una estación con ese código (marcadas con MARCA: true).
//   - A cada categoría SIN estación (campo ausente o null) le asigna Barra si es de bebidas y
//     Cocina si no. Escritura condicional (si recibió una estación entre la lectura y la
//     escritura, no se toca) y guarda en MARCA lo asignado y cómo estaba el campo.
//   - Las categorías que ya tienen estación no se tocan; si apuntan a una estación que no existe,
//     se informa (no se corrige a ciegas).
// down
//   - Deja como estaban las categorías marcadas cuya estación sigue siendo la que puso up; si el
//     admin la cambió después, conserva su elección y solo quita la marca (lo informa).
//   - Borra las estaciones que creó up si ya nadie las usa (categorías ni productos).
// Se ejecuta con el servidor detenido (README: respaldo con mongodump antes).
export const MARCA = '_migracion13'

// Copia fija (no se importa del seed): si el seed cambia, esta migración hace lo mismo
const ESTACIONES = [
    { codigo: 'cocina', nombre: 'Cocina' },
    { codigo: 'barra', nombre: 'Barra' },
]
const COLACION = { locale: 'es', strength: 1 }
const sinTildes = (texto) => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const codigoPorCategoria = (nombre) => (/(^|[^a-z])bebidas?([^a-z]|$)/.test(sinTildes(nombre)) ? 'barra' : 'cocina')

const SIN_ESTACION = { $in: [null] } // campo ausente o null
const col = (db, nombre) => db.collection(nombre)

// Mismos índices que estacion.model.js (mismo nombre y opciones: Mongoose los reconoce)
const asegurarIndices = async (db) => {
    await col(db, 'estaciones').createIndex({ codigo: 1 }, { unique: true, name: 'codigo_1' })
    await col(db, 'estaciones').createIndex({ nombre: 1 }, { unique: true, collation: COLACION, name: 'nombre_1' })
}

const planEstaciones = async (db) => {
    const plan = []
    for (const e of ESTACIONES) {
        const existente = await col(db, 'estaciones').findOne({ codigo: e.codigo })
        if (existente) {
            if (existente.activa === false) {
                return { plan, bloqueo: `La estación «${e.codigo}» existe pero está inactiva: actívala en Admin › Estaciones y vuelve a ejecutar la migración.` }
            }
            plan.push({ ...e, _id: existente._id, accion: 'existe' })
            continue
        }
        const mismoNombre = await col(db, 'estaciones').findOne({ nombre: e.nombre }, { collation: COLACION })
        if (mismoNombre) {
            return { plan, bloqueo: `El nombre «${e.nombre}» ya lo usa la estación con código «${mismoNombre.codigo}»: renómbrala o asigna las estaciones a mano.` }
        }
        plan.push({ ...e, accion: 'crear' })
    }
    return { plan }
}

const crearEstacion = async (db, e) => {
    const ahora = new Date()
    try {
        const r = await col(db, 'estaciones').updateOne(
            { codigo: e.codigo },
            { $setOnInsert: { codigo: e.codigo, nombre: e.nombre, activa: true, [MARCA]: true, createdAt: ahora, updatedAt: ahora } },
            { upsert: true },
        )
        return r.upsertedCount === 1
    } catch (error) {
        if (error?.code !== 11000) throw error
        return false // otra ejecución la creó a la vez: se relee después
    }
}

export const up = async (db, { dryRun = false } = {}) => {
    const { plan, bloqueo } = await planEstaciones(db)
    if (bloqueo) {
        return { estaciones: plan.map(({ _id, ...e }) => ({ ...e, aplicado: false })), categorias: [], bloqueo }
    }

    if (!dryRun) await asegurarIndices(db)
    const estaciones = []
    for (const { _id, ...e } of plan) {
        let id = _id
        let aplicado = false
        if (e.accion === 'crear' && !dryRun) {
            aplicado = await crearEstacion(db, e)
            id = (await col(db, 'estaciones').findOne({ codigo: e.codigo }))?._id
            if (!id) throw new Error(`No se pudo crear la estación «${e.codigo}».`)
        }
        estaciones.push({ codigo: e.codigo, nombre: e.nombre, accion: e.accion, aplicado, _id: id })
    }
    const idPorCodigo = Object.fromEntries(estaciones.map((e) => [e.codigo, e._id]))
    const existentes = new Set((await col(db, 'estaciones').find().project({ _id: 1 }).toArray()).map((e) => String(e._id)))

    const categorias = []
    for (const cat of await col(db, 'categorias').find().sort({ nombre: 1 }).toArray()) {
        if (cat.estacion != null) {
            const accion = existentes.has(String(cat.estacion)) ? 'ya-tiene' : 'estacion-inexistente'
            categorias.push({ nombre: cat.nombre, accion, aplicado: false })
            continue
        }
        const estacion = codigoPorCategoria(cat.nombre)
        const item = { nombre: cat.nombre, accion: 'asignar', estacion, aplicado: false }
        if (!dryRun) {
            const id = idPorCodigo[estacion]
            const r = await col(db, 'categorias').updateOne(
                { _id: cat._id, estacion: SIN_ESTACION, [MARCA]: { $exists: false } },
                { $set: { estacion: id, [MARCA]: { estacion: id, antes: 'estacion' in cat ? 'null' : 'ausente' } } },
            )
            item.aplicado = r.modifiedCount === 1
            if (!item.aplicado) item.accion = 'cambio-concurrente'
        }
        categorias.push(item)
    }
    return { estaciones: estaciones.map(({ _id, ...e }) => e), categorias }
}

export const down = async (db, { dryRun = false } = {}) => {
    const categorias = []
    for (const cat of await col(db, 'categorias').find({ [MARCA]: { $exists: true } }).sort({ nombre: 1 }).toArray()) {
        const marca = cat[MARCA]
        const intacta = String(cat.estacion) === String(marca.estacion)
        const item = { nombre: cat.nombre, accion: intacta ? 'quitar' : 'cambiada', aplicado: false }
        if (!dryRun) {
            // quitar: restaura el campo como estaba; cambiada: conserva la elección del admin y quita la marca
            const cambio = intacta
                ? (marca.antes === 'null' ? { $set: { estacion: null }, $unset: { [MARCA]: 1 } } : { $unset: { estacion: 1, [MARCA]: 1 } })
                : { $unset: { [MARCA]: 1 } }
            // Condicional: solo si la estación sigue siendo la que se leyó
            const r = await col(db, 'categorias').updateOne({ _id: cat._id, estacion: cat.estacion, [MARCA]: { $exists: true } }, cambio)
            item.aplicado = r.modifiedCount === 1
            if (!item.aplicado) item.accion = 'cambio-concurrente'
        }
        categorias.push(item)
    }

    // Con el servidor detenido nadie asigna estaciones entre el conteo y el borrado
    const estaciones = []
    for (const est of await col(db, 'estaciones').find({ [MARCA]: true }).sort({ codigo: 1 }).toArray()) {
        const [usoCategorias, usoProductos] = await Promise.all([
            // En un simulacro las categorías siguen marcadas: cuentan solo las que down no va a revertir
            col(db, 'categorias').countDocuments(dryRun
                ? { estacion: est._id, $nor: [{ [`${MARCA}.estacion`]: est._id }] }
                : { estacion: est._id }),
            col(db, 'productos').countDocuments({ estacion: est._id }),
        ])
        const enUso = usoCategorias + usoProductos > 0
        const item = { codigo: est.codigo, accion: enUso ? 'en-uso' : 'borrar', aplicado: false }
        if (!enUso && !dryRun) {
            const r = await col(db, 'estaciones').deleteOne({ _id: est._id, [MARCA]: true })
            item.aplicado = r.deletedCount === 1
        }
        estaciones.push(item)
    }
    return { categorias, estaciones }
}
