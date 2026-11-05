// Seed del menú inicial desde backend/seed-data/ (menu.json + imagenes/).
// Idempotente y conservador: crea lo que falta y NO modifica lo que ya existe
// (precios, descripciones, disponibilidad o destacados editados en el admin).
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { z } from 'zod'
import Categoria from '../models/categoria.model.js'
import MenuImage from '../models/menuImage.model.js'
import Producto from '../models/producto.model.js'
import { PREFIJO_URL } from '../libs/imagenesProducto.js'

export const DIRECTORIO_SEED = resolve(import.meta.dirname, '../../seed-data')

const TIPOS = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

const menuSchema = z.object({
    categorias: z.array(z.object({
        nombre: z.string().trim().min(1),
        descripcion: z.string().trim().max(200).default(''),
    })).min(1),
    productos: z.array(z.object({
        codigo: z.number().int().min(1),
        nombre: z.string().trim().min(1),
        descripcion: z.string().trim().default(''),
        precio: z.number({ error: 'El precio debe ser un número entero en COP' }).int().min(0),
        categoria: z.string().trim().min(1),
        imagen: z.string().regex(/^[\w.-]+\.(png|jpe?g|webp)$/i, { error: 'Imagen: nombre de archivo PNG/JPG/WEBP' }),
        destacado: z.boolean().default(false),
    })).min(1),
})

/** Lee y valida menu.json; falla antes de escribir nada en la BD. */
export const leerMenu = (directorio = DIRECTORIO_SEED) => {
    const parsed = menuSchema.safeParse(JSON.parse(readFileSync(join(directorio, 'menu.json'), 'utf8')))
    if (!parsed.success) {
        const issue = parsed.error.issues[0]
        throw new Error(`menu.json inválido en ${issue.path.join('.')}: ${issue.message}`)
    }
    const menu = parsed.data
    const categorias = new Set(menu.categorias.map((c) => c.nombre))
    const codigos = new Set()
    for (const producto of menu.productos) {
        if (codigos.has(producto.codigo)) throw new Error(`menu.json: código repetido ${producto.codigo}`)
        codigos.add(producto.codigo)
        if (!categorias.has(producto.categoria)) throw new Error(`menu.json: "${producto.nombre}" usa la categoría inexistente "${producto.categoria}"`)
        if (!existsSync(join(directorio, 'imagenes', producto.imagen))) throw new Error(`Falta la imagen ${producto.imagen} de "${producto.nombre}"`)
    }
    return menu
}

export const sembrarMenu = async ({ directorio = DIRECTORIO_SEED } = {}) => {
    const menu = leerMenu(directorio)
    const resumen = {
        categorias: { creadas: 0, existentes: 0 },
        imagenes: { creadas: 0, existentes: 0 },
        productos: { creados: 0, existentes: 0 },
    }
    const contar = (grupo, creado) => {
        const [nuevos, existentes] = Object.keys(resumen[grupo])
        resumen[grupo][creado ? nuevos : existentes] += 1
    }

    // upsert con $setOnInsert: crea si falta, no toca lo existente
    const insertarSiFalta = async (Modelo, filtro, datos) => {
        const r = await Modelo.updateOne(filtro, { $setOnInsert: datos }, { upsert: true, setDefaultsOnInsert: true })
        return r.upsertedCount === 1
    }

    const idCategoria = {}
    for (const { nombre, descripcion } of menu.categorias) {
        contar('categorias', await insertarSiFalta(Categoria, { nombre }, { nombre, descripcion }))
        idCategoria[nombre] = (await Categoria.findOne({ nombre }).select('_id'))._id
    }

    for (const producto of menu.productos) {
        const archivo = producto.imagen
        contar('imagenes', await insertarSiFalta(MenuImage, { nombre: archivo }, {
            nombre: archivo,
            contentType: TIPOS[extname(archivo).toLowerCase()],
            data: readFileSync(join(directorio, 'imagenes', archivo)),
        }))

        // Un producto existe si coincide el código o el nombre (BD sembradas antes del código)
        const existe = await Producto.exists({ $or: [{ codigo: producto.codigo }, { nombre: producto.nombre }] })
        if (existe) {
            contar('productos', false)
            continue
        }
        await Producto.create({
            codigo: producto.codigo,
            nombre: producto.nombre,
            descripcion: producto.descripcion,
            precio: producto.precio,
            destacado: producto.destacado,
            categoria: idCategoria[producto.categoria],
            imagen: `${PREFIJO_URL}${encodeURIComponent(archivo)}`,
        })
        contar('productos', true)
    }
    return resumen
}
