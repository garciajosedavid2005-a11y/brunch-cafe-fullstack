import { Minus, Plus } from "lucide-react";
import { formatearCOP } from "../../../utils/moneda";
import { MAX_PARTES, montoParte } from "./cobro";

// 3b.2 · Cómo se cobra: la cuenta entera, en partes iguales (la siguiente de N) o por ítems (los aún no
// cobrados). Con una parte ya cobrada el modo queda fijo (y N también).
const MODOS = [
  { codigo: "entera", etiqueta: "Toda la cuenta" },
  { codigo: "iguales", etiqueta: "Partes iguales" },
  { codigo: "items", etiqueta: "Por ítems" },
];

export default function DivisionCuenta({ id, total, division, modo, onModo, partes, onPartes, items, elegidos, onElegir }) {
  const fijo = division?.modo || null;
  const siguiente = (division?.cobradas || 0) + 1;
  return (
    <div className="caja-division">
      <div className="caja-cobro__metodos caja-division__modos" role="radiogroup" aria-label="Cómo se cobra">
        {MODOS.map((m) => (
          <button key={m.codigo} type="button" role="radio" aria-checked={modo === m.codigo}
            className="caja__boton caja__boton--opcion" disabled={Boolean(fijo) && fijo !== m.codigo}
            onClick={() => onModo(m.codigo)}>{m.etiqueta}</button>
        ))}
      </div>
      {fijo && (
        <p className="caja-division__aviso">
          {fijo === "iguales"
            ? `Ya se cobró ${division.cobradas === 1 ? "1 parte" : `${division.cobradas} partes`} de ${division.partes}: sigue en partes iguales.`
            : `Ya se cobraron ítems en ${division.cobradas === 1 ? "1 parte" : `${division.cobradas} partes`}: elige los que faltan.`}
        </p>
      )}

      {modo === "iguales" && (
        <div className="caja-division__partes">
          <span id={`${id}-partes`} className="caja-division__etiqueta">Partes</span>
          <div className="caja-division__contador" role="group" aria-labelledby={`${id}-partes`}>
            <button type="button" className="caja__boton caja__boton--secundario" aria-label="Una parte menos"
              disabled={Boolean(fijo) || partes <= 2} onClick={() => onPartes(partes - 1)}><Minus size={18} aria-hidden="true" /></button>
            <output aria-live="polite" className="caja-division__numero">{partes}</output>
            <button type="button" className="caja__boton caja__boton--secundario" aria-label="Una parte más"
              disabled={Boolean(fijo) || partes >= MAX_PARTES} onClick={() => onPartes(partes + 1)}><Plus size={18} aria-hidden="true" /></button>
          </div>
          <p className="caja-division__detalle">
            Parte {siguiente} de {partes}: <strong>{formatearCOP(montoParte(total, partes, siguiente))}</strong>
          </p>
        </div>
      )}

      {modo === "items" && (
        <fieldset className="caja-division__items">
          <legend className="caja-division__etiqueta">Ítems de esta parte</legend>
          {!items && <p className="caja__vacio">Cargando los ítems…</p>}
          {items?.map((i) => (
            <label key={i.id} className={`caja-division__item${i.cobrado ? " is-cobrado" : ""}`}>
              <input type="checkbox" checked={i.cobrado || elegidos.includes(i.id)} disabled={i.cobrado} onChange={() => onElegir(i.id)} />
              <span className="caja-division__item-nombre">
                {i.cantidad} × {i.nombre}
                {i.opciones.length > 0 && <small>{i.opciones.join(", ")}</small>}
              </span>
              <span className="caja-division__item-monto">{i.cobrado ? "Cobrado" : formatearCOP(i.subtotal)}</span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
