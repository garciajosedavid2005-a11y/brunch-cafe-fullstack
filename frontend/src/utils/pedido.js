// Ítems de POST /customer/orders: cada producto por su ObjectId (productoRef, 0.6).
// El precio no se envía: el backend lo toma del catálogo.
export const itemsDelPedido = (productos) =>
  productos.map(({ id, cantidad }) => ({ productoRef: id, cantidad }));
