// Fase 5 (F5-c) · Cantidades del inventario: existencias y recetas con hasta 3 decimales (0,5 unidad de
// aguacate) y costos por unidad de medida con hasta 2 decimales (el gramo de café cuesta menos de $1).
// Los montos (órdenes de compra, reportes) siguen siendo enteros en COP.
export const UNIDADES = ['g', 'ml', 'unidad']
export const ETIQUETA_UNIDAD = { g: 'g', ml: 'ml', unidad: 'unidad' }
export const MAX_CANTIDAD_INVENTARIO = 10_000_000 // 10 toneladas en gramos: tope contra errores de digitación
export const MAX_COSTO_UNITARIO = 10_000_000

/** Redondea a `decimales` sin arrastrar el error del punto flotante (0,1 + 0,2 → 0,3). */
export const redondear = (valor, decimales = 3) => {
    const factor = 10 ** decimales
    return Math.round((valor + Number.EPSILON) * factor) / factor
}

/** ¿Tiene como mucho `decimales` cifras decimales? */
export const conDecimales = (decimales) => (valor) => Number.isFinite(valor) && Number(valor.toFixed(decimales)) === valor
