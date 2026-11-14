import { useState } from "react";
import { FileText, ReceiptText, Wallet } from "lucide-react";
import { apiRequest } from "../../../services/api";
import { formatearCOP } from "../../../utils/moneda";
import { formatearHora } from "../../../utils/fechas";
import { useSondeo } from "../compartido/useSondeo";
import Actualizado from "../compartido/Actualizado";
import { formatearMinutos } from "../plano/estadosMesa";
import { etiquetaMetodo } from "./cobro";
import CobrarCuenta from "./CobrarCuenta";
import Comprobante from "./Comprobante";
import "./Caja.css";

// Fase 3 · Pestaña «Caja» de /staff (cuenta:cobrar; F3-1): las cuentas en «cuenta pedida» (F3-6) y las
// cobradas hoy, en vivo por el canal «caja» con polling de respaldo. Cobrar abre la pantalla de cobro y,
// al terminar, el comprobante (imprimible).
const CANALES = ["caja"];
const mesasTexto = (mesas = []) => (mesas.length > 1 ? `Mesas ${mesas.join(" + ")}` : `Mesa ${mesas[0] ?? "—"}`);
const minutosDesde = (fecha) => (fecha ? Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / 60000)) : null);

export default function Caja() {
  const [vista, setVista] = useState({ tipo: "lista" });
  const enLista = vista.tipo === "lista";
  const porCobrar = useSondeo("/v1/staff/caja/cuentas", 15_000, { activo: enLista, canales: CANALES, mensajeError: "No se pudo cargar la caja." });
  const cobradas = useSondeo("/v1/staff/caja/comprobantes", 30_000, { activo: enLista, canales: CANALES, mensajeError: "No se pudieron cargar las cobradas." });
  const [errorComprobante, setErrorComprobante] = useState("");

  const volver = () => {
    setVista({ tipo: "lista" });
    porCobrar.recargar();
    cobradas.recargar();
  };
  const verComprobante = async (id) => {
    setErrorComprobante("");
    try {
      setVista({ tipo: "comprobante", comprobante: await apiRequest(`/v1/staff/caja/comprobantes/${id}`) });
    } catch (e) {
      setErrorComprobante(e.message);
    }
  };

  if (vista.tipo === "cobrar") {
    return <CobrarCuenta cuenta={vista.cuenta} onVolver={volver} onCobrada={(comprobante) => setVista({ tipo: "comprobante", comprobante })} />;
  }
  if (vista.tipo === "comprobante") return <Comprobante comprobante={vista.comprobante} onVolver={volver} />;

  const cuentas = porCobrar.datos?.cuentas || [];
  const hoy = cobradas.datos?.comprobantes || [];
  return (
    <section className="caja" aria-label="Caja">
      <div className="caja__barra">
        <h2 className="caja__titulo">Caja</h2>
        <Actualizado desde={porCobrar.actualizadoEn} error={porCobrar.error} onActualizar={porCobrar.recargar} enVivo={porCobrar.enVivo} />
      </div>

      <h3 className="caja__subtitulo">Por cobrar <span className="caja__conteo">{cuentas.length}</span></h3>
      {!porCobrar.datos && !porCobrar.error && <p className="caja__vacio">Cargando…</p>}
      {porCobrar.error && !porCobrar.datos && <p className="caja__aviso" role="alert">{porCobrar.error}</p>}
      {porCobrar.datos && cuentas.length === 0 && <p className="caja__vacio">No hay cuentas pedidas. Aparecen aquí cuando el mesero pide la cuenta.</p>}
      <ul className="caja__cuentas" aria-label="Cuentas por cobrar">
        {cuentas.map((c) => {
          const espera = minutosDesde(c.pedidaEn);
          return (
            <li key={c.id} className="caja__cuenta">
              <div className="caja__cuenta-datos">
                <strong className="caja__cuenta-mesa">{mesasTexto(c.mesas)}</strong>
                <span>{[c.mesero, `${c.comensales} ${c.comensales === 1 ? "persona" : "personas"}`].filter(Boolean).join(" · ")}</span>
                {espera !== null && <span className="caja__cuenta-espera">Pidió la cuenta hace {formatearMinutos(espera)}</span>}
              </div>
              <strong className="caja__cuenta-total">{formatearCOP(c.total)}</strong>
              <button type="button" className="caja__boton caja__boton--primario" aria-label={`Cobrar ${mesasTexto(c.mesas)}, ${formatearCOP(c.total)}`}
                onClick={() => setVista({ tipo: "cobrar", cuenta: c })}>
                <Wallet size={18} aria-hidden="true" /> Cobrar
              </button>
            </li>
          );
        })}
      </ul>

      <h3 className="caja__subtitulo">Cobradas hoy <span className="caja__conteo">{hoy.length}</span></h3>
      {errorComprobante && <p className="caja__aviso" role="alert">{errorComprobante}</p>}
      {cobradas.datos && hoy.length === 0 && <p className="caja__vacio">Todavía no hay cobros hoy.</p>}
      <ul className="caja__cobradas" aria-label="Cobradas hoy">
        {hoy.map((c) => (
          <li key={c.id} className="caja__cobrada">
            <ReceiptText size={18} aria-hidden="true" />
            <span className="caja__cobrada-codigo">{c.codigo}</span>
            <span>{mesasTexto(c.mesas)} · {formatearHora(c.emitidoEn)} · {c.metodos.map(etiquetaMetodo).join(" + ")}</span>
            <strong>{formatearCOP(c.total)}</strong>
            <button type="button" className="caja__boton caja__boton--secundario" aria-label={`Ver comprobante ${c.codigo}`} onClick={() => verComprobante(c.id)}>
              <FileText size={18} aria-hidden="true" /> Ver
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
