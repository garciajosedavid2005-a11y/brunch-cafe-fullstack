import { useId, useRef, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "../../../services/api";
import { formatearCOP, formatearMiles } from "../../../utils/moneda";
import { nuevaClave } from "../plano/estadosMesa";
import { METODOS, cuerpoCobro, estadoPagos, pesos, propinaSugerida } from "./cobro";

// Fase 3 · Cobrar una cuenta (F3-2, F3-3): propina voluntaria (atajos «10 %» y «Sin propina»), uno o varios
// pagos (uno por método) y, en efectivo, lo recibido y el cambio. «Cobrar» solo se habilita cuando los pagos
// suman exactamente lo que hay que cobrar. La Idempotency-Key se reutiliza solo si no llegó respuesta.
const mesasTexto = (mesas = []) => (mesas.length > 1 ? `Mesas ${mesas.join(" + ")}` : `Mesa ${mesas[0]}`);

function CampoPesos({ id, etiqueta, valor, onCambiar, descripcion }) {
  return (
    <div className="caja-cobro__campo">
      <label htmlFor={id}>{etiqueta}</label>
      <span className="caja-cobro__pesos">
        <span aria-hidden="true">$</span>
        <input id={id} type="text" inputMode="numeric" autoComplete="off" value={formatearMiles(valor)} placeholder="0"
          aria-describedby={descripcion} onChange={(e) => onCambiar(pesos(e.target.value))} />
      </span>
    </div>
  );
}

export default function CobrarCuenta({ cuenta, onVolver, onCobrada }) {
  const id = useId();
  const consumo = cuenta.total;
  const [propina, setPropina] = useState(0);
  const total = consumo + propina;
  // Un solo pago sigue al total mientras el cajero no lo cambie
  const [pagos, setPagos] = useState([{ metodo: "efectivo", monto: consumo, recibido: null }]);
  const [seguirTotal, setSeguirTotal] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const clave = useRef(nuevaClave());

  const pagosVistos = seguirTotal && pagos.length === 1 ? [{ ...pagos[0], monto: total }] : pagos;
  const estado = estadoPagos(pagosVistos, total);

  const cambiarPropina = (valor) => {
    setPropina(valor);
    setError("");
  };
  const cambiarPago = (i, cambios) => {
    if ("monto" in cambios) setSeguirTotal(false);
    setPagos(pagosVistos.map((p, j) => (j === i ? { ...p, ...cambios } : p)));
    setError("");
  };
  const usados = new Set(pagosVistos.map((p) => p.metodo));
  const libre = METODOS.find((m) => !usados.has(m.codigo));
  const agregarPago = () => {
    setSeguirTotal(false);
    setPagos([...pagosVistos, { metodo: libre.codigo, monto: Math.max(0, estado.restante), recibido: null }]);
  };
  const quitarPago = (i) => {
    const quedan = pagosVistos.filter((_, j) => j !== i);
    setPagos(quedan);
    if (quedan.length === 1) setSeguirTotal(true);
  };

  const cobrar = async () => {
    setEnviando(true);
    setError("");
    try {
      const resultado = await apiRequest(`/v1/staff/caja/cuentas/${cuenta.id}/cobrar`, {
        method: "POST",
        headers: { "Idempotency-Key": clave.current },
        body: JSON.stringify(cuerpoCobro({ versionEsperada: cuenta.version, propina, pagos: pagosVistos })),
      });
      onCobrada(resultado.comprobante);
    } catch (fallo) {
      if (fallo.status) clave.current = nuevaClave(); // el servidor respondió: el próximo intento es otro
      setError(fallo.status === 409 ? `${fallo.message} Vuelve a la caja para ver el estado actual.` : fallo.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="caja-cobro" aria-labelledby={`${id}-titulo`}>
      <div className="caja__acciones">
        <button type="button" className="caja__boton caja__boton--secundario" onClick={onVolver}>
          <ArrowLeft size={18} aria-hidden="true" /> Volver a la caja
        </button>
      </div>
      <h2 id={`${id}-titulo`} className="caja__titulo">Cobrar · {mesasTexto(cuenta.mesas)}</h2>
      <p className="caja-cobro__sub">{cuenta.codigo}{cuenta.mesero ? ` · ${cuenta.mesero}` : ""}</p>

      <div className="caja-cobro__columnas">
        <div className="caja-cobro__bloque">
          <dl className="caja-cobro__resumen">
            <div><dt>Consumo</dt><dd>{formatearCOP(consumo)}</dd></div>
          </dl>
          <CampoPesos id={`${id}-propina`} etiqueta="Propina voluntaria" valor={propina} onCambiar={cambiarPropina} />
          <div className="caja-cobro__atajos" role="group" aria-label="Atajos de propina">
            <button type="button" className="caja__boton caja__boton--opcion" aria-pressed={propina === propinaSugerida(consumo) && propina > 0}
              onClick={() => cambiarPropina(propinaSugerida(consumo))}>10 % ({formatearCOP(propinaSugerida(consumo))})</button>
            <button type="button" className="caja__boton caja__boton--opcion" aria-pressed={propina === 0}
              onClick={() => cambiarPropina(0)}>Sin propina</button>
          </div>
          <p className="caja-cobro__total">Total a cobrar <strong>{formatearCOP(total)}</strong></p>
        </div>

        <div className="caja-cobro__bloque">
          <h3 className="caja__subtitulo">Pago</h3>
          <ul className="caja-cobro__pagos">
            {estado.filas.map((p, i) => (
              <li key={i} className="caja-cobro__pago">
                <div className="caja-cobro__metodos" role="radiogroup" aria-label={`Método del pago ${i + 1}`}>
                  {METODOS.map((m) => (
                    <button key={m.codigo} type="button" role="radio" aria-checked={p.metodo === m.codigo}
                      className="caja__boton caja__boton--opcion" disabled={p.metodo !== m.codigo && usados.has(m.codigo)}
                      onClick={() => cambiarPago(i, { metodo: m.codigo, recibido: null })}>{m.etiqueta}</button>
                  ))}
                </div>
                <CampoPesos id={`${id}-monto-${i}`} etiqueta={pagosVistos.length > 1 ? "Monto" : "Monto (todo el total)"} valor={p.monto}
                  onCambiar={(monto) => cambiarPago(i, { monto })} />
                {p.metodo === "efectivo" && (
                  <>
                    <CampoPesos id={`${id}-recibido-${i}`} etiqueta="Recibido" valor={p.recibido ?? p.monto}
                      onCambiar={(recibido) => cambiarPago(i, { recibido })} descripcion={`${id}-cambio-${i}`} />
                    <p id={`${id}-cambio-${i}`} className={`caja-cobro__cambio${p.falta ? " is-falta" : ""}`} aria-live="polite">
                      {p.falta ? `Falta ${formatearCOP(p.falta)} en efectivo` : `Cambio: ${formatearCOP(p.cambio)}`}
                    </p>
                  </>
                )}
                {pagosVistos.length > 1 && (
                  <button type="button" className="caja__boton caja__boton--secundario" onClick={() => quitarPago(i)}>
                    <Trash2 size={16} aria-hidden="true" /> Quitar pago
                  </button>
                )}
              </li>
            ))}
          </ul>
          {libre && (
            <button type="button" className="caja__boton caja__boton--secundario" onClick={agregarPago}>
              <Plus size={18} aria-hidden="true" /> Agregar otro método
            </button>
          )}
          {estado.restante !== 0 && (
            <p className="caja-cobro__restante" role="status">
              {estado.restante > 0 ? `Falta asignar ${formatearCOP(estado.restante)}` : `Sobran ${formatearCOP(-estado.restante)}: ajusta los montos`}
            </p>
          )}
          {error && <p className="caja__aviso" role="alert">{error}</p>}
          <button type="button" className="caja__boton caja__boton--primario caja-cobro__cobrar" disabled={!estado.valido || enviando} onClick={cobrar}>
            {enviando ? "Cobrando…" : `Cobrar ${formatearCOP(total)}`}
          </button>
        </div>
      </div>
    </section>
  );
}
