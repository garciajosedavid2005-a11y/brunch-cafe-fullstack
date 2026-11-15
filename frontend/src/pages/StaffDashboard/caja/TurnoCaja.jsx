import { useId, useState } from "react";
import { ArrowLeft, Lock, LockOpen } from "lucide-react";
import { apiRequest } from "../../../services/api";
import { formatearCOP } from "../../../utils/moneda";
import { formatearHora } from "../../../utils/fechas";
import { METODOS, etiquetaMetodo } from "./cobro";
import CampoPesos from "./CampoPesos";

// Fase 3b.1 · Turno de caja: una sola caja. Sin turno abierto no se cobra; quien tiene caja:abrir lo abre
// con la base en efectivo y quien tiene caja:cerrar lo cierra con el arqueo (contado frente a esperado).

/** Franja de arriba de la Caja: estado del turno y sus acciones. */
export function FranjaTurno({ turno, cargado, puedeAbrir, puedeCerrar, onAbierto, onCerrar }) {
  const id = useId();
  const [base, setBase] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const abrir = async () => {
    setEnviando(true);
    setError("");
    try {
      await apiRequest("/v1/staff/caja/turno/abrir", { method: "POST", body: JSON.stringify({ base }) });
      setBase(0);
      onAbierto();
    } catch (e) {
      setError(e.message);
      if (e.status === 409) onAbierto(); // otro lo abrió: se recarga
    } finally {
      setEnviando(false);
    }
  };

  if (!cargado) return null;
  if (turno) {
    return (
      <div className="caja-turno caja-turno--abierto" role="region" aria-label="Turno de caja">
        <LockOpen size={20} aria-hidden="true" />
        <p className="caja-turno__texto">
          <strong>Turno {turno.codigo} abierto</strong>
          <span>{[turno.abiertoPor, `desde las ${formatearHora(turno.abiertoEn)}`, `base ${formatearCOP(turno.base)}`].filter(Boolean).join(" · ")}</span>
        </p>
        {puedeCerrar && (
          <button type="button" className="caja__boton caja__boton--secundario" onClick={onCerrar}>
            <Lock size={18} aria-hidden="true" /> Cerrar turno
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="caja-turno caja-turno--cerrado" role="region" aria-label="Turno de caja">
      <Lock size={20} aria-hidden="true" />
      <p className="caja-turno__texto">
        <strong>La caja está cerrada</strong>
        <span>{puedeAbrir ? "Abre el turno con la base en efectivo para empezar a cobrar." : "Para cobrar, alguien con permiso debe abrir el turno de caja."}</span>
      </p>
      {puedeAbrir && (
        <div className="caja-turno__abrir">
          <CampoPesos id={`${id}-base`} etiqueta="Base en efectivo" valor={base} onCambiar={setBase} />
          <button type="button" className="caja__boton caja__boton--primario" disabled={enviando} onClick={abrir}>
            <LockOpen size={18} aria-hidden="true" /> {enviando ? "Abriendo…" : "Abrir turno"}
          </button>
        </div>
      )}
      {error && <p className="caja__aviso" role="alert">{error}</p>}
    </div>
  );
}

const signo = (n) => (n > 0 ? `+${formatearCOP(n)}` : n < 0 ? `−${formatearCOP(-n)}` : formatearCOP(0));
const textoDiferencia = (d) => (d === 0 ? "Cuadra" : d > 0 ? `Sobran ${formatearCOP(d)}` : `Faltan ${formatearCOP(-d)}`);

/** Pantalla de cierre: lo esperado por método, lo contado y la diferencia; al cerrar, el arqueo guardado. */
export function CerrarTurno({ turno, onVolver }) {
  const id = useId();
  const [contado, setContado] = useState(() => Object.fromEntries(METODOS.map((m) => [m.codigo, 0])));
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [cerrado, setCerrado] = useState(null);

  const esperado = Object.fromEntries((turno.esperado || []).map((e) => [e.metodo, e.esperado]));
  const filas = cerrado
    ? cerrado.arqueo
    : METODOS.map((m) => ({ metodo: m.codigo, esperado: esperado[m.codigo] ?? 0, contado: contado[m.codigo], diferencia: contado[m.codigo] - (esperado[m.codigo] ?? 0) }));
  const total = filas.reduce((n, f) => n + f.diferencia, 0);

  const cerrar = async () => {
    setEnviando(true);
    setError("");
    try {
      const { turno: resultado } = await apiRequest("/v1/staff/caja/turno/cerrar", {
        method: "POST", body: JSON.stringify({ contado, ...(nota.trim() ? { nota: nota.trim() } : {}) }),
      });
      setCerrado(resultado);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="caja-cierre" aria-labelledby={`${id}-titulo`}>
      <div className="caja__acciones">
        <button type="button" className="caja__boton caja__boton--secundario" onClick={onVolver}>
          <ArrowLeft size={18} aria-hidden="true" /> Volver a la caja
        </button>
      </div>
      <h2 id={`${id}-titulo`} className="caja__titulo">{cerrado ? `Turno ${turno.codigo} cerrado` : `Cerrar turno ${turno.codigo}`}</h2>
      <p className="caja-cobro__sub">
        Base {formatearCOP(turno.base)} · {turno.cobros ?? 0} {turno.cobros === 1 ? "cobro" : "cobros"} · abierto a las {formatearHora(turno.abiertoEn)}
        {/* 3b.3 · Lo devuelto por notas crédito ya está restado del esperado: se dice para que cuadre a la vista */}
        {(turno.esperado || []).some((e) => e.devuelto > 0) && ` · devuelto por notas crédito ${formatearCOP((turno.esperado || []).reduce((n, e) => n + (e.devuelto || 0), 0))} (ya restado)`}
      </p>

      <table className="caja-cierre__tabla">
        <caption className="sr-only">Arqueo por método de pago</caption>
        <thead>
          <tr><th scope="col">Método</th><th scope="col">Esperado</th><th scope="col">Contado</th><th scope="col">Diferencia</th></tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.metodo}>
              <th scope="row">{etiquetaMetodo(f.metodo)}</th>
              <td>{formatearCOP(f.esperado)}</td>
              <td>
                {cerrado ? formatearCOP(f.contado) : (
                  <CampoPesos id={`${id}-${f.metodo}`} etiqueta={`Contado en ${etiquetaMetodo(f.metodo).toLowerCase()}`} valor={f.contado}
                    onCambiar={(v) => setContado((c) => ({ ...c, [f.metodo]: v }))} />
                )}
              </td>
              <td className={f.diferencia === 0 ? "caja-cierre__cuadra" : "caja-cierre__descuadre"}>
                {signo(f.diferencia)} <span className="caja-cierre__estado">{textoDiferencia(f.diferencia)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="caja-cobro__total" role="status">
        Diferencia total <strong>{signo(total)}</strong> <span>({textoDiferencia(total)})</span>
      </p>

      {!cerrado && (
        <>
          <div className="caja-cobro__campo">
            <label htmlFor={`${id}-nota`}>Nota (opcional)</label>
            <textarea id={`${id}-nota`} className="caja-cierre__nota" maxLength={300} rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
          {error && <p className="caja__aviso" role="alert">{error}</p>}
          <div className="caja__acciones">
            <button type="button" className="caja__boton caja__boton--primario" disabled={enviando} onClick={cerrar}>
              <Lock size={18} aria-hidden="true" /> {enviando ? "Cerrando…" : "Cerrar turno"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
