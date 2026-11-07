import GrupoModificadores, { COLACION_NOMBRE } from '../modulos/catalogo/grupoModificadores.model.js'
import Producto from '../modulos/catalogo/producto.model.js'

// 1.3 · Grupos de modificadores de ejemplo (F1-4), marcados como ejemplo y editables en
// Admin › Modificadores. Uso: npm run seed:modificadores
// Idempotente y conservador:
//   - crea cada grupo solo si no existe uno con ese nombre (sin mayúsculas ni tildes);
//   - asigna grupos solo a los productos del menú inicial que existen y aún no tienen ninguno.
// «Sin ingrediente» no es un modificador: va como nota del ítem (1.4).
export const GRUPOS_EJEMPLO = [
    {
        nombre: 'Leche', obligatorio: false, min: 0, max: 1,
        opciones: [{ nombre: 'Entera' }, { nombre: 'Deslactosada' }, { nombre: 'Almendra', precioExtra: 2000 }],
    },
    {
        nombre: 'Tamaño', obligatorio: false, min: 0, max: 1,
        opciones: [{ nombre: 'Normal' }, { nombre: 'Grande', precioExtra: 3000 }],
    },
    {
        nombre: 'Término del huevo', obligatorio: true, min: 1, max: 1,
        opciones: [{ nombre: 'Yema líquida' }, { nombre: 'Yema media' }, { nombre: 'Bien cocido' }],
    },
    {
        nombre: 'Extras', obligatorio: false, min: 0, max: 4,
        opciones: [
            { nombre: 'Huevo adicional', precioExtra: 2500 },
            { nombre: 'Tocineta', precioExtra: 4000 },
            { nombre: 'Aguacate', precioExtra: 3500 },
            { nombre: 'Queso', precioExtra: 3000 },
        ],
    },
]

// Decisión 1.3 (Brayan): Término del huevo en los 3 platos con huevo (sin el omelette, que no tiene
// yema que elegir) junto con Extras; Leche y Tamaño al latte; Tamaño a las demás bebidas.
export const ASIGNACIONES_EJEMPLO = {
    'Desayuno clásico gourmet': ['Término del huevo', 'Extras'],
    'Tostada de aguacate gourmet': ['Término del huevo', 'Extras'],
    'Tostada campesina con huevo': ['Término del huevo', 'Extras'],
    'Latte frío artesanal': ['Leche', 'Tamaño'],
    'Limonada de hierbabuena': ['Tamaño'],
    'Té helado de jazmín': ['Tamaño'],
    'Smoothie de mango y jengibre': ['Tamaño'],
}

const buscarGrupo = (nombre) => GrupoModificadores.findOne({ nombre }).collation(COLACION_NOMBRE)

export const sembrarModificadoresEjemplo = async () => {
    const resumen = { grupos: { creados: 0, existentes: 0 }, productos: { asignados: 0, conGrupos: 0, noEncontrados: [] } }
    const idPorNombre = {}
    for (const grupo of GRUPOS_EJEMPLO) {
        let doc = await buscarGrupo(grupo.nombre)
        if (doc) {
            resumen.grupos.existentes += 1
        } else {
            try {
                doc = await GrupoModificadores.create({ ...grupo, ejemplo: true })
                resumen.grupos.creados += 1
            } catch (error) {
                if (error?.code !== 11000) throw error
                doc = await buscarGrupo(grupo.nombre) // otro seed lo creó a la vez
                resumen.grupos.existentes += 1
            }
        }
        // Un grupo existente desactivado por el admin no se asigna
        if (doc.activo !== false) idPorNombre[grupo.nombre] = doc._id
    }

    for (const [nombre, grupos] of Object.entries(ASIGNACIONES_EJEMPLO)) {
        if (!(await Producto.exists({ nombre }))) {
            resumen.productos.noEncontrados.push(nombre)
            continue
        }
        // Escritura condicional: solo si el producto todavía no tiene grupos (no pisa ediciones)
        const r = await Producto.updateOne(
            { nombre, $or: [{ gruposModificadores: { $exists: false } }, { gruposModificadores: { $size: 0 } }] },
            { $set: { gruposModificadores: grupos.map((g) => idPorNombre[g]).filter(Boolean) } },
        )
        resumen.productos[r.modifiedCount === 1 ? 'asignados' : 'conGrupos'] += 1
    }
    return resumen
}
