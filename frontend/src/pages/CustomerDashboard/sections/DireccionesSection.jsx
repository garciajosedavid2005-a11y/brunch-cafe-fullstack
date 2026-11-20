import { useEffect, useRef, useState } from "react";
import { MapPin, Pencil, Star, Trash2 } from "lucide-react";
import { apiRequest } from "../../../services/api";
import { useDialogo } from "../../../context/useDialogo";
import { esDireccionValida, MENSAJE_DIRECCION, normalizarDireccion } from "../../../utils/direccion";
import SectionHeading from "../SectionHeading";

// 6.4 (F6-g) · Libreta de direcciones: hasta 5, una principal (la que el carrito propone primero). Cada respuesta de la
// API trae la lista completa, así que la pantalla siempre muestra lo que quedó guardado.
export const MAX_DIRECCIONES = 5;
const RUTA = "/v1/cliente/direcciones";
const VACIA = { etiqueta: "", direccion: "", barrio: "", indicaciones: "" };

export default function DireccionesSection() {
  const { confirmar } = useDialogo();
  const [direcciones, setDirecciones] = useState(null);
  const [form, setForm] = useState(VACIA);
  const [editando, setEditando] = useState(null); // id de la que se edita, o null al agregar
  const [status, setStatus] = useState({ message: "", error: false });
  const [ocupado, setOcupado] = useState(false);
  const campoEtiqueta = useRef(null); // al pulsar «Editar», el foco va al formulario (está al final)

  useEffect(() => {
    let activo = true;
    apiRequest(RUTA)
      .then((r) => activo && setDirecciones(r.direcciones))
      .catch((error) => activo && setStatus({ message: error.message || "No se pudieron cargar tus direcciones.", error: true }));
    return () => { activo = false; };
  }, []);

  const lista = direcciones || [];
  const lleno = lista.length >= MAX_DIRECCIONES && !editando;

  const operar = async (ruta, opciones, mensaje) => {
    setOcupado(true);
    setStatus({ message: "", error: false });
    try {
      const r = await apiRequest(ruta, opciones);
      setDirecciones(r.direcciones);
      setStatus({ message: mensaje, error: false });
      return true;
    } catch (error) {
      setStatus({ message: error.message, error: true });
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const guardar = async (evento) => {
    evento.preventDefault();
    const datos = { ...form, direccion: normalizarDireccion(form.direccion), barrio: form.barrio.trim(), etiqueta: form.etiqueta.trim(), indicaciones: form.indicaciones.trim() };
    if (!esDireccionValida(datos.direccion)) return setStatus({ message: MENSAJE_DIRECCION, error: true });
    if (datos.barrio.length < 3) return setStatus({ message: "El barrio debe tener al menos 3 caracteres.", error: true });
    const ok = editando
      ? await operar(`${RUTA}/${editando}`, { method: "PATCH", body: JSON.stringify(datos) }, "Dirección actualizada.")
      : await operar(RUTA, { method: "POST", body: JSON.stringify(datos) }, "Dirección guardada.");
    if (ok) {
      setForm(VACIA);
      setEditando(null);
    }
    return undefined;
  };

  const editar = (d) => {
    setEditando(d.id);
    setForm({ etiqueta: d.etiqueta, direccion: d.direccion, barrio: d.barrio, indicaciones: d.indicaciones });
    setStatus({ message: "", error: false });
    window.requestAnimationFrame(() => campoEtiqueta.current?.focus());
  };

  const borrar = async (d) => {
    const { confirmado } = await confirmar({
      titulo: "Borrar la dirección",
      mensaje: `«${d.etiqueta || d.direccion}» se borra de tu libreta. Tus pedidos anteriores no cambian.`,
      confirmarTexto: "Borrar",
      cancelarTexto: "Volver",
      peligroso: true,
    });
    if (confirmado) await operar(`${RUTA}/${d.id}`, { method: "DELETE" }, "Dirección borrada.");
  };

  return (
    <div>
      <SectionHeading eyebrow="TUS DOMICILIOS" title="Mis direcciones">
        Guarda hasta {MAX_DIRECCIONES} direcciones. La principal es la que te proponemos primero al pedir a domicilio.
      </SectionHeading>
      {status.message && <p className={`dashboard-notice ${status.error ? "is-error" : ""}`} role={status.error ? "alert" : "status"}>{status.message}</p>}

      {direcciones === null && !status.error && <p className="dashboard-empty">Cargando tus direcciones…</p>}
      {direcciones && lista.length === 0 && <p className="dashboard-empty">Aún no tienes direcciones guardadas.</p>}
      {lista.length > 0 && (
        <ul className="dashboard-list dashboard-direcciones" aria-label="Direcciones guardadas">
          {lista.map((d) => (
            <li key={d.id} className="dashboard-card dashboard-direccion">
              <div className="dashboard-card__topline">
                <h3><MapPin size={18} aria-hidden="true" /> {d.etiqueta || "Dirección"}</h3>
                {d.principal && <span className="dashboard-direccion__principal"><Star size={14} aria-hidden="true" /> Principal</span>}
              </div>
              <p className="dashboard-direccion__texto">{d.direccion} · {d.barrio}</p>
              {d.indicaciones && <p className="dashboard-direccion__indicaciones">{d.indicaciones}</p>}
              <div className="dashboard-direccion__acciones">
                <button type="button" className="dashboard-button dashboard-button--secondary" disabled={ocupado}
                  aria-label={`Editar ${d.etiqueta || d.direccion}`} onClick={() => editar(d)}>
                  <Pencil size={16} aria-hidden="true" /> Editar
                </button>
                {!d.principal && (
                  <button type="button" className="dashboard-button dashboard-button--secondary" disabled={ocupado}
                    aria-label={`Hacer principal ${d.etiqueta || d.direccion}`}
                    onClick={() => operar(`${RUTA}/${d.id}/principal`, { method: "POST", body: "{}" }, "Dirección principal actualizada.")}>
                    <Star size={16} aria-hidden="true" /> Hacer principal
                  </button>
                )}
                <button type="button" className="dashboard-button dashboard-button--secondary" disabled={ocupado}
                  aria-label={`Borrar ${d.etiqueta || d.direccion}`} onClick={() => borrar(d)}>
                  <Trash2 size={16} aria-hidden="true" /> Borrar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="dashboard-subheading dashboard-direcciones__titulo">{editando ? "Editar dirección" : "Agregar dirección"}</h3>
      {lleno ? (
        <p className="dashboard-empty">Ya tienes {MAX_DIRECCIONES} direcciones: borra una para agregar otra.</p>
      ) : (
        <form className="dashboard-form" onSubmit={guardar} noValidate>
          <label>Nombre (opcional)
            <input ref={campoEtiqueta} name="etiqueta" value={form.etiqueta} maxLength={30} placeholder="Casa, Oficina…" onChange={(e) => setForm({ ...form, etiqueta: e.target.value })} />
          </label>
          <label>Dirección
            <input name="direccion" value={form.direccion} maxLength={60} required placeholder="Cra 36B #30-06" onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
          </label>
          <label>Barrio
            <input name="barrio" value={form.barrio} maxLength={40} required onChange={(e) => setForm({ ...form, barrio: e.target.value })} />
          </label>
          <label>Indicaciones (opcional)
            <input name="indicaciones" value={form.indicaciones} maxLength={120} placeholder="Torre, apartamento, portería…" onChange={(e) => setForm({ ...form, indicaciones: e.target.value })} />
          </label>
          <div className="dashboard-form__wide dashboard-direccion__acciones">
            <button type="submit" className="dashboard-button" disabled={ocupado}>{editando ? "Guardar cambios" : "Guardar dirección"}</button>
            {editando && (
              <button type="button" className="dashboard-button dashboard-button--secondary" onClick={() => { setEditando(null); setForm(VACIA); }}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
