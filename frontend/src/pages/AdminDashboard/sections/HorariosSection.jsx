import { useEffect, useState } from "react";
import { CheckCircle, Clock } from "lucide-react";
import { api } from "../../../services/api";
import AdminStatus from "../components/AdminStatus";
import { formatearFecha, formatearHora, formatearHoraTexto } from "../../../utils/fechas";

// Horarios de domicilio y reservas (0.8, decisión 15). Solo horas en punto; "primera" y
// "última" son las horas que el cliente puede elegir. El backend valida lo mismo.
const HORAS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

const RANGOS = [
  { ruta: ["domicilio"], nombre: "domicilio", titulo: "Domicilio (solo para el mismo día)" },
  { ruta: ["reservas", "entreSemana"], nombre: "reservas de lunes a viernes", titulo: "Reservas de lunes a viernes" },
  { ruta: ["reservas", "finDeSemana"], nombre: "reservas de sábado y domingo", titulo: "Reservas de sábado y domingo" },
];

const leer = (horarios, ruta) => ruta.reduce((obj, clave) => obj[clave], horarios);

const conCambio = (horarios, ruta, campo, valor) => {
  const copia = structuredClone(horarios);
  leer(copia, ruta)[campo] = valor;
  return copia;
};

const validar = (horarios) => {
  for (const { ruta, nombre } of RANGOS) {
    const { desde, hasta } = leer(horarios, ruta);
    if (desde > hasta) return `${nombre[0].toUpperCase()}${nombre.slice(1)}: la primera hora no puede ser posterior a la última.`;
  }
  const minutos = Number(horarios.domicilio.anticipacionMinutos);
  if (!Number.isInteger(minutos) || minutos < 0 || minutos > 480) return "La anticipación debe estar entre 0 y 480 minutos.";
  return "";
};

export default function HorariosSection() {
  const [horarios, setHorarios] = useState(null);
  const [actualizadoEn, setActualizadoEn] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [aviso, setAviso] = useState({ texto: "", error: false });
  const [guardando, setGuardando] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let activo = true;
    api.get("/v1/admin/horarios")
      .then((datos) => {
        if (!activo) return;
        setHorarios(datos.horarios);
        setActualizadoEn(datos.actualizadoEn);
        setErrorCarga("");
      })
      .catch((error) => activo && setErrorCarga(error.message))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [intento]);

  const cambiar = (ruta, campo) => (event) => {
    setHorarios((actual) => conCambio(actual, ruta, campo, event.target.value));
    setAviso({ texto: "", error: false });
  };

  const guardar = async (event) => {
    event.preventDefault();
    const datos = conCambio(horarios, ["domicilio"], "anticipacionMinutos", Number(horarios.domicilio.anticipacionMinutos));
    const error = validar(datos);
    if (error) {
      setAviso({ texto: error, error: true });
      return;
    }
    setGuardando(true);
    try {
      const respuesta = await api.put("/v1/admin/horarios", datos);
      setHorarios(respuesta.horarios);
      setActualizadoEn(respuesta.actualizadoEn);
      setAviso({ texto: "Horarios guardados. Los formularios de pedido y reserva ya usan los nuevos horarios.", error: false });
    } catch (e) {
      setAviso({ texto: e.message, error: true });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="admin-section">
      <div className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Horarios</h2>
          <p className="admin-section__subtitle">
            Horas en punto que el cliente puede elegir (hora de Bogotá). La primera y la última hora se incluyen.
          </p>
        </div>
      </div>

      <AdminStatus cargando={cargando} error={errorCarga} onReintentar={() => { setCargando(true); setIntento((n) => n + 1); }} />

      {horarios && (
        <form className="admin-card admin-horarios" onSubmit={guardar} noValidate>
          {RANGOS.map(({ ruta, nombre, titulo }) => {
            const rango = leer(horarios, ruta);
            return (
              <fieldset key={nombre} className="admin-horarios__grupo">
                <legend className="admin-horarios__titulo"><Clock size={16} aria-hidden="true" /> {titulo}</legend>
                <div className="admin-horarios__campos">
                  {[["desde", "Primera hora"], ["hasta", "Última hora"]].map(([campo, etiqueta]) => (
                    <div key={campo} className="admin-form-group admin-horarios__campo">
                      <label className="admin-form-label" htmlFor={`horario-${ruta.join("-")}-${campo}`}>{etiqueta}</label>
                      <select
                        id={`horario-${ruta.join("-")}-${campo}`}
                        className="admin-form-select"
                        aria-label={`${etiqueta} de ${nombre}`}
                        value={rango[campo]}
                        onChange={cambiar(ruta, campo)}
                      >
                        {HORAS.map((hora) => <option key={hora} value={hora}>{formatearHoraTexto(hora)}</option>)}
                      </select>
                    </div>
                  ))}
                  {ruta[0] === "domicilio" && (
                    <div className="admin-form-group admin-horarios__campo">
                      <label className="admin-form-label" htmlFor="horario-anticipacion">Anticipación (min)</label>
                      <input
                        id="horario-anticipacion"
                        className="admin-form-input"
                        type="number"
                        min="0"
                        max="480"
                        step="15"
                        value={horarios.domicilio.anticipacionMinutos}
                        onChange={cambiar(["domicilio"], "anticipacionMinutos")}
                        aria-describedby="horario-anticipacion-ayuda"
                      />
                      <small id="horario-anticipacion-ayuda" className="admin-horarios__ayuda">
                        Tiempo mínimo entre el pedido y la entrega
                      </small>
                    </div>
                  )}
                </div>
              </fieldset>
            );
          })}

          {aviso.texto && (
            <div className={aviso.error ? "admin-alert-error" : "admin-alert-success"} role={aviso.error ? "alert" : "status"}>
              {!aviso.error && <CheckCircle size={18} aria-hidden="true" />}
              <span>{aviso.texto}</span>
            </div>
          )}

          <div className="admin-horarios__pie">
            {actualizadoEn && (
              <small>Última modificación: {formatearFecha(actualizadoEn)}, {formatearHora(actualizadoEn)}</small>
            )}
            <button type="submit" className="admin-button--primary" disabled={guardando}>
              <span>{guardando ? "Guardando..." : "Guardar horarios"}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
