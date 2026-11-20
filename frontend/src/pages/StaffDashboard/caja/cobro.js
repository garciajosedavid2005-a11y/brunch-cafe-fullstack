// Fase 3 · Cálculos del cobro en la pantalla (el backend los vuelve a validar: PAGO_NO_CUADRA,
// EFECTIVO_INSUFICIENTE). Montos en COP enteros.
export const METODOS = [
  { codigo: "efectivo", etiqueta: "Efectivo" },
  { codigo: "tarjeta", etiqueta: "Tarjeta" },
  { codigo: "transferencia", etiqueta: "Transferencia" },
];
export const etiquetaMetodo = (codigo) => METODOS.find((m) => m.codigo === codigo)?.etiqueta || codigo;

/** Mesa o mesas de la cuenta; 6.3 · en una para llevar, «Para llevar · nombre» (o el teléfono). */
export const mesasTexto = (mesas = []) => (mesas.length > 1 ? `Mesas ${mesas.join(" + ")}` : `Mesa ${mesas[0] ?? "—"}`);
export const origenCuenta = (c) => (c?.paraLlevar
  ? `Para llevar · ${c.paraLlevar.nombre || c.paraLlevar.telefono}`
  : mesasTexto(c?.mesas));

/** Texto de un campo de pesos → entero (solo dígitos: «$ 33.000» → 33000; vacío → 0). */
export const pesos = (texto) => {
  const digitos = String(texto ?? "").replace(/\D/g, "").slice(0, 9);
  return digitos ? Number(digitos) : 0;
};

/** F3-3 · Atajo «10 %» de la propina sobre el consumo, redondeado al peso. */
export const propinaSugerida = (consumo) => Math.round(consumo * 0.1);

/**
 * Estado de los pagos frente a lo que hay que cobrar: cuánto falta o sobra, el cambio del efectivo y
 * si ya se puede cobrar (suma exacta, cada pago > 0 y el efectivo recibido alcanza).
 */
export const estadoPagos = (pagos, totalACobrar) => {
  const suma = pagos.reduce((n, p) => n + p.monto, 0);
  const filas = pagos.map((p) => {
    if (p.metodo !== "efectivo") return { ...p, cambio: null, falta: 0 };
    const recibido = p.recibido ?? p.monto;
    return { ...p, cambio: Math.max(0, recibido - p.monto), falta: Math.max(0, p.monto - recibido) };
  });
  const restante = totalACobrar - suma;
  const valido = restante === 0 && filas.every((p) => p.monto > 0 && p.falta === 0);
  return { suma, restante, filas, valido, cambio: filas.reduce((n, p) => n + (p.cambio ?? 0), 0) };
};

/** Cuerpo para POST …/cobrar: `recibido` solo en efectivo. */
// 6.6 · Canje de puntos (el backend lo vuelve a validar): bloques de 100 = $10.000
export const BLOQUE_PUNTOS = 100;
export const VALOR_BLOQUE = 10000;

// 6.7 · 10 % de cumpleaños sobre el consumo, hacia abajo (el backend calcula y valida lo mismo)
export const descuentoCumpleanos = (consumo, porcentaje = 10) => Math.max(0, Math.floor((consumo * porcentaje) / 100));

export const cuerpoCobro = ({ versionEsperada, propina, pagos, canjearPuntos = 0, aplicarCumpleanos = false }) => ({
  versionEsperada,
  propina,
  ...(canjearPuntos > 0 ? { canjearPuntos } : {}),
  ...(aplicarCumpleanos ? { aplicarCumpleanos: true } : {}),
  pagos: pagos.map((p) => (p.metodo === "efectivo"
    ? { metodo: p.metodo, monto: p.monto, recibido: p.recibido ?? p.monto }
    : { metodo: p.metodo, monto: p.monto })),
});

// 3b.2 · División en partes iguales (el backend la vuelve a calcular): el residuo va de a $1 en las primeras
export const MAX_PARTES = 20;
export const montoParte = (total, partes, k) => Math.floor(total / partes) + (k <= total % partes ? 1 : 0);
