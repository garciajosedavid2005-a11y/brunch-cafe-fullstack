// 2.6 · Cuentas con ítems «Listo para servir» a partir del plano (para el aviso de /staff)
export const textoMesas = (mesas) => `Mesa ${mesas.map((m) => m.numero).join(" + ")}`;

/** Cuentas del usuario con ítems listos, una vez por cuenta (las mesas unidas comparten la cuenta). */
export const cuentasConListos = (plano, usuarioId) => {
  const vistas = new Map();
  for (const mesa of plano?.mesas || []) {
    const c = mesa.cuenta;
    if (!c || c.listosParaServir <= 0 || c.mesero?.id !== usuarioId || vistas.has(c.id)) continue;
    vistas.set(c.id, { id: c.id, mesas: c.mesas, listos: c.listosParaServir });
  }
  return [...vistas.values()].sort((a, b) => a.mesas[0].numero - b.mesas[0].numero);
};
