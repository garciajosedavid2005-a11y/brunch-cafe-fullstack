// Migración 1.5b: se eliminan los roles «anfitrion» y «compras» (decisión de Brayan, 2026-11-10).
//
// up (no destructiva en datos de usuario, reversible e idempotente; todo en una transacción)
//   - Los usuarios con rol anfitrion pasan a mesero y los de compras a cliente. Cada usuario movido
//     guarda en `_migracion15b.rolAnterior` su rol (para down); no se toca nada más (activo, etc.).
//   - El mesero recibe las tareas del anfitrión (PERMISOS_PARA_MESERO) que aún no tenga; el rol
//     guarda en `_migracion15b` lo que se agregó.
//   - Cada rol eliminado se copia entero en la colección `migracion_15b_roles` (mismo _id) y luego
//     se borra de `rols`.
//   - Sin el rol mesero o el cliente se detiene sin escribir.
// down
//   - Restaura los roles desde la copia (mismo _id), devuelve su rol anterior a cada usuario marcado
//     que siga en el rol que le puso up (si el admin se lo cambió después, solo se le quita la marca y
//     se informa), quita del mesero solo lo que agregó up y borra la colección de la copia.
//   - Si entretanto se creó otro rol con el nombre de uno eliminado, se detiene sin escribir.
// Orden de despliegue: primero el código de 1.5b y después esta migración (el código anterior vuelve
// a sembrar anfitrion y compras al arrancar).
// Las sesiones abiertas ven el cambio en ≤ 30 s (caché de sesiones): reinicia el backend tras aplicarla.
export const MARCA = '_migracion15b'
export const COLECCION_RESPALDO = 'migracion_15b_roles'

// Copia fija (no se importa de permisos.js): si el catálogo cambia, la migración hace lo mismo
export const PERMISOS_PARA_MESERO = ['reserva:cambiar_estado', 'mesa:bloquear', 'mesa:unir', 'cuenta:transferir']
const DESTINO = { anfitrion: 'mesero', compras: 'cliente' }
const ELIMINAR = Object.keys(DESTINO)

const enTransaccion = async (db, trabajo) => {
    const sesion = db.client.startSession()
    try {
        let resultado
        await sesion.withTransaction(async () => {
            resultado = await trabajo(sesion)
        })
        return resultado
    } finally {
        await sesion.endSession()
    }
}

const plan = async (db, session) => {
    const roles = db.collection('rols')
    const usuarios = db.collection('usuarios')
    const mesero = await roles.findOne({ nombre: 'mesero' }, { session })
    const cliente = await roles.findOne({ nombre: 'cliente' }, { session })
    if (!mesero || !cliente) {
        throw new Error('Falta el rol «mesero» o «cliente»: ejecuta npm run seed:base antes de esta migración. No se escribió nada.')
    }
    const destinos = { mesero, cliente }
    const aEliminar = await roles.find({ nombre: { $in: ELIMINAR } }, { session }).toArray()
    const conteo = Object.fromEntries(ELIMINAR.map((n) => [n, 0]))
    for (const r of aEliminar) conteo[r.nombre] = await usuarios.countDocuments({ rol: r._id }, { session })
    const actuales = mesero.permisos || []
    const agregar = PERMISOS_PARA_MESERO.filter((p) => !actuales.includes(p))
    // Permisos del anfitrión que el mesero no tendrá (informativo: no se pierde nada previsto)
    const anfitrion = aEliminar.find((r) => r.nombre === 'anfitrion')
    const sinEquivalente = (anfitrion?.permisos || []).filter((p) => !actuales.includes(p) && !agregar.includes(p))
    return { mesero, destinos, aEliminar, conteo, agregar, sinEquivalente }
}

export const up = async (db, { dryRun = false } = {}) => {
    const trabajo = async (session) => {
        const { mesero, destinos, aEliminar, conteo, agregar, sinEquivalente } = await plan(db, session)
        const resumen = {
            usuarios: conteo,
            mesero: { agregar },
            rolesAEliminar: aEliminar.map((r) => r.nombre).sort(),
            sinEquivalente,
        }
        if (dryRun) return { ...resumen, aplicado: false }

        const roles = db.collection('rols')
        const usuarios = db.collection('usuarios')
        for (const r of aEliminar) {
            const destino = destinos[DESTINO[r.nombre]]
            await usuarios.updateMany(
                { rol: r._id },
                { $set: { rol: destino._id, [MARCA]: { rolAnterior: r._id, rolNuevo: destino._id, migradoEn: new Date() } } },
                { session },
            )
        }
        if (agregar.length) {
            await roles.updateOne(
                { _id: mesero._id },
                { $push: { permisos: { $each: agregar } }, $addToSet: { [MARCA]: { $each: agregar } } },
                { session },
            )
        }
        if (aEliminar.length) {
            // replaceOne con upsert: una copia que quedó de un down anterior no bloquea este up
            for (const r of aEliminar) {
                await db.collection(COLECCION_RESPALDO).replaceOne(
                    { _id: r._id }, { _id: r._id, rol: r, eliminadoEn: new Date() }, { upsert: true, session },
                )
            }
            await roles.deleteMany({ _id: { $in: aEliminar.map((r) => r._id) } }, { session })
        }
        return { ...resumen, aplicado: true }
    }
    // El simulacro corre la misma lógica en la transacción pero no escribe nada
    return enTransaccion(db, trabajo)
}

export const down = async (db, { dryRun = false } = {}) => {
    const existeRespaldo = (await db.listCollections({ name: COLECCION_RESPALDO }).toArray()).length > 0
    const resultado = await enTransaccion(db, async (session) => {
        const roles = db.collection('rols')
        const usuarios = db.collection('usuarios')
        const copias = existeRespaldo ? await db.collection(COLECCION_RESPALDO).find({}, { session }).toArray() : []
        const mesero = await roles.findOne({ nombre: 'mesero' }, { session })
        const quitar = mesero?.[MARCA] || []
        const siguenIgual = { [MARCA]: { $exists: true }, $expr: { $eq: ['$rol', `$${MARCA}.rolNuevo`] } }
        const marcados = await usuarios.countDocuments(siguenIgual, { session })
        const cambiadosDespues = (await usuarios.countDocuments({ [MARCA]: { $exists: true } }, { session })) - marcados
        for (const { rol } of copias) {
            const ocupado = await roles.findOne({ nombre: rol.nombre, _id: { $ne: rol._id } }, { session })
            if (ocupado) {
                throw new Error(`Ya existe otro rol llamado «${rol.nombre}»: renómbralo antes de revertir. No se escribió nada.`)
            }
        }
        // Cada rol anterior de un usuario que se va a devolver debe existir (en la copia o en rols)
        const anteriores = await usuarios.distinct(`${MARCA}.rolAnterior`, siguenIgual, { session })
        const disponibles = new Set([
            ...copias.map((c) => String(c.rol._id)),
            ...(await roles.find({ _id: { $in: anteriores } }, { session }).project({ _id: 1 }).toArray()).map((r) => String(r._id)),
        ])
        const faltan = anteriores.filter((id) => !disponibles.has(String(id)))
        if (faltan.length) {
            throw new Error(`Faltan ${faltan.length} rol(es) anteriores (ni en la copia ni en rols): no se puede revertir sin dejar usuarios sin rol. No se escribió nada.`)
        }
        const resumen = { rolesARestaurar: copias.map((c) => c.rol.nombre).sort(), usuarios: marcados, cambiadosDespues, mesero: { quitar } }
        if (dryRun) return { ...resumen, aplicado: false }

        for (const { rol } of copias) {
            if (!(await roles.findOne({ _id: rol._id }, { session }))) await roles.insertOne(rol, { session })
        }
        // Cada usuario que sigue en el rol que le puso up vuelve al anterior (el valor sale de su marca);
        // a los que el admin cambió después solo se les quita la marca
        await usuarios.updateMany(siguenIgual, [{ $set: { rol: `$${MARCA}.rolAnterior` } }, { $unset: MARCA }], { session })
        await usuarios.updateMany({ [MARCA]: { $exists: true } }, { $unset: { [MARCA]: 1 } }, { session })
        if (mesero && quitar.length) {
            await roles.updateOne({ _id: mesero._id }, { $pull: { permisos: { $in: quitar } }, $unset: { [MARCA]: 1 } }, { session })
        }
        return { ...resumen, aplicado: true }
    })
    if (resultado.aplicado && existeRespaldo) await db.collection(COLECCION_RESPALDO).drop()
    return resultado
}
