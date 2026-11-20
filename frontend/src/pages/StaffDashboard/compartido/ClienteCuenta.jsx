import { useId, useState } from "react";
import { AlertTriangle, Search, UserRound, X } from "lucide-react";
import { apiRequest } from "../../../services/api";
import "./ClienteCuenta.css";

// 6.5 (F6-8, F6-e) · Cliente de la cuenta: el personal con cliente:identificar lo busca por correo o teléfono exactos
// (la lista llega enmascarada) y lo elige; desde entonces la cuenta, la caja y el KDS muestran sus alergias y
// preferencias. Sin el permiso solo se ve el aviso. `onCambio(cuenta)` recibe la cuenta que devolvió el servidor
// (con la versión nueva).

/** «Alergias: …» y «Preferencias: …» (con texto e icono, no solo color). null si no hay nada que avisar. */
export function AvisoCliente({ aviso, compacto = false }) {
  if (!aviso || (!aviso.alergias && !aviso.preferencias)) return null;
  return (
    <p className={`aviso-cliente${compacto ? " aviso-cliente--compacto" : ""}`} role="note">
      <AlertTriangle size={compacto ? 16 : 18} aria-hidden="true" />
      <span>
        {aviso.alergias && <><strong>Alergias:</strong> {aviso.alergias}</>}
        {aviso.alergias && aviso.preferencias && " · "}
        {aviso.preferencias && <><strong>Preferencias:</strong> {aviso.preferencias}</>}
      </span>
    </p>
  );
}

export default function ClienteCuenta({ cuenta, puedeIdentificar = false, onCambio }) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [buscar, setBuscar] = useState("");
  const [resultados, setResultados] = useState(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const cliente = cuenta.cliente;
  const editable = ["abierta", "cuenta_pedida"].includes(cuenta.estado ?? "cuenta_pedida");

  const buscarCliente = async (evento) => {
    evento.preventDefault();
    setError("");
    if (buscar.trim().length < 5) return setError("Escribe el correo o el teléfono completo del cliente.");
    setOcupado(true);
    try {
      const r = await apiRequest(`/v1/staff/salon/clientes?buscar=${encodeURIComponent(buscar.trim())}`);
      setResultados(r.clientes);
    } catch (e) {
      setError(e.message || "No se pudo buscar el cliente.");
    } finally {
      setOcupado(false);
    }
    return undefined;
  };

  const elegir = async (clienteId) => {
    setOcupado(true);
    setError("");
    try {
      const actualizada = await apiRequest(`/v1/staff/salon/cuentas/${cuenta.id}/cliente`, {
        method: "PUT", body: JSON.stringify({ clienteId, versionEsperada: cuenta.version }),
      });
      setAbierto(false);
      setResultados(null);
      setBuscar("");
      onCambio?.(actualizada);
    } catch (e) {
      setError(e.message || "No se pudo guardar el cliente.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="cliente-cuenta" aria-labelledby={`${id}-titulo`}>
      <div className="cliente-cuenta__fila">
        <h3 id={`${id}-titulo`} className="cliente-cuenta__titulo">
          <UserRound size={18} aria-hidden="true" /> {cliente ? `Cliente: ${cliente.nombre}` : "Cliente sin identificar"}
        </h3>
        {puedeIdentificar && editable && !abierto && (
          <button type="button" className="cliente-cuenta__boton" onClick={() => setAbierto(true)} disabled={ocupado}>
            <Search size={16} aria-hidden="true" /> {cliente ? "Cambiar" : "Identificar cliente"}
          </button>
        )}
        {puedeIdentificar && editable && cliente && !abierto && (
          <button type="button" className="cliente-cuenta__boton" onClick={() => elegir(null)} disabled={ocupado}
            aria-label={`Quitar el cliente ${cliente.nombre} de la cuenta`}>
            <X size={16} aria-hidden="true" /> Quitar
          </button>
        )}
      </div>
      {cliente && <AvisoCliente aviso={cliente} />}

      {abierto && (
        <form className="cliente-cuenta__buscar" onSubmit={buscarCliente} noValidate>
          <label className="cliente-cuenta__campo">
            <span>Correo o teléfono del cliente</span>
            <input value={buscar} maxLength={254} autoComplete="off" onChange={(e) => setBuscar(e.target.value)}
              aria-describedby={error ? `${id}-error` : undefined} aria-invalid={error ? true : undefined} />
          </label>
          <div className="cliente-cuenta__acciones">
            <button type="submit" className="cliente-cuenta__boton cliente-cuenta__boton--primario" disabled={ocupado}>
              <Search size={16} aria-hidden="true" /> Buscar
            </button>
            <button type="button" className="cliente-cuenta__boton" onClick={() => { setAbierto(false); setResultados(null); setError(""); }}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {error && <p id={`${id}-error`} className="cliente-cuenta__error" role="alert">{error}</p>}
      {abierto && resultados && (
        resultados.length === 0
          ? <p className="cliente-cuenta__vacio" role="status">No hay un cliente con ese correo o teléfono exactos.</p>
          : (
            <ul className="cliente-cuenta__resultados" aria-label="Clientes encontrados" aria-live="polite">
              {resultados.map((c) => (
                <li key={c.id} className="cliente-cuenta__resultado">
                  <span>
                    <strong>{c.nombre}</strong>
                    <span className="cliente-cuenta__contacto">{[c.correo, c.telefono].filter(Boolean).join(" · ")}</span>
                    {c.tieneAvisos && <span className="cliente-cuenta__cumple">Tiene alergias o preferencias registradas</span>}
                    {c.cumpleEsteMes && <span className="cliente-cuenta__cumple">Cumple años este mes</span>}
                  </span>
                  <button type="button" className="cliente-cuenta__boton cliente-cuenta__boton--primario" disabled={ocupado}
                    aria-label={`Elegir a ${c.nombre}`} onClick={() => elegir(c.id)}>
                    Elegir
                  </button>
                </li>
              ))}
            </ul>
          )
      )}
    </section>
  );
}
