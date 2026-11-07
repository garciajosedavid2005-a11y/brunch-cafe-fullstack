// 1.3 · Estación efectiva de un producto (F1-3). ÚNICA regla: la estación propia del producto
// manda; si no tiene, la de su categoría; si ninguna, null (categoría anterior a migrate:1.3;
// la comanda de 1.4 la rechaza). Recibe documentos o lean() con `estacion` como ObjectId o poblada.
export const estacionEfectiva = (producto, categoria) => producto?.estacion || categoria?.estacion || null
