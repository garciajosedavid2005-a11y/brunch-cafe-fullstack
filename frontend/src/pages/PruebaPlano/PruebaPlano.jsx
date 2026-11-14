import { useSearchParams, Link } from "react-router-dom";
import { BellRing, Clock } from "lucide-react";
import { ESTADOS_MESA, formatearMinutos } from "../StaffDashboard/plano/estadosMesa";
import { formatearCOP } from "../../utils/moneda";
import "./PruebaPlano.css";

// 2.6c · Página de prueba SOLO DE DESARROLLO (la ruta solo existe con import.meta.env.DEV): tres propuestas
// del plano del salón con los mismos datos de ejemplo. No toca el plano real; se borra al elegir una.

const ZONAS = [
  { id: "interior", nombre: "Interior", caja: { x: 2, y: 2, w: 58, h: 96 } },
  { id: "terraza", nombre: "Terraza", caja: { x: 63, y: 2, w: 35, h: 96 } },
];

// posicion = campo Mesa.posicion (enteros 0–100 del salón): lo usa la propuesta C
const MESAS = [
  { numero: 1, zona: "interior", capacidad: 2, estado: "ocupada", comensales: 2, minutos: 35, mesero: "Laura Gómez", total: 38000, listos: 0, posicion: { x: 12, y: 24 } },
  { numero: 2, zona: "interior", capacidad: 2, estado: "ocupada", comensales: 1, minutos: 4, mesero: "Andrés Ruiz", total: 0, listos: 0, posicion: { x: 30, y: 24 } },
  { numero: 3, zona: "interior", capacidad: 4, estado: "cuenta_pedida", comensales: 3, minutos: 95, mesero: "Andrés Ruiz", total: 124500, listos: 0, posicion: { x: 48, y: 24 } },
  { numero: 4, zona: "interior", capacidad: 6, estado: "bloqueada", comensales: 0, posicion: { x: 18, y: 68 } },
  { numero: 8, zona: "interior", capacidad: 2, estado: "libre", comensales: 0, posicion: { x: 46, y: 68 } },
  { numero: 5, unidaCon: 6, zona: "terraza", capacidad: 8, estado: "ocupada", comensales: 7, minutos: 70, mesero: "Laura Gómez", total: 286000, listos: 2, posicion: { x: 80, y: 30 } },
  { numero: 7, zona: "terraza", capacidad: 4, estado: "por_limpiar", comensales: 0, posicion: { x: 80, y: 68 } },
];

const TOTAL_MESAS = MESAS.reduce((n, m) => n + (m.unidaCon ? 2 : 1), 0);
const OCUPADAS = MESAS.filter((m) => ["ocupada", "cuenta_pedida"].includes(m.estado)).reduce((n, m) => n + (m.unidaCon ? 2 : 1), 0);

const VARIANTES = {
  a: { titulo: "A · Minimalista plana", nota: "Formas planas, mucho aire, la información justa." },
  b: { titulo: "B · Ilustrada con sillas", nota: "Mesas de madera con sombra y sillas con respaldo, sobre el piso del salón." },
  c: { titulo: "C · Plano arquitectónico con zonas", nota: "Muros, puertas y zonas; cada mesa en su posición real del salón." },
};

const iniciales = (nombre = "") => nombre.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
const nivelTiempo = (min) => (min >= 90 ? "alerta" : min >= 60 ? "aviso" : "normal");
const forma = (m) => (m.unidaCon ? "unida" : m.capacidad <= 2 ? "redonda" : m.capacidad <= 4 ? "cuadrada" : "rectangular");

// Geometría de cada forma (unidades del SVG): mesa, anillo y sillas (x, y, ángulo)
const GEOMETRIA = {
  redonda: { w: 150, h: 130, sillas: [[19, 65, 90], [131, 65, 270]] },
  cuadrada: { w: 150, h: 150, sillas: [[75, 17, 180], [131, 75, 270], [75, 133, 0], [19, 75, 90]] },
  rectangular: { w: 210, h: 150, sillas: [[75, 17, 180], [135, 17, 180], [191, 75, 270], [135, 133, 0], [75, 133, 0], [19, 75, 90]] },
  unida: { w: 230, h: 150, sillas: [[58, 17, 180], [93, 17, 180], [137, 17, 180], [172, 17, 180], [58, 133, 0], [93, 133, 0], [137, 133, 0], [172, 133, 0]] },
};

function Silla({ x, y, angulo, ocupada, variante }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angulo})`} className={`pp-silla${ocupada ? " pp-silla--ocupada" : ""}`}>
      {variante === "b" && <rect x="-13" y="-12" width="26" height="6" rx="3" className="pp-silla__respaldo" />}
      <rect x="-11" y="-7" width="22" height="15" rx={variante === "c" ? 1 : 5} className="pp-silla__asiento" />
    </g>
  );
}

function Tablero({ m, f, variante }) {
  const props = { className: "pp-tablero" };
  const anillo = { className: "pp-anillo" };
  const progreso = m.minutos != null ? Math.min(100, Math.round((m.minutos / 120) * 100)) : null;
  const anilloDe = (el) => progreso != null && (
    <>
      {el({ ...anillo, className: "pp-anillo pp-anillo--pista" })}
      {el({ ...anillo, className: `pp-anillo pp-anillo--${nivelTiempo(m.minutos)}`, pathLength: 100, strokeDasharray: `${progreso} 100` })}
    </>
  );
  if (f === "redonda") return (
    <>
      {anilloDe((p) => <circle cx="75" cy="65" r="45" transform="rotate(-90 75 65)" {...p} />)}
      <circle cx="75" cy="65" r="36" {...props} />
    </>
  );
  if (f === "cuadrada") return (
    <>
      {anilloDe((p) => <rect x="27" y="27" width="96" height="96" rx="14" {...p} />)}
      <rect x="35" y="35" width="80" height="80" rx={variante === "c" ? 2 : 10} {...props} />
    </>
  );
  if (f === "rectangular") return (
    <>
      {anilloDe((p) => <rect x="27" y="27" width="156" height="96" rx="14" {...p} />)}
      <rect x="35" y="35" width="140" height="80" rx={variante === "c" ? 2 : 10} {...props} />
    </>
  );
  return (
    <>
      {anilloDe((p) => <rect x="27" y="27" width="176" height="96" rx="14" {...p} />)}
      <rect x="35" y="35" width="76" height="80" rx={variante === "c" ? 2 : 10} {...props} />
      <rect x="119" y="35" width="76" height="80" rx={variante === "c" ? 2 : 10} {...props} />
      <rect x="105" y="62" width="20" height="26" className="pp-union" />
    </>
  );
}

function Mesa({ m, variante, enPlano }) {
  const f = forma(m);
  const g = GEOMETRIA[f];
  const { etiqueta, icono: Icono } = ESTADOS_MESA[m.estado];
  const numero = m.unidaCon ? `${m.numero}+${m.unidaCon}` : String(m.numero);
  const estilo = enPlano ? { left: `${m.posicion.x}%`, top: `${m.posicion.y}%` } : undefined;
  return (
    <button type="button" className={`pp-mesa pp-mesa--${m.estado} pp-mesa--${f}`} style={estilo}
      aria-label={`Mesa ${numero}, ${etiqueta}${m.comensales ? `, ${m.comensales} de ${m.capacidad} personas` : `, ${m.capacidad} puestos`}`}>
      {m.listos > 0 && <span className="pp-listo"><BellRing size={14} aria-hidden="true" /> Listo para servir ({m.listos})</span>}
      <svg viewBox={`0 0 ${g.w} ${g.h}`} width={g.w * 0.78} height={g.h * 0.78} aria-hidden="true" className="pp-dibujo">
        {g.sillas.map(([x, y, a], i) => <Silla key={i} x={x} y={y} angulo={a} ocupada={i < m.comensales} variante={variante} />)}
        <Tablero m={m} f={f} variante={variante} />
        <text x={g.w / 2} y={(f === "redonda" ? 65 : 75) + 2} className="pp-numero" dominantBaseline="middle" textAnchor="middle">{numero}</text>
      </svg>
      <span className="pp-estado"><Icono size={15} aria-hidden="true" /> {etiqueta}</span>
      {m.mesero && (
        <span className="pp-detalle">
          <span className="pp-mesero" title={m.mesero}>{iniciales(m.mesero)}</span>
          <span className={`pp-tiempo pp-tiempo--${nivelTiempo(m.minutos)}`}><Clock size={13} aria-hidden="true" /> {formatearMinutos(m.minutos)}</span>
          {m.total > 0 && <span className="pp-total">{formatearCOP(m.total)}</span>}
        </span>
      )}
    </button>
  );
}

function Resumen() {
  const cuenta = (e) => MESAS.filter((m) => m.estado === e).reduce((n, m) => n + (m.unidaCon ? 2 : 1), 0);
  return (
    <div className="pp-resumen">
      <p className="pp-resumen__principal"><strong>{OCUPADAS} de {TOTAL_MESAS}</strong> mesas ocupadas</p>
      <ul className="pp-leyenda">
        {Object.entries(ESTADOS_MESA).map(([codigo, estado]) => {
          const Icono = estado.icono;
          return <li key={codigo} className={`pp-leyenda__item pp-mesa--${codigo}`}><span className="pp-leyenda__muestra" aria-hidden="true" /><Icono size={14} aria-hidden="true" /> {estado.etiqueta} · {cuenta(codigo)}</li>;
        })}
        <li className="pp-leyenda__item pp-leyenda__anillo">Anillo: tiempo ocupada (ámbar ≥ 60 min, rojo ≥ 90)</li>
      </ul>
    </div>
  );
}

export default function PruebaPlano() {
  const [params] = useSearchParams();
  const v = VARIANTES[params.get("v")] ? params.get("v") : "a";
  return (
    <main className={`pp pp--${v}`}>
      <header className="pp-cabecera">
        <div>
          <h1>{VARIANTES[v].titulo}</h1>
          <p className="pp-cabecera__nota">Página de prueba con datos de ejemplo · {VARIANTES[v].nota}</p>
        </div>
        <nav aria-label="Propuestas">
          {Object.keys(VARIANTES).map((k) => <Link key={k} to={`?v=${k}`} aria-current={k === v ? "page" : undefined}>{k.toUpperCase()}</Link>)}
        </nav>
      </header>
      <Resumen />
      {v === "c" ? (
        <section className="pp-planta" aria-label="Plano del salón">
          {ZONAS.map((z) => (
            <div key={z.id} className="pp-sala" style={{ left: `${z.caja.x}%`, top: `${z.caja.y}%`, width: `${z.caja.w}%`, height: `${z.caja.h}%` }}>
              <span className="pp-sala__nombre">{z.nombre}</span>
              <span className="pp-sala__puerta" aria-hidden="true" />
            </div>
          ))}
          {MESAS.map((m) => <Mesa key={m.numero} m={m} variante={v} enPlano />)}
        </section>
      ) : (
        <div className="pp-zonas">
          {ZONAS.map((z) => (
            <section key={z.id} className="pp-zona" aria-label={z.nombre}>
              <h2>{z.nombre}</h2>
              <div className="pp-zona__mesas">
                {MESAS.filter((m) => m.zona === z.id).map((m) => <Mesa key={m.numero} m={m} variante={v} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
