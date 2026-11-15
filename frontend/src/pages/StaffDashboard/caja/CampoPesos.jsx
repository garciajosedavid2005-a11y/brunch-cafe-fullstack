import { formatearMiles } from "../../../utils/moneda";
import { pesos } from "./cobro";

// Campo de pesos de la caja («$» y el número en una sola caja; solo dígitos, entero en COP). Lo usan el
// cobro, la apertura del turno y el arqueo (3b.1).
export default function CampoPesos({ id, etiqueta, valor, onCambiar, descripcion, onSalir }) {
  return (
    <div className="caja-cobro__campo">
      <label htmlFor={id}>{etiqueta}</label>
      <span className="caja-cobro__pesos">
        <span aria-hidden="true">$</span>
        <input id={id} type="text" inputMode="numeric" autoComplete="off" value={formatearMiles(valor)} placeholder="0"
          aria-describedby={descripcion} onChange={(e) => onCambiar(pesos(e.target.value))} onBlur={onSalir} />
      </span>
    </div>
  );
}
