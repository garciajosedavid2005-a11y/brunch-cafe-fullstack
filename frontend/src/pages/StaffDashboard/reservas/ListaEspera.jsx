import { useEffect, useId, useRef, useState } from "react";
import { Hourglass, UserPlus } from "lucide-react";
import { apiRequest } from "../../../services/api";
import { useDialogo } from "../../../context/useDialogo";
import { useSondeo } from "../compartido/useSondeo";
import { nuevaClave } from "../plano/estadosMesa";
import "./AgendaReservas.css";

// 4.4 · Lista de espera de hoy (F4-4, F4-h): clientes sin reserva con nombre, personas y teléfono. «Sentar» abre la
// cuenta en una mesa libre y no reservada (el backend lo vuelve a comprobar: 409 MESA_RESERVADA / MESA_NO_DISPONIBLE);
// «Retirar» la quita (se fue). Agrega quien tiene reserva:crear; sienta y retira quien atiende mesas.
const personasTexto = (n) => `${n} ${n === 1 ? "persona" : "personas"}`;
const VACIO = { nombre: "", personas: "2", telefono: "" };
const INTERVALO_ESPERA_MS = 20_000;

function FilaEspera({ persona, mesas, puedeSentar, onCambio, onHecho }) {
  const id = useId();
  const { confirmar } = useDialogo();
  const [mesaId, setMesaId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const clave = useRef(nuevaClave());
  const llamar = (ruta, opciones) => {
    setEnviando(true);
    setError("");
    return apiRequest(`/v1/staff/espera/${persona.id}/${ruta}`, opciones)
      .then(() => { onCambio(); return true; })
      .catch((e) => { setError(e.message); onCambio(); return false; })
      .finally(() => setEnviando(false));
  };
  const sentar = async () => {
    if (!mesaId) { setError("Elige la mesa."); return; }
    if (await llamar("sentar", { method: "POST", body: JSON.stringify({ mesaId }), headers: { "Idempotency-Key": clave.current } })) {
      clave.current = nuevaClave();
      onHecho(`${persona.nombre} quedó sentado en la mesa ${mesas?.find((m) => m.id === mesaId)?.numero ?? ""}; su cuenta está abierta.`);
    }
  };
  const retirar = async () => {
    const { confirmado } = await confirmar({ titulo: "Retirar de la espera", mensaje: `${persona.nombre} sale de la lista de espera (se fue sin sentarse).`, confirmarTexto: "Retirar" });
    if (confirmado && await llamar("retirar", { method: "PATCH", body: "{}" })) onHecho(`${persona.nombre} salió de la lista de espera.`);
  };
  return (
    <li className="espera__fila">
      <div className="espera__datos">
        <strong>{persona.nombre}</strong>
        {/* Cada dato entero en su línea (a 390 px «min» no queda solo) */}
        <span className="espera__detalle">
          {[personasTexto(persona.personas), persona.telefono, `espera ${persona.minutosEsperando} min`].map((parte, i) => (
            <span key={parte}>{i > 0 && " · "}<span className="espera__dato">{parte}</span></span>
          ))}
        </span>
      </div>
      {puedeSentar && (
        <div className="espera__acciones">
          <select id={`${id}-mesa`} aria-label={`Mesa para ${persona.nombre}`} value={mesaId} disabled={enviando || !mesas} onChange={(e) => setMesaId(e.target.value)}>
            <option value="">{mesas ? (mesas.length ? "Elige la mesa" : "No hay mesas libres") : "Cargando mesas…"}</option>
            {(mesas || []).map((m) => (
              <option key={m.id} value={m.id}>{`Mesa ${m.numero} · ${personasTexto(m.capacidad)}${m.capacidad < persona.personas ? " (pequeña)" : ""}`}</option>
            ))}
          </select>
          <button type="button" className="agenda__boton agenda__boton--primario" disabled={enviando} aria-label={`Sentar a ${persona.nombre}`} onClick={sentar}>Sentar</button>
          <button type="button" className="agenda__boton" disabled={enviando} aria-label={`Retirar a ${persona.nombre}`} onClick={retirar}>Retirar</button>
        </div>
      )}
      {error && <p className="agenda__error" role="alert">{error}</p>}
    </li>
  );
}

export default function ListaEspera({ puedeAgregar = false, puedeSentar = false, canales = [] }) {
  const id = useId();
  const sondeo = useSondeo("/v1/staff/espera", INTERVALO_ESPERA_MS, { mensajeError: "No se pudo actualizar la lista de espera.", canales });
  const [form, setForm] = useState(VACIO);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState({ texto: "", error: false });
  const clave = useRef(nuevaClave());
  // Mesas para sentar: libres, sin cuenta y sin una reserva que ya las tenga (bloque empezado)
  const [mesas, setMesas] = useState(null);
  const { recargar } = sondeo;
  const [versionMesas, setVersionMesas] = useState(0);
  useEffect(() => {
    if (!puedeSentar) return undefined;
    let vivo = true;
    apiRequest("/v1/staff/salon/mesas")
      .then((plano) => {
        if (!vivo) return;
        setMesas((plano.mesas || []).filter((m) => m.estado === "libre" && !m.cuenta && !m.reserva?.bloqueada).sort((a, b) => a.numero - b.numero));
      })
      .catch(() => { if (vivo) setMesas([]); });
    return () => { vivo = false; };
  }, [puedeSentar, versionMesas]);
  const alCambiar = () => { recargar(); setVersionMesas((v) => v + 1); };

  const lista = sondeo.datos?.espera || [];
  const esperando = lista.filter((e) => e.estado === "esperando");
  const sentados = lista.filter((e) => e.estado === "sentada").length;
  const retirados = lista.filter((e) => e.estado === "retirada").length;

  const agregar = async (evento) => {
    evento.preventDefault();
    setEnviando(true);
    setAviso({ texto: "", error: false });
    try {
      await apiRequest("/v1/staff/espera", {
        method: "POST",
        body: JSON.stringify({ nombre: form.nombre.trim(), personas: Number(form.personas), telefono: form.telefono.trim() }),
        headers: { "Idempotency-Key": clave.current },
      });
      clave.current = nuevaClave();
      setAviso({ texto: `${form.nombre.trim()} quedó en la lista de espera.`, error: false });
      setForm(VACIO);
      recargar();
    } catch (e) {
      setAviso({ texto: e.message, error: true });
    } finally {
      setEnviando(false);
    }
  };
  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  return (
    <section className="espera" aria-labelledby={`${id}-titulo`}>
      <h3 id={`${id}-titulo`} className="agenda__titulo">
        <Hourglass size={18} aria-hidden="true" /> Lista de espera <span className="agenda__conteo">{esperando.length}</span>
      </h3>
      {puedeAgregar && (
        <form className="espera__form" onSubmit={agregar} noValidate>
          <div className="espera__campo">
            <label htmlFor={`${id}-nombre`}>Nombre <span className="espera__requerido">(obligatorio)</span></label>
            <input id={`${id}-nombre`} value={form.nombre} onChange={cambiar("nombre")} maxLength={120} autoComplete="off" required />
          </div>
          <div className="espera__campo espera__campo--corto">
            <label htmlFor={`${id}-personas`}>Personas</label>
            <select id={`${id}-personas`} value={form.personas} onChange={cambiar("personas")}>
              {/* 1 a 20, como MAX_PERSONAS_ESPERA del modelo Espera (backend) */}
              {Array.from({ length: 20 }, (_, i) => String(i + 1)).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="espera__campo">
            <label htmlFor={`${id}-telefono`}>Teléfono <span className="espera__requerido">(obligatorio)</span></label>
            <input id={`${id}-telefono`} type="tel" value={form.telefono} onChange={cambiar("telefono")} maxLength={30} autoComplete="off" required />
          </div>
          <button type="submit" className="agenda__boton agenda__boton--primario" disabled={enviando}>
            <UserPlus size={17} aria-hidden="true" /> Agregar a la espera
          </button>
        </form>
      )}
      {aviso.texto && <p className={aviso.error ? "agenda__error" : "espera__ok"} role={aviso.error ? "alert" : "status"}>{aviso.texto}</p>}
      {sondeo.error && <p className="agenda__error" role="alert">{sondeo.error}</p>}
      {sondeo.datos && !esperando.length && <p className="espera__vacia">Nadie está esperando mesa.</p>}
      <ul className="espera__lista" aria-label="Esperando mesa">
        {esperando.map((p) => <FilaEspera key={p.id} persona={p} mesas={mesas} puedeSentar={puedeSentar} onCambio={alCambiar}
          onHecho={(texto) => setAviso({ texto, error: false })} />)}
      </ul>
      {(sentados > 0 || retirados > 0) && (
        <p className="espera__resumen">Hoy: {sentados} {sentados === 1 ? "sentado" : "sentados"} · {retirados} {retirados === 1 ? "retirado" : "retirados"}</p>
      )}
    </section>
  );
}
