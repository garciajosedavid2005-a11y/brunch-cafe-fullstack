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
