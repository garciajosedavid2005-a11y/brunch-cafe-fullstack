// 6.6 (F6-5, F6-c) · Reglas de los puntos (decididas por Brayan). En un archivo sin dependencias: las usan el servicio
// de puntos y las invariantes del comprobante.
export const PESOS_POR_PUNTO = 1000
export const BLOQUE_CANJE = 100
export const VALOR_BLOQUE = 10000

/** Puntos que gana un pago de `consumoPagado` pesos (sin propina; redondea hacia abajo). */
export const puntosGanados = (consumoPagado) => Math.max(0, Math.floor(consumoPagado / PESOS_POR_PUNTO))

/** Pesos que descuenta canjear `puntos` (múltiplo de 100). */
export const descuentoPorPuntos = (puntos) => (puntos / BLOQUE_CANJE) * VALOR_BLOQUE

// 6.7 (F6-6, F6-d) · Cumpleaños: 10 % del consumo (sin propina), hacia abajo, en una compra del mes de cumpleaños
export const PORCENTAJE_CUMPLEANOS = 10

/** Pesos que descuenta el cumpleaños sobre `consumo` (entero, hacia abajo). */
export const descuentoCumpleanos = (consumo) => Math.max(0, Math.floor((consumo * PORCENTAJE_CUMPLEANOS) / 100))
