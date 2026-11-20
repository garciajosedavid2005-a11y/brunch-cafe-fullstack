import { useId, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { apiRequest } from "../../services/api";
import { CONSENTIMIENTO_VERSION, POLITICA_DATOS } from "../../utils/consentimiento";
import { rutaInicio } from "../../utils/permisos";
import "./Consentimiento.css";

/** 6.4 · El texto de la política (lo usan la página pública y la de aceptar). */
export function TextoPolitica() {
  return (
    <div className="consentimiento__secciones">
      {POLITICA_DATOS.map((s) => (
        <section key={s.titulo}>
          <h2>{s.titulo}</h2>
          <p>{s.texto}</p>
        </section>
      ))}
    </div>
  );
}

/** 6.4 · /politica-datos: la política vigente, sin sesión (el registro enlaza aquí). */
export function PoliticaDatos() {
  return (
    <main className="consentimiento">
      <article className="consentimiento__tarjeta">
        <h1>Política de tratamiento de datos</h1>
        <p className="consentimiento__version">Versión {CONSENTIMIENTO_VERSION} · Ley 1581 de 2012</p>
        <TextoPolitica />
        <div className="consentimiento__acciones">
          <Link to="/" className="consentimiento__boton">Ir al inicio</Link>
        </div>
      </article>
    </main>
  );
}

/**
 * 6.4 (F6-f) · /consentimiento: un cliente sin la versión vigente la acepta antes de seguir (la API le responde 403
 * CONSENTIMIENTO_PENDIENTE hasta entonces). Puede salir sin aceptar.
 */
export default function Consentimiento() {
  const id = useId();
  const navigate = useNavigate();
  const { user, setUser, logout, loading } = useAuth();
  const [acepta, setAcepta] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (loading) return <main className="customer-dashboard-loading">Cargando tu cuenta...</main>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.consentimientoPendiente) return <Navigate to={rutaInicio(user)} replace />;

  const aceptar = async (evento) => {
    evento.preventDefault();
    setEnviando(true);
    setError("");
    try {
      await apiRequest("/v1/auth/consentimiento", { method: "POST", body: JSON.stringify({ version: CONSENTIMIENTO_VERSION }) });
      const actualizado = { ...user, consentimientoPendiente: false };
      setUser(actualizado);
      navigate(rutaInicio(actualizado), { replace: true });
    } catch (e) {
      setError(e.message || "No se pudo guardar tu aceptación. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="consentimiento">
      <form className="consentimiento__tarjeta" onSubmit={aceptar} aria-labelledby={`${id}-titulo`}>
        <h1 id={`${id}-titulo`}>Antes de seguir, {user.nombre}</h1>
        <p className="consentimiento__intro">
          Actualizamos nuestra política de tratamiento de datos. Para seguir usando tu cuenta, léela y acéptala.
        </p>
        <p className="consentimiento__version">Versión {CONSENTIMIENTO_VERSION} · Ley 1581 de 2012</p>
        <TextoPolitica />
        <label className="consentimiento__casilla">
          <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} aria-describedby={`${id}-ayuda`} />
          <span>Autorizo a Brunch Café a tratar mis datos personales según esta política.</span>
        </label>
        {!acepta && <p id={`${id}-ayuda`} className="consentimiento__version">Marca la casilla para continuar.</p>}
        {error && <p className="consentimiento__error" role="alert">{error}</p>}
        <div className="consentimiento__acciones">
          <button type="submit" className="consentimiento__boton consentimiento__boton--principal" disabled={!acepta || enviando}>
            {enviando ? "Guardando…" : "Aceptar y continuar"}
          </button>
          <button type="button" className="consentimiento__boton" onClick={logout}>Salir sin aceptar</button>
        </div>
      </form>
    </main>
  );
}
