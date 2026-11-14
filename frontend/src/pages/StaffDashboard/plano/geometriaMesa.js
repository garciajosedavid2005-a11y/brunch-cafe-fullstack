// 2.6c · Geometría de la mesa dibujada (DibujoMesa.jsx): forma por capacidad, sillas y anillo del tiempo.

export const ESCALA = 0.6;
const BORDE = 14; // distancia del centro de la silla al borde del dibujo
const HOLGURA = 9; // del tablero al anillo

export const nivelTiempo = (minutos) => (minutos >= 90 ? "alerta" : minutos >= 60 ? "aviso" : "normal");
/** El anillo se llena en 2 h. */
export const progresoAnillo = (minutos) => Math.min(100, Math.max(0, Math.round((minutos / 120) * 100)));

const rectanguloDesdeArriba = (x, y, w, h, r) => {
  const cx = x + w / 2;
  return `M${cx} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`
    + ` H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`;
};
const circuloDesdeArriba = (cx, cy, r) => `M${cx} ${cy - r} A${r} ${r} 0 1 1 ${cx} ${cy + r} A${r} ${r} 0 1 1 ${cx} ${cy - r}`;

/**
 * Forma, tableros, sillas ([x, y, ángulo]) y anillo según la capacidad y cuántas mesas forman la pieza:
 * redonda hasta 2 puestos, cuadrada hasta 4, rectangular desde 5 y «unida» con varias mesas.
 */
export const geometriaMesa = (capacidad, mesas = 1) => {
  const puestos = Math.max(0, capacidad);
  if (mesas === 1 && puestos <= 2) {
    const sillas = [[BORDE, 65, 90], [150 - BORDE, 65, 270]].slice(0, puestos);
    return { forma: "redonda", ancho: 150, alto: 130, centro: [75, 65], tableros: [{ circulo: [75, 65, 34] }], uniones: [], sillas, anillo: circuloDesdeArriba(75, 65, 34 + HOLGURA + 1) };
  }
  if (mesas === 1 && puestos <= 4) {
    const sillas = [[75, BORDE, 180], [150 - BORDE, 75, 270], [75, 150 - BORDE, 0], [BORDE, 75, 90]].slice(0, puestos);
    return { forma: "cuadrada", ancho: 150, alto: 150, centro: [75, 75], tableros: [{ rect: [37, 37, 76, 76] }], uniones: [], sillas, anillo: rectanguloDesdeArriba(37 - HOLGURA, 37 - HOLGURA, 76 + 2 * HOLGURA, 76 + 2 * HOLGURA, 14) };
  }
  const extremos = Math.min(puestos, 2);
  const laterales = puestos - extremos;
  const arriba = Math.ceil(laterales / 2);
  const abajo = laterales - arriba;
  const hueco = 10;
  const anchoTablero = Math.max(76 * mesas + hueco * (mesas - 1), Math.max(arriba, 1) * 34 + 16);
  const x0 = 37;
  const ancho = anchoTablero + 2 * x0;
  const alto = 150;
  const anchoUno = (anchoTablero - hueco * (mesas - 1)) / mesas;
  const tableros = Array.from({ length: mesas }, (_, i) => ({ rect: [x0 + i * (anchoUno + hueco), 37, anchoUno, 76] }));
  const uniones = Array.from({ length: mesas - 1 }, (_, i) => [x0 + (i + 1) * anchoUno + i * hueco - 3, 60, hueco + 6, 30]);
  const fila = (n, y, angulo) => Array.from({ length: n }, (_, i) => [x0 + (anchoTablero * (i + 0.5)) / n, y, angulo]);
  const sillas = [...fila(arriba, BORDE, 180), ...(extremos > 1 ? [[ancho - BORDE, 75, 270]] : []), ...fila(abajo, alto - BORDE, 0), ...(extremos > 0 ? [[BORDE, 75, 90]] : [])];
  return {
    forma: mesas > 1 ? "unida" : "rectangular", ancho, alto, centro: [ancho / 2, 75], tableros, uniones, sillas,
    anillo: rectanguloDesdeArriba(x0 - HOLGURA, 37 - HOLGURA, anchoTablero + 2 * HOLGURA, 76 + 2 * HOLGURA, 14),
  };
};
