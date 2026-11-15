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
import { FranjaTurno, CerrarTurno } from "./TurnoCaja";
import { useAuth } from "../../../context/useAuth";
import { tienePermiso } from "../../../utils/permisos";
import DomiciliosPorCobrar from "./DomiciliosPorCobrar";
import "./Caja.css";

// Fase 3 · Pestaña «Caja» de /staff (cuenta:cobrar; F3-1): las cuentas en «cuenta pedida» (F3-6) y las
// cobradas hoy, en vivo por el canal «caja» con polling de respaldo. Cobrar abre la pantalla de cobro y,
// al terminar, el comprobante (imprimible).
const CANALES = ["caja"];
const mesasTexto = (mesas = []) => (mesas.length > 1 ? `Mesas ${mesas.join(" + ")}` : `Mesa ${mesas[0] ?? "—"}`);
// Un comprobante es de una cuenta (mesas) o de un domicilio (pedido)
const origenTexto = (c) => (c.pedido ? `Domicilio ${c.pedido}` : mesasTexto(c.mesas));
const minutosDesde = (fecha) => (fecha ? Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / 60000)) : null);

export default function Caja() {
  const [vista, setVista] = useState({ tipo: "lista" });
  const enLista = vista.tipo === "lista";
  const { user } = useAuth();
  // 3b.4 · El repartidor (solo pedido:cobrar) ve únicamente los domicilios por cobrar
  const cobraCuentas = tienePermiso(user, "cuenta:cobrar");
  const canales = cobraCuentas ? CANALES : [];
  const porCobrar = useSondeo("/v1/staff/caja/cuentas", 15_000, { activo: enLista && cobraCuentas, canales, mensajeError: "No se pudo cargar la caja." });
  // El repartidor ve solo los comprobantes de los domicilios que él cobró hoy (para volver a abrirlos o reimprimirlos)
  const cobradas = useSondeo("/v1/staff/caja/comprobantes", 30_000, { activo: enLista, canales, mensajeError: "No se pudieron cargar las cobradas." });
  const tituloCobradas = cobraCuentas ? "Cobradas hoy" : "Mis cobros de hoy";
  // 3b.1 · Turno de caja: sin turno abierto no se cobra
  const turnoSondeo = useSondeo("/v1/staff/caja/turno", 30_000, { activo: enLista && cobraCuentas, canales, mensajeError: "No se pudo cargar el turno." });
  const domicilios = useSondeo("/v1/staff/caja/domicilios", 20_000, { activo: enLista, canales, mensajeError: "No se pudieron cargar los domicilios." });
  const vivo = cobraCuentas ? porCobrar : domicilios;
  const turno = turnoSondeo.datos?.turno || null;
  const turnoCargado = Boolean(turnoSondeo.datos);
  const [errorComprobante, setErrorComprobante] = useState("");

  const volver = () => {
    setVista({ tipo: "lista" });
    porCobrar.recargar();
    cobradas.recargar();
    turnoSondeo.recargar();
    domicilios.recargar();
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
  if (vista.tipo === "cerrar-turno" && turno) return <CerrarTurno turno={turno} onVolver={volver} />;

  const cuentas = porCobrar.datos?.cuentas || [];
  const hoy = cobradas.datos?.comprobantes || [];
  return (
    <section className="caja" aria-label="Caja">
      <div className="caja__barra">
        <h2 className="caja__titulo">Caja</h2>
        <Actualizado desde={vivo.actualizadoEn} error={vivo.error} onActualizar={volver} enVivo={vivo.enVivo} />
      </div>

      {cobraCuentas && (<>
      <FranjaTurno turno={turno} cargado={turnoCargado} puedeAbrir={tienePermiso(user, "caja:abrir")} puedeCerrar={tienePermiso(user, "caja:cerrar")}
        onAbierto={turnoSondeo.recargar} onCerrar={() => setVista({ tipo: "cerrar-turno" })} />

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
                {c.division && (
                  <span className="caja__cuenta-division">
                    {c.division.modo === "iguales" ? `Parte ${c.division.cobradas} de ${c.division.partes} cobrada` : `${c.division.cobradas} ${c.division.cobradas === 1 ? "parte cobrada" : "partes cobradas"} por ítems`}
                    {` · faltan ${formatearCOP(c.porCobrar)}`}
                  </span>
                )}
              </div>
              <strong className="caja__cuenta-total">{formatearCOP(c.porCobrar ?? c.total)}</strong>
              <button type="button" className="caja__boton caja__boton--primario" aria-label={`Cobrar ${mesasTexto(c.mesas)}, ${formatearCOP(c.porCobrar ?? c.total)}`}
                disabled={!turno} title={turno ? undefined : "Abre el turno de caja para cobrar"}
                onClick={() => setVista({ tipo: "cobrar", cuenta: c })}>
                <Wallet size={18} aria-hidden="true" /> Cobrar
              </button>
            </li>
          );
        })}
      </ul>

      </>)}

      <DomiciliosPorCobrar sondeo={domicilios} sinTurno={cobraCuentas && turnoCargado && !turno}
        onCobrar={(d) => setVista({ tipo: "cobrar", cuenta: { ...d, esDomicilio: true, mesas: [] } })} />

      <h3 className="caja__subtitulo">{tituloCobradas} <span className="caja__conteo">{hoy.length}</span></h3>
      {errorComprobante && <p className="caja__aviso" role="alert">{errorComprobante}</p>}
      {cobradas.datos && hoy.length === 0 && <p className="caja__vacio">Todavía no hay cobros hoy.</p>}
      <ul className="caja__cobradas" aria-label={tituloCobradas}>
        {hoy.map((c) => (
          <li key={c.id} className="caja__cobrada">
            <ReceiptText size={18} aria-hidden="true" />
            <span className="caja__cobrada-codigo">{c.codigo}</span>
            <span>{origenTexto(c)}{c.parte ? ` · Parte ${c.parte.numero}${c.parte.de ? ` de ${c.parte.de}` : ""}` : ""} · {formatearHora(c.emitidoEn)} · {c.metodos.map(etiquetaMetodo).join(" + ")}</span>
            <strong className={c.anulado ? "caja__cobrada-anulada" : undefined}>{formatearCOP(c.total)}</strong>
            {c.anulado && <span className="caja__insignia-anulado">Anulado · {c.anulado.codigo}</span>}
            <button type="button" className="caja__boton caja__boton--secundario" aria-label={`Ver comprobante ${c.codigo}`} onClick={() => verComprobante(c.id)}>
              <FileText size={18} aria-hidden="true" /> Ver
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
