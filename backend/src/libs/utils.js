// Convierte "Contra Entrega (Efectivo)" en "contra-entrega-efectivo"
// (usa "_" como separador para roles: "mesero_senior")
export const slug = (texto, separador = '-') =>
    String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, separador)
        .replace(new RegExp(`^${separador}+|${separador}+$`, 'g'), '')

// Quita las claves con valor undefined (para actualizar solo lo que llegó en el body)
export const sinUndefined = (objeto) =>
    Object.fromEntries(Object.entries(objeto).filter(([, valor]) => valor !== undefined))