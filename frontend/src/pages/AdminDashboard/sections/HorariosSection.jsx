import { useEffect, useState } from "react";
import { CheckCircle, Clock, Users } from "lucide-react";
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

// 4.2 · Aforo de reservas (personas por hora). En el formulario son textos: vacío = sin límite (general) o
// «usa el general» (hora). Las horas son las del rango de reservas más amplio (lunes a viernes o fin de semana).
const aforoAFormulario = (aforo) => ({
  general: aforo?.general == null ? "" : String(aforo.general),
  horas: Object.fromEntries((aforo?.porHora || []).map((h) => [h.hora, String(h.maximo)])),
});
const horasDeReserva = ({ entreSemana, finDeSemana }) => {
  const desde = [entreSemana.desde, finDeSemana.desde].sort()[0];
  const hasta = [entreSemana.hasta, finDeSemana.hasta].sort()[1];
  return HORAS.filter((h) => h >= desde && h <= hasta);
};
const entero = (texto, min, max) => /^\d+$/.test(texto.trim()) && Number(texto) >= min && Number(texto) <= max;
const validarAforo = (aforo, horas) => {
  if (aforo.general.trim() && !entero(aforo.general, 1, 500)) return "El aforo general debe ser un número entero entre 1 y 500 (vacío = sin límite).";
  const mala = horas.find((h) => (aforo.horas[h] || "").trim() && !entero(aforo.horas[h], 0, 500));
  return mala ? `El aforo de las ${formatearHoraTexto(mala)} debe ser un número entero entre 0 y 500 (vacío = usa el general).` : "";
};
const aforoAEnviar = (aforo, horas) => ({
  general: aforo.general.trim() ? Number(aforo.general) : null,
  porHora: horas.filter((h) => (aforo.horas[h] || "").trim()).map((h) => ({ hora: h, maximo: Number(aforo.horas[h]) })),
});

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
  // 1.15 · Versión leída: el guardado la envía y, si otro admin guardó antes, el backend responde 409
  const [version, setVersion] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [aviso, setAviso] = useState({ texto: "", error: false, recargar: false });
  const [guardando, setGuardando] = useState(false);
  const [intento, setIntento] = useState(0);
  const [aforo, setAforo] = useState(() => aforoAFormulario(null));

  useEffect(() => {
    let activo = true;
    api.get("/v1/admin/horarios")
      .then((datos) => {
        if (!activo) return;
        setHorarios(datos.horarios);
        setAforo(aforoAFormulario(datos.horarios.reservas.aforo));
        setActualizadoEn(datos.actualizadoEn);
        setVersion(datos.version ?? 0);
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
    setAviso({ texto: "", error: false, recargar: false });
  };

  const recargar = () => {
    setAviso({ texto: "", error: false, recargar: false });
    setIntento((n) => n + 1);
  };

  const guardar = async (event) => {
    event.preventDefault();
    const datos = conCambio(horarios, ["domicilio"], "anticipacionMinutos", Number(horarios.domicilio.anticipacionMinutos));
    const horasAforo = horasDeReserva(datos.reservas);
    const error = validar(datos) || validarAforo(aforo, horasAforo);
    if (error) {
      setAviso({ texto: error, error: true, recargar: false });
      return;
    }
    setGuardando(true);
    try {
      const cuerpo = { ...datos, reservas: { ...datos.reservas, aforo: aforoAEnviar(aforo, horasAforo) } };
      const respuesta = await api.put("/v1/admin/horarios", { ...cuerpo, versionEsperada: version });
      setHorarios(respuesta.horarios);
      setAforo(aforoAFormulario(respuesta.horarios.reservas.aforo));
      setActualizadoEn(respuesta.actualizadoEn);
      setVersion(respuesta.version);
      setAviso({ texto: "Horarios guardados. Los formularios de pedido y reserva ya usan los nuevos horarios.", error: false, recargar: false });
    } catch (e) {
      setAviso({ texto: e.message, error: true, recargar: e.code === "HORARIOS_MODIFICADOS" });
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

          <fieldset className="admin-horarios__grupo">
            <legend className="admin-horarios__titulo"><Users size={16} aria-hidden="true" /> Aforo de reservas (personas por hora)</legend>
            <p className="admin-horarios__ayuda admin-horarios__nota">
              Máximo de personas que pueden reservar para una misma hora. Vacío = sin límite; en cada hora, vacío = usa el general y 0 = sin reservas a esa hora.
            </p>
            <div className="admin-form-group admin-horarios__campo">
              <label className="admin-form-label" htmlFor="aforo-general">Aforo general</label>
              <input id="aforo-general" className="admin-form-input" aria-label="Aforo general (personas por hora)" type="number" min="1" max="500" step="1" inputMode="numeric"
                placeholder="Sin límite" value={aforo.general}
                onChange={(e) => { setAforo((a) => ({ ...a, general: e.target.value })); setAviso({ texto: "", error: false, recargar: false }); }} />
            </div>
            <div className="admin-horarios__aforo-horas">
              {horasDeReserva(horarios.reservas).map((hora) => (
                <div key={hora} className="admin-form-group admin-horarios__aforo-hora">
                  <label className="admin-form-label" htmlFor={`aforo-${hora}`}>{formatearHoraTexto(hora)}</label>
                  <input id={`aforo-${hora}`} className="admin-form-input" type="number" min="0" max="500" step="1" inputMode="numeric"
                    aria-label={`Aforo de las ${formatearHoraTexto(hora)}`} placeholder={aforo.general.trim() ? `General: ${aforo.general.trim()}` : "Sin límite"} value={aforo.horas[hora] ?? ""}
                    onChange={(e) => { const valor = e.target.value; setAforo((a) => ({ ...a, horas: { ...a.horas, [hora]: valor } })); setAviso({ texto: "", error: false, recargar: false }); }} />
                </div>
              ))}
            </div>
          </fieldset>

          {aviso.texto && (
            <div className={aviso.error ? "admin-alert-error" : "admin-alert-success"} role={aviso.error ? "alert" : "status"}>
              {!aviso.error && <CheckCircle size={18} aria-hidden="true" />}
              <span>{aviso.texto}</span>
              {aviso.recargar && (
                <button type="button" className="admin-button--secondary-sm admin-horarios__recargar" onClick={recargar}>Recargar</button>
              )}
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
