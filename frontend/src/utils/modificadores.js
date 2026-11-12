import { formatearCOP } from "./moneda";

// 1.12 · Opciones de un plato en texto, igual en la comanda del salón, el carrito, «Mis pedidos»,
// el admin y el panel de pedidos del staff: «Término del huevo: Fritos · Extras: Tocineta (+ $ 3.000)».

/** [{ grupo, opcion, precioExtra }] (forma del staff y de las cuentas) → texto agrupado por grupo. */
export const textoModificadores = (modificadores = []) => {
  const grupos = new Map();
  for (const m of modificadores) {
    const opcion = m.precioExtra > 0 ? `${m.opcion} (+ ${formatearCOP(m.precioExtra)})` : m.opcion;
    grupos.set(m.grupo, [...(grupos.get(m.grupo) || []), opcion]);
  }
  return [...grupos].map(([grupo, opciones]) => `${grupo}: ${opciones.join(", ")}`).join(" · ");
};

/** Opciones de «Mis pedidos» ({ group, option, extraPrice }) → forma común. */
export const deOpcionesCliente = (options = []) =>
  options.map((o) => ({ grupo: o.group, opcion: o.option, precioExtra: o.extraPrice }));

/** Línea del carrito ([{ grupoId, grupo, opciones: [{ id, nombre, precioExtra }] }]) → forma común. */
export const deLineaCarrito = (modificadores = []) =>
  modificadores.flatMap((g) => g.opciones.map((o) => ({ grupo: g.grupo, opcion: o.nombre, precioExtra: o.precioExtra })));
