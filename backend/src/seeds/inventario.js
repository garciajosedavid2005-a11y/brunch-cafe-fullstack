// Fase 5 · Inventario de ejemplo para desarrollo y capturas (seed:dev y BD de capturas). NUNCA en producción.
// Idempotente: crea solo los insumos que falten (por nombre); los existentes no se tocan. La existencia inicial
// queda como movimiento «inicial», como en un alta desde la pantalla.
import Insumo, { COLACION_INSUMO } from '../modulos/inventario/insumo.model.js'
import { conTransaccion } from '../modulos/compartido/transacciones.js'
import { aplicarMovimientos } from '../modulos/inventario/movimientos.service.js'
import { registrarEvento } from '../modulos/compartido/estados.service.js'

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

export const sembrarInventarioEjemplo = async () => ({ ...(await sembrarInsumosEjemplo()) })
