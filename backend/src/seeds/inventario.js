// Fase 5 · Inventario de ejemplo para desarrollo y capturas (seed:dev y BD de capturas). NUNCA en producción.
// Idempotente: crea solo los insumos que falten (por nombre); los existentes no se tocan. La existencia inicial
// queda como movimiento «inicial», como en un alta desde la pantalla.
import Insumo, { COLACION_INSUMO } from '../modulos/inventario/insumo.model.js'
import Receta from '../modulos/inventario/receta.model.js'
import Producto from '../modulos/catalogo/producto.model.js'
import GrupoModificadores, { COLACION_NOMBRE } from '../modulos/catalogo/grupoModificadores.model.js'
import { conTransaccion } from '../modulos/compartido/transacciones.js'
import { aplicarMovimientos } from '../modulos/inventario/movimientos.service.js'
import { registrarEvento } from '../modulos/compartido/estados.service.js'
import { fechaLocal } from '../modulos/compartido/fechas.js'
import { Proveedor } from '../modulos/inventario/compras.model.js'
import { crearProveedor, crearOrden, recibirOrden } from '../modulos/inventario/compras.service.js'

// nombre, unidad, existencia inicial, mínimo, costo por unidad de medida (COP)
export const INSUMOS_EJEMPLO = [
    ['Café en grano', 'g', 3000, 1000, 48],
    ['Leche entera', 'ml', 12000, 4000, 4.2],
    ['Leche deslactosada', 'ml', 4000, 2000, 4.8],
    ['Leche de almendra', 'ml', 1500, 2000, 12],
    ['Huevo', 'unidad', 90, 30, 600],
    ['Pan artesanal', 'unidad', 40, 15, 1200],
    ['Aguacate', 'unidad', 6, 8, 2500],
    ['Queso de cabra', 'g', 800, 300, 60],
    ['Espárragos', 'g', 1000, 300, 25],
    ['Tocineta', 'g', 1500, 500, 38],
    ['Queso campesino', 'g', 2000, 500, 22],
    ['Granola', 'g', 2500, 800, 20],
    ['Frutos rojos', 'g', 2000, 800, 30],
    ['Yogur griego', 'g', 3000, 1000, 14],
    ['Harina para pancakes', 'g', 5000, 1500, 6],
    ['Banano', 'unidad', 24, 10, 500],
    ['Mantequilla', 'g', 1500, 500, 30],
    ['Miel', 'g', 1200, 300, 28],
    ['Salmón ahumado', 'g', 600, 400, 140],
    ['Quinoa', 'g', 2000, 600, 18],
    ['Limón', 'unidad', 60, 20, 300],
    ['Hierbabuena', 'g', 300, 100, 40],
    ['Azúcar', 'g', 5000, 1000, 4],
    ['Hielo', 'g', 20000, 5000, 0.5],
    ['Mango', 'unidad', 12, 6, 2000],
    ['Té de jazmín', 'g', 400, 100, 90],
    ['Chocolate', 'g', 1500, 500, 45],
    ['Queso crema', 'g', 1800, 600, 32],
]

const SISTEMA = { id: null, rol: 'sistema' }

export const sembrarInsumosEjemplo = async () => {
    let creados = 0
    for (const [nombre, unidad, existencia, minimo, costoPromedio] of INSUMOS_EJEMPLO) {
        if (await Insumo.exists({ nombre }).collation(COLACION_INSUMO)) continue
        await conTransaccion(async (session) => {
            const [insumo] = await Insumo.create([{ nombre, unidad, minimo, costoPromedio }], { session })
            await aplicarMovimientos([{ insumo: insumo._id, cantidad: existencia, tipo: 'inicial' }], {
                motivo: 'inventario de ejemplo (seed)', sesion: SISTEMA, sistema: true, referencia: { tipo: 'insumo', id: insumo._id }, session,
            })
            await registrarEvento({
                entidad: 'insumo', entidadId: insumo._id, tipo: 'insumo_creado', actor: 'sistema', motivo: 'inventario de ejemplo (seed)',
                datos: { nombre, unidad, minimo, costoPromedio, existenciaInicial: existencia }, session,
            })
        })
        creados += 1
    }
    return { insumos: creados }
}

// 5.2 · Recetas por unidad vendida: [insumo, cantidad, % merma]
export const RECETAS_EJEMPLO = {
    'Desayuno clásico gourmet': [['Huevo', 2], ['Pan artesanal', 1], ['Mantequilla', 10], ['Queso campesino', 40], ['Café en grano', 9]],
    'Tostada de aguacate gourmet': [['Pan artesanal', 1], ['Aguacate', 1, 10], ['Huevo', 1]],
    'Omelette de espárragos y queso de cabra': [['Huevo', 3], ['Espárragos', 60, 15], ['Queso de cabra', 40], ['Mantequilla', 10]],
    'Bowl de granola con frutos rojos': [['Granola', 60], ['Yogur griego', 150], ['Frutos rojos', 60, 5], ['Miel', 15]],
    'Cheesecake de frutos rojos': [['Queso crema', 90], ['Frutos rojos', 40, 5], ['Azúcar', 25], ['Mantequilla', 15]],
    'Volcán de chocolate con helado': [['Chocolate', 60], ['Huevo', 1], ['Mantequilla', 25], ['Azúcar', 25]],
    'Panna cotta de vainilla y frutos': [['Leche entera', 150], ['Azúcar', 20], ['Frutos rojos', 40, 5]],
    'Crepas de mascarpone y frutos': [['Harina para pancakes', 70], ['Huevo', 1], ['Leche entera', 120], ['Queso crema', 50], ['Frutos rojos', 40, 5]],
    'Pancakes de banana con nueces': [['Harina para pancakes', 120], ['Huevo', 1], ['Leche entera', 150], ['Banano', 1], ['Miel', 20]],
    'Waffles belga con caramelo salado': [['Harina para pancakes', 130], ['Huevo', 1], ['Leche entera', 150], ['Mantequilla', 20], ['Azúcar', 30]],
    'Pancakes de matcha y chía': [['Harina para pancakes', 120], ['Huevo', 1], ['Leche entera', 150]],
    'Waffles de queso brie y pera': [['Harina para pancakes', 130], ['Huevo', 1], ['Leche entera', 150], ['Queso de cabra', 40]],
    'Tostadas francesas con berries': [['Pan artesanal', 2], ['Huevo', 2], ['Leche entera', 80], ['Frutos rojos', 50, 5]],
    'Tostada de salmón ahumado': [['Pan artesanal', 1], ['Salmón ahumado', 60, 5], ['Queso crema', 30]],
    'Tostada campesina con huevo': [['Pan artesanal', 1], ['Huevo', 2], ['Queso campesino', 50]],
    'Tostadas de ricotta y miel': [['Pan artesanal', 2], ['Queso crema', 60], ['Miel', 20]],
    'Bowl de açaí energético': [['Banano', 1], ['Granola', 40], ['Frutos rojos', 80, 5]],
    'Bowl mediterráneo con quinoa': [['Quinoa', 80], ['Aguacate', 0.5, 10], ['Queso de cabra', 30], ['Limón', 0.5]],
    'Bowl detox de kale y manzana': [['Quinoa', 60], ['Limón', 1], ['Miel', 10]],
    'Bowl de yogur griego y frutos secos': [['Yogur griego', 180], ['Granola', 40], ['Miel', 15]],
    'Limonada de hierbabuena': [['Limón', 2], ['Hierbabuena', 5, 20], ['Azúcar', 25], ['Hielo', 150]],
    'Latte frío artesanal': [['Café en grano', 18], ['Leche entera', 200], ['Hielo', 120]],
    'Té helado de jazmín': [['Té de jazmín', 4], ['Azúcar', 20], ['Limón', 0.5], ['Hielo', 150]],
    'Smoothie de mango y jengibre': [['Mango', 1, 15], ['Yogur griego', 100], ['Miel', 15], ['Hielo', 100]],
}

// Opciones: [grupo, opción, [[insumo, cantidad, % merma, reemplaza]]]
export const RECETAS_OPCIONES_EJEMPLO = [
    ['Leche', 'Deslactosada', [['Leche deslactosada', 200, 0, 'Leche entera']]],
    ['Leche', 'Almendra', [['Leche de almendra', 200, 0, 'Leche entera']]],
    ['Tamaño', 'Grande', [['Leche entera', 100], ['Café en grano', 9]]],
    ['Extras', 'Huevo adicional', [['Huevo', 1]]],
    ['Extras', 'Tocineta', [['Tocineta', 40, 10]]],
    ['Extras', 'Aguacate', [['Aguacate', 0.5, 10]]],
    ['Extras', 'Queso', [['Queso campesino', 30]]],
]

const sinTildes = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Crea las recetas que falten (por producto u opción); las existentes no se tocan. */
export const sembrarRecetasEjemplo = async () => {
    const insumos = new Map((await Insumo.find().lean()).map((i) => [sinTildes(i.nombre), i._id]))
    const lineas = (filas) => filas.map(([insumo, cantidad, merma = 0, reemplaza]) => ({
        insumo: insumos.get(sinTildes(insumo)), cantidad, merma, reemplaza: reemplaza ? insumos.get(sinTildes(reemplaza)) : null,
    })).filter((l) => l.insumo && (l.reemplaza !== undefined))
    const productos = new Map((await Producto.find().select('nombre').lean()).map((p) => [sinTildes(p.nombre), p._id]))
    let creadas = 0
    for (const [nombre, filas] of Object.entries(RECETAS_EJEMPLO)) {
        const producto = productos.get(sinTildes(nombre))
        if (!producto || await Receta.exists({ tipo: 'producto', producto })) continue
        await Receta.create({ tipo: 'producto', producto, lineas: lineas(filas) })
        creadas += 1
    }
    for (const [grupoNombre, opcionNombre, filas] of RECETAS_OPCIONES_EJEMPLO) {
        const grupo = await GrupoModificadores.findOne({ nombre: grupoNombre }).collation(COLACION_NOMBRE).lean()
        const opcion = grupo?.opciones.find((o) => sinTildes(o.nombre) === sinTildes(opcionNombre))
        if (!opcion || await Receta.exists({ tipo: 'opcion', grupo: grupo._id, opcion: opcion._id })) continue
        await Receta.create({ tipo: 'opcion', grupo: grupo._id, opcion: opcion._id, lineas: lineas(filas) })
        creadas += 1
    }
    return { recetas: creadas }
}

export const sembrarInventarioEjemplo = async () => ({ ...(await sembrarInsumosEjemplo()), ...(await sembrarRecetasEjemplo()) })

const sumarDias = (n) => fechaLocal(new Date(Date.now() + n * 86_400_000))

/**
 * 5.4 y 5.5 · Proveedores y órdenes de ejemplo (solo si aún no hay proveedores): una orden abierta y otra recibida
 * en parte, con lotes que vencen en 3 y 5 días (para ver las alertas). Las hace `autor` (un usuario *.dev con «*»)
 * con los mismos servicios de la API.
 */
export const sembrarComprasEjemplo = async (autor) => {
    if (!autor || await Proveedor.exists({})) return { ordenes: 0 }
    const sesion = { id: String(autor._id), rol: 'admin', permisos: ['*'] }
    const porNombre = new Map((await Insumo.find().lean()).map((i) => [sinTildes(i.nombre), String(i._id)]))
    const insumo = (nombre) => porNombre.get(sinTildes(nombre))
    if (!insumo('Leche entera') || !insumo('Café en grano') || !insumo('Yogur griego')) return { ordenes: 0 }
    const lacteos = await crearProveedor({ nombre: 'Lácteos del Huila', nit: '900456789', contacto: 'Marta Rojas', telefono: '3001234567' }, sesion)
    const tostadores = await crearProveedor({ nombre: 'Tostadores de Pitalito', nit: '901112223', contacto: 'Andrés Cruz', telefono: '3109876543' }, sesion)
    await crearOrden({ proveedorId: tostadores.id, lineas: [{ insumoId: insumo('Café en grano'), cantidad: 5000, costoUnitario: 46 }], notas: 'Tueste medio' }, sesion)
    const orden = await crearOrden({
        proveedorId: lacteos.id,
        lineas: [{ insumoId: insumo('Leche entera'), cantidad: 12000, costoUnitario: 4.4 }, { insumoId: insumo('Yogur griego'), cantidad: 3000, costoUnitario: 15 }],
    }, sesion)
    await recibirOrden(orden.id, {
        versionEsperada: orden.version,
        lineas: [
            { lineaId: orden.lineas[0].id, cantidad: 6000, vencimiento: sumarDias(3) },
            { lineaId: orden.lineas[1].id, cantidad: 3000, costoUnitario: 15.5, vencimiento: sumarDias(5) },
        ],
        nota: 'Faltó la mitad de la leche',
    }, sesion)
    return { ordenes: 2 }
}
