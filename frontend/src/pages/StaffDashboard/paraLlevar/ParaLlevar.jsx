import { useId, useRef, useState } from "react";
import { BellRing, ChefHat, PackageCheck, Plus, ShoppingBag } from "lucide-react";
import { apiRequest } from "../../../services/api";
import { formatearCOP } from "../../../utils/moneda";
import { formatearHora } from "../../../utils/fechas";
import { useSondeo } from "../compartido/useSondeo";
import Actualizado from "../compartido/Actualizado";
import { nuevaClave } from "../plano/estadosMesa";
import TomaComanda from "../comanda/TomaComanda";
import "./ParaLlevar.css";

// 6.3 (F6-3) · Pestaña «Para llevar» de /staff (cuenta:para_llevar: mesero y cajero; el admin por «*»). Abrir una
// cuenta sin mesa con el nombre o el teléfono de quien recoge, tomar su pedido (la misma toma de comanda), pasarla a
// caja y entregar lo que cocina deja listo. La lista sigue en vivo (canal «para_llevar»); una cobrada se queda
// mientras le falte algo por entregar.
const RUTA = "/v1/staff/salon/para-llevar";
const CANALES = ["para_llevar"];

const estadoTexto = (c) => {
  if (c.cobrada) return "Cobrada";
  if (c.estado === "cuenta_pedida") return "En caja";
  return "Abierta";
};

function NuevaParaLlevar({ onAbierta }) {
  const id = useId();
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const clave = useRef(nuevaClave()); // un reintento tras un corte de red no abre otra cuenta

  const abrir = async (evento) => {
    evento.preventDefault();
    if (!nombre.trim() && !telefono.trim()) {
      setError("Indica el nombre o el teléfono de quien recoge el pedido.");
      return;
    }
    setEnviando(true);
    setError("");
    try {
      const cuenta = await apiRequest(RUTA, {
        method: "POST",
        headers: { "Idempotency-Key": clave.current },
        body: JSON.stringify({ ...(nombre.trim() ? { nombre: nombre.trim() } : {}), ...(telefono.trim() ? { telefono: telefono.trim() } : {}) }),
      });
      clave.current = nuevaClave();
      setNombre("");
      setTelefono("");
      onAbierta(cuenta.id);
    } catch (e) {
      setError(e.message || "No se pudo abrir la cuenta para llevar.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className="para-llevar__nueva" onSubmit={abrir} aria-labelledby={`${id}-titulo`} noValidate>
      <h3 id={`${id}-titulo`} className="para-llevar__subtitulo">Nueva cuenta para llevar</h3>
      <div className="para-llevar__campos">
        <label className="para-llevar__campo">
          <span>Nombre</span>
          <input value={nombre} maxLength={60} autoComplete="off" onChange={(e) => setNombre(e.target.value)}
            aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />
        </label>
        <label className="para-llevar__campo">
          <span>Teléfono</span>
          <input value={telefono} maxLength={30} inputMode="tel" autoComplete="off" onChange={(e) => setTelefono(e.target.value)}
            aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />
        </label>
        <button type="submit" className="para-llevar__boton para-llevar__boton--primario" disabled={enviando}>
          <Plus size={18} aria-hidden="true" /> {enviando ? "Abriendo…" : "Abrir y tomar pedido"}
        </button>
      </div>
      <p className="para-llevar__ayuda">Basta con el nombre o el teléfono: así lo llama cocina y lo busca la caja.</p>
      {error && <p id={`${id}-error`} className="para-llevar__aviso" role="alert">{error}</p>}
    </form>
  );
}

export default function ParaLlevar({ permisos = [] }) {
  const [cuentaVista, setCuentaVista] = useState(null);
  const sondeo = useSondeo(RUTA, 20_000, { activo: !cuentaVista, canales: CANALES, mensajeError: "No se pudo cargar la lista para llevar." });

  if (cuentaVista) {
    return (
      <TomaComanda cuentaId={cuentaVista} permisos={permisos} textoVolver="Volver a Para llevar"
        onVolver={() => { setCuentaVista(null); sondeo.recargar(); }} />
    );
  }

  const cuentas = sondeo.datos?.cuentas || [];
  return (
    <section className="para-llevar" aria-label="Para llevar">
      <div className="para-llevar__barra">
        <h2 className="para-llevar__titulo"><ShoppingBag size={22} aria-hidden="true" /> Para llevar</h2>
        <Actualizado desde={sondeo.actualizadoEn} error={sondeo.error} onActualizar={sondeo.recargar} enVivo={sondeo.enVivo} />
      </div>

      <NuevaParaLlevar onAbierta={setCuentaVista} />

      <h3 className="para-llevar__subtitulo">En curso <span className="para-llevar__conteo">{cuentas.length}</span></h3>
      {!sondeo.datos && !sondeo.error && <p className="para-llevar__vacio">Cargando…</p>}
      {sondeo.error && !sondeo.datos && <p className="para-llevar__aviso" role="alert">{sondeo.error}</p>}
      {sondeo.datos && cuentas.length === 0 && <p className="para-llevar__vacio">No hay pedidos para llevar en curso.</p>}
      <ul className="para-llevar__lista" aria-label="Pedidos para llevar en curso">
        {cuentas.map((c) => (
          <li key={c.id}>
            <button type="button" className={`para-llevar__tarjeta${c.listos > 0 ? " is-listo" : ""}`}
              aria-label={`Abrir ${c.nombre || c.telefono}, ${estadoTexto(c)}${c.listos ? `, ${c.listos} listos para entregar` : ""}${c.porPreparar ? `, ${c.porPreparar} en cocina` : ""}, ${formatearCOP(c.total)}`}
              onClick={() => setCuentaVista(c.id)}>
              <span className="para-llevar__cabecera">
                <strong className="para-llevar__nombre">{c.nombre || c.telefono}</strong>
                <span className={`para-llevar__estado para-llevar__estado--${c.cobrada ? "cobrada" : c.estado}`}>{estadoTexto(c)}</span>
              </span>
              <span className="para-llevar__detalle">{[c.codigo, `desde ${formatearHora(c.abiertaEn)}`, c.responsable?.nombre].filter(Boolean).join(" · ")}</span>
              <span className="para-llevar__conteos">
                {c.enBorrador > 0 && <span>{c.enBorrador} sin enviar</span>}
                {c.porPreparar > 0 && <span><ChefHat size={16} aria-hidden="true" /> {c.porPreparar} en cocina</span>}
                {c.listos > 0 && <span className="para-llevar__listos"><BellRing size={16} aria-hidden="true" /> {c.listos} para entregar</span>}
                {c.entregados > 0 && <span><PackageCheck size={16} aria-hidden="true" /> {c.entregados} entregados</span>}
              </span>
              <strong className="para-llevar__total">{formatearCOP(c.total)}</strong>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
