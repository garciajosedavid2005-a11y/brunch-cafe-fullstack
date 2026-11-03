import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import { config } from '../src/config.js'
import Categoria from '../src/models/categoria.model.js'
import MenuImage from '../src/models/menuImage.model.js'
import Producto from '../src/models/producto.model.js'

const root = fileURLToPath(new URL('../../', import.meta.url))
const menuPath = resolve(root, 'frontend/src/data/menu.json')
const menu = JSON.parse(readFileSync(menuPath, 'utf8'))
const categoryDescriptions = {
  Desayunos: 'Platos tradicionales y gourmet para empezar la mañana con energía.',
  Postres: 'Delicias dulces y artesanales preparadas a diario.',
  'Pancakes y Waffles': 'Esponjosos y crujientes con toppings dulces y salados.',
  Tostadas: 'Tostadas en pan artesanal de masa madre con ingredientes frescos.',
  'Bowls Saludables': 'Opciones frescas, nutritivas y balanceadas para cada momento.',
  Bebidas: 'Café de especialidad, bebidas frías naturales y smoothies.',
}

const seed = async () => {
  await mongoose.connect(config.MONGO_URI)
  const categories = new Map()

  for (const product of menu) {
    let category = categories.get(product.categoria)
    if (!category) {
      category = await Categoria.findOneAndUpdate(
        { nombre: product.categoria },
        { $setOnInsert: { nombre: product.categoria, descripcion: categoryDescriptions[product.categoria] || '' } },
        { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
      )
      categories.set(product.categoria, category)
    }

    const imageName = basename(product.imagen)
    const imagePath = resolve(root, 'frontend/src/assets/menu', imageName)
    const imageData = await readFile(imagePath)
    const contentType = extname(imageName).toLowerCase() === '.png' ? 'image/png' : 'application/octet-stream'
    await MenuImage.findOneAndUpdate(
      { nombre: imageName },
      { $set: { contentType, data: imageData } },
      { upsert: true, setDefaultsOnInsert: true }
    )

    const precio = Number(String(product.precio).replace(/[^\d]/g, ''))
    if (!Number.isSafeInteger(precio)) {
      throw new Error(`Precio no válido para el producto "${product.nombre}".`)
    }

    let registro = await Producto.findOne({ codigo: product.id })
    if (!registro) registro = await Producto.findOne({ nombre: product.nombre })
    if (!registro) registro = new Producto()
    registro.set({
      codigo: product.id,
      nombre: product.nombre,
      descripcion: product.descripcion,
      precio,
      destacado: Boolean(product.destacado),
      categoria: category._id,
      imagen: `/productos/menu/imagenes/${encodeURIComponent(imageName)}`,
    })
    await registro.save()
  }

  console.log(`Menú migrado: ${menu.length} productos, ${categories.size} categorías y ${menu.length} imágenes.`)
}

try {
  await seed()
} catch (error) {
  console.error('No se pudo migrar el menú:', error)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
