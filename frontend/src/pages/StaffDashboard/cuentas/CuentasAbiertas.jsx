import { createElement, useState } from "react";
import { Bike, Clock3, UtensilsCrossed } from "lucide-react";
import { formatearCOP } from "../../../utils/moneda";
import { incluyePermiso } from "../../../utils/permisos";
import { formatearMinutos } from "../plano/estadosMesa";
import { useSondeo } from "../compartido/useSondeo";
import Actualizado from "../compartido/Actualizado";
import "../plano/PlanoMesas.css";
import "./CuentasAbiertas.css";

// 1.9 · «Cuentas abiertas» (F1-11, opción A): las cuentas de salón (abierta o cuenta pedida) y los
// domicilios sin terminar en una sola vista de solo lectura. El domicilio sigue en Pedido; el backend
// lo adapta a la forma de una cuenta. Cada parte llega solo con su permiso (cuenta:ver, pedido:ver).
export const INTERVALO_MS = 15_000;
const RUTA = "/v1/staff/cuentas-abiertas";

const CANALES = {
  salon: { etiqueta: "Salón", icono: UtensilsCrossed },
  domicilio: { etiqueta: "Domicilio", icono: Bike },
};

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function TarjetaCuenta({ cuenta }) {
  const { etiqueta, icono } = CANALES[cuenta.canal] || { etiqueta: cuenta.canal, icono: Clock3 };
  const detalle = cuenta.canal === "salon"
    ? [cuenta.responsable?.nombre, cuenta.comensales ? plural(cuenta.comensales, "comensal", "comensales") : ""]
    : [cuenta.cliente, cuenta.hora ? `Entrega ${cuenta.hora}` : ""];
  return (
    <li className={`cuentas__tarjeta cuentas__tarjeta--${cuenta.canal}`}>
      <div className="cuentas__cabecera">
        <span className={`cuentas__canal cuentas__canal--${cuenta.canal}`}>
          {createElement(icono, { size: 16, "aria-hidden": true })}
          {etiqueta}
        </span>
        <span className="cuentas__codigo">{cuenta.codigo}</span>
      </div>
      <h3 className="cuentas__referencia">{cuenta.referencia}</h3>
      <p className={`cuentas__estado cuentas__estado--${cuenta.estado.codigo}`}>{cuenta.estado.nombre}</p>
      {detalle.some(Boolean) && (
        <p className="cuentas__detalle">
          {/* Cada dato en una pieza: «Entrega 10:00» no se parte entre líneas */}
          {detalle.filter(Boolean).map((d, i) => [i > 0 && " · ", <span key={d}>{d}</span>])}
        </p>
      )}
      {cuenta.pendiente > 0 && <p className="cuentas__pendiente">Sin enviar: {formatearCOP(cuenta.pendiente)}</p>}
      <div className="cuentas__pie">
        <strong className="cuentas__total">{formatearCOP(cuenta.total)}</strong>
        <span className="cuentas__tiempo">
          <Clock3 size={15} aria-hidden="true" />
          {formatearMinutos(cuenta.minutos)}
        </span>
      </div>
    </li>
  );
}

// 2.4 · Con mesa:ver escucha el canal «plano» (abrir, cerrar, enviar rondas…); los domicilios siguen
// por polling (no hay canal de pedidos para el personal de sala)
const CANALES_SALON = ["plano"];

export default function CuentasAbiertas({ permisos = [] }) {
  const canalesVivo = incluyePermiso(permisos, "mesa:ver") ? CANALES_SALON : undefined;
  const { datos, error, actualizadoEn, cargando, recargar, enVivo } = useSondeo(RUTA, INTERVALO_MS, { mensajeError: "No se pudieron cargar las cuentas.", canales: canalesVivo });
  const [canal, setCanal] = useState("todas");
  const cuentas = datos?.cuentas || [];
  const canales = datos?.canales || {};
  const ambos = canales.salon && canales.domicilio;
  const visibles = canal === "todas" ? cuentas : cuentas.filter((c) => c.canal === canal);
  const cuantas = (c) => cuentas.filter((x) => x.canal === c).length;
  const filtros = [["todas", "Todas", cuentas.length], ["salon", "Salón", cuantas("salon")], ["domicilio", "Domicilio", cuantas("domicilio")]];

  return (
    <div className="cuentas">
      <div className="plano__barra">
        <h2 className="plano__titulo">Cuentas abiertas</h2>
        <Actualizado desde={actualizadoEn} error={error} onActualizar={recargar} enVivo={canalesVivo ? enVivo : undefined} />
      </div>
      <p className="cuentas__ayuda">
        Salón y domicilios en curso, de la más antigua a la más nueva. Solo lectura: cada cuenta se atiende desde Mesas o Pedidos.
      </p>

      {datos && ambos && (
        <div className="plano__zonas" role="group" aria-label="Canal">
          {filtros.map(([id, nombre, n]) => (
            <button key={id} type="button" className="plano__zona" aria-pressed={canal === id} onClick={() => setCanal(id)}>
              {`${nombre} (${n})`}
            </button>
          ))}
        </div>
      )}
      {datos && !ambos && (
        <p className="cuentas__ayuda">{canales.salon ? "Tu rol solo ve las cuentas de salón." : "Tu rol solo ve los domicilios."}</p>
      )}
      {datos?.truncado && (
        <p className="cuentas__aviso" role="status">Hay demasiadas cuentas abiertas: se muestran las 200 más antiguas de cada canal.</p>
      )}

      {error && !datos && <p className="plano__aviso" role="alert">{error}</p>}
      {cargando && !datos && !error && <p className="cuentas__ayuda">Cargando cuentas…</p>}
      {datos && visibles.length === 0 && <p className="cuentas__vacio">No hay cuentas abiertas.</p>}
      {visibles.length > 0 && (
        <ul className="cuentas__lista" aria-label="Cuentas abiertas">
          {visibles.map((c) => <TarjetaCuenta key={`${c.canal}-${c.id}`} cuenta={c} />)}
        </ul>
      )}
    </div>
  );
}
