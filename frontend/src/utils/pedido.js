// Cantidad máxima por línea que acepta el pedido a domicilio (backend: 1–20)
export const MAX_CANTIDAD_LINEA = 20;

// Ítems de POST /cliente/pedidos: cada producto por su ObjectId (productoRef, 0.6).
// El precio no se envía: el backend lo toma del catálogo. 1.12: también las opciones elegidas
// (solo sus ids) y la nota de la línea, si las hay.
export const itemsDelPedido = (productos) =>
  productos.map(({ id, cantidad, modificadores = [], nota = "" }) => ({
    productoRef: id,
    cantidad,
    ...(nota ? { nota } : {}),
    ...(modificadores.length
      ? { modificadores: modificadores.map((g) => ({ grupoId: g.grupoId, opcionIds: g.opciones.map((o) => o.id) })) }
      : {}),
  }));

// 1.14 · Qué líneas del carrito marcar cuando el servidor rechaza el pedido: { [linea]: motivo }.
// Los errores de una línea traen `details.lineas` (índices de `items`, en el orden del carrito) y
// los de validación, `[{ campo: "items.N...", mensaje }]`. Los demás (hora, método de pago) no marcan.
export const problemasPorLinea = (error, productos) => {
  const problemas = {};
  const marcar = (indice, motivo) => {
    const linea = productos[indice]?.linea;
    if (linea !== undefined && !problemas[linea]) problemas[linea] = motivo;
  };
  const { details } = error || {};
  if (Array.isArray(details)) {
    for (const { campo = "", mensaje } of details) {
      const indice = /^items\.(\d+)(\.|$)/.exec(campo)?.[1];
      if (indice !== undefined) marcar(Number(indice), mensaje);
    }
  } else if (Array.isArray(details?.lineas)) {
    for (const indice of details.lineas) marcar(indice, error.message);
  }
  return problemas;
};

/** Termina la frase con punto si no lo trae (los mensajes de Zod no lo llevan). */
export const conPunto = (texto = "") => (/[.!?…]$/.test(texto.trim()) ? texto.trim() : `${texto.trim()}.`);
