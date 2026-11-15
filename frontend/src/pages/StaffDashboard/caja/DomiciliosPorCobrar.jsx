import { Bike, Wallet } from "lucide-react";
import { formatearCOP } from "../../../utils/moneda";

// 3b.4 · Domicilios por cobrar (en camino o entregados, sin comprobante, con cualquier método: todos se pagan al
// recibir). Los cobra el cajero o el repartidor (pedido:cobrar); el cobro exige un turno de caja abierto (409 si no).
const ESTADO = { en_camino: "En camino", entregado: "Entregado" };

export default function DomiciliosPorCobrar({ sondeo, sinTurno, onCobrar }) {
  const domicilios = sondeo.datos?.domicilios || [];
  return (
    <>
      <h3 className="caja__subtitulo">Domicilios por cobrar <span className="caja__conteo">{domicilios.length}</span></h3>
      {!sondeo.datos && !sondeo.error && <p className="caja__vacio">Cargando…</p>}
      {sondeo.error && !sondeo.datos && <p className="caja__aviso" role="alert">{sondeo.error}</p>}
      {sondeo.datos && domicilios.length === 0 && <p className="caja__vacio">No hay domicilios por cobrar. Aparecen aquí cuando salen en camino.</p>}
      <ul className="caja__cuentas" aria-label="Domicilios por cobrar">
        {domicilios.map((d) => (
          <li key={d.id} className="caja__cuenta caja__cuenta--domicilio">
            <div className="caja__cuenta-datos">
              <strong className="caja__cuenta-mesa"><Bike size={18} aria-hidden="true" /> {d.codigo}</strong>
              <span>{[d.cliente, d.direccion].filter(Boolean).join(" · ")}</span>
              <span className="caja__cuenta-espera">{[ESTADO[d.estado] || d.estado, d.metodoPago].filter(Boolean).join(" · ")}</span>
            </div>
            <strong className="caja__cuenta-total">{formatearCOP(d.total)}</strong>
            <button type="button" className="caja__boton caja__boton--primario" aria-label={`Cobrar domicilio ${d.codigo}, ${formatearCOP(d.total)}`}
              disabled={sinTurno} title={sinTurno ? "Abre el turno de caja para cobrar" : undefined} onClick={() => onCobrar(d)}>
              <Wallet size={18} aria-hidden="true" /> Cobrar
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
