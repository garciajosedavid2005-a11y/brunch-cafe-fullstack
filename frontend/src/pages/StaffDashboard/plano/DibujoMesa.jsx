// 2.6c · Propuesta B del plano (elegida por Brayan el 2026-11-14): la mesa dibujada desde arriba, con una
// silla por puesto (rellenas según los comensales), el número grande al centro y el anillo del tiempo
// ocupada (cambia a los 60 y a los 90 min). Las mesas unidas son una sola pieza con un tablero por mesa.
// Es decorativo (aria-hidden): el botón de la mesa dice todo en su nombre accesible y en texto.

import { ESCALA, geometriaMesa, nivelTiempo, progresoAnillo } from "./geometriaMesa";

function Silla({ x, y, angulo, ocupada }) {
  // Asiento hacia la mesa y respaldo hacia fuera (en coordenadas de la silla, «fuera» es +y)
  return (
    <g transform={`translate(${x} ${y}) rotate(${angulo})`} className="dibujo-mesa__silla" data-silla={ocupada ? "ocupada" : "libre"}>
      <rect x="-11" y="-8" width="22" height="13" rx="4" className="dibujo-mesa__asiento" />
      <rect x="-12" y="6" width="24" height="5" rx="2.5" className="dibujo-mesa__respaldo" />
    </g>
  );
}

export default function DibujoMesa({ numero, capacidad, mesas = 1, comensales = 0, minutos = null }) {
  const g = geometriaMesa(capacidad, mesas);
  const conTiempo = Number.isFinite(minutos);
  const [cx, cy] = g.centro;
  return (
    <svg className={`dibujo-mesa dibujo-mesa--${g.forma}`} viewBox={`0 0 ${g.ancho} ${g.alto}`}
      width={Math.round(g.ancho * ESCALA)} height={Math.round(g.alto * ESCALA)} aria-hidden="true" focusable="false">
      {g.sillas.map(([x, y, a], i) => <Silla key={i} x={x} y={y} angulo={a} ocupada={i < comensales} />)}
      {conTiempo && (
        <>
          <path d={g.anillo} className="dibujo-mesa__anillo dibujo-mesa__anillo--pista" />
          <path d={g.anillo} pathLength="100" strokeDasharray={`${progresoAnillo(minutos)} 100`}
            className={`dibujo-mesa__anillo dibujo-mesa__anillo--${nivelTiempo(minutos)}`} data-anillo={nivelTiempo(minutos)} />
        </>
      )}
      {g.uniones.map(([x, y, w, h], i) => <rect key={`u${i}`} x={x} y={y} width={w} height={h} className="dibujo-mesa__union" />)}
      {g.tableros.map((t, i) => (t.circulo
        ? <circle key={i} cx={t.circulo[0]} cy={t.circulo[1]} r={t.circulo[2]} className="dibujo-mesa__tablero" />
        : <rect key={i} x={t.rect[0]} y={t.rect[1]} width={t.rect[2]} height={t.rect[3]} rx="10" className="dibujo-mesa__tablero" />))}
      <text x={cx} y={cy + 2} className="dibujo-mesa__numero" textAnchor="middle" dominantBaseline="middle"
        fontSize={String(numero).length > 3 ? 24 : 30}>{numero}</text>
    </svg>
  );
}
