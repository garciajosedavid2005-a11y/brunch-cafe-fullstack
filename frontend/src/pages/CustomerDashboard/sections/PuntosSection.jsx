import { useEffect, useState } from "react";
import { Cake, Gift } from "lucide-react";
import { apiRequest } from "../../../services/api";
import { formatearCOP } from "../../../utils/moneda";
import { formatearFecha } from "../../../utils/fechas";
import SectionHeading from "../SectionHeading";

// 6.6 (F6-5) · Mis puntos: saldo, cómo se ganan y se canjean, y los últimos movimientos del libro.
const TIPO = { acumula: "Ganados", canjea: "Canjeados", revierte: "Ajuste por anulación" };

// 6.7 (F6-6) · Estado del descuento de cumpleaños (una compra en el mes de cumpleaños, una vez al año)
const textoCumpleanos = ({ estado, porcentaje }) => ({
  disponible: `¡Feliz cumpleaños! Este mes tienes ${porcentaje} % de descuento en una compra: pídelo en la caja o márcalo en el carrito de tu domicilio.`,
  usado: `Ya usaste este año tu descuento de cumpleaños (${porcentaje} %).`,
  fuera_de_mes: `En el mes de tu cumpleaños tendrás ${porcentaje} % de descuento en una compra.`,
  sin_fecha: `Agrega tu fecha de nacimiento en «Mi perfil» para recibir ${porcentaje} % de descuento en una compra durante el mes de tu cumpleaños.`,
}[estado] || "");

export default function PuntosSection() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let activo = true;
    apiRequest("/v1/cliente/puntos")
      .then((r) => activo && setDatos(r))
      .catch((e) => activo && setError(e.message || "No se pudieron cargar tus puntos."));
    return () => { activo = false; };
  }, []);

  const reglas = datos?.reglas;
  return (
    <div>
      <SectionHeading eyebrow="TUS BENEFICIOS" title="Mis puntos">
        {reglas
          ? `Ganas 1 punto por cada ${formatearCOP(reglas.pesosPorPunto)} que pagas (sin la propina). En la caja, cada ${reglas.bloque} puntos valen ${formatearCOP(reglas.valorBloque)} de descuento.`
          : "Gana puntos con tus compras y canjéalos en la caja."}
      </SectionHeading>
      {error && <p className="dashboard-notice is-error" role="alert">{error}</p>}
      {!datos && !error && <p className="dashboard-empty">Cargando tus puntos…</p>}
      {datos && (
        <>
          <p className="dashboard-puntos__saldo">
            <Gift size={22} aria-hidden="true" />
            <span>Tienes <strong>{datos.saldo}</strong> {datos.saldo === 1 ? "punto" : "puntos"}</span>
          </p>
          <p className="dashboard-form__ayuda">Para usarlos, pide en la caja que te identifiquen con tu correo o tu teléfono.</p>
          {datos.cumpleanos && (
            <p className={`dashboard-puntos__cumple${datos.cumpleanos.estado === "disponible" ? " is-disponible" : ""}`}>
              <Cake size={20} aria-hidden="true" />
              <span>{textoCumpleanos(datos.cumpleanos)}</span>
            </p>
          )}
          <h3 className="dashboard-subheading dashboard-direcciones__titulo">Movimientos</h3>
          {datos.movimientos.length === 0
            ? <p className="dashboard-empty">Aún no tienes movimientos.</p>
            : (
              <table className="dashboard-puntos__tabla">
                <caption className="sr-only">Movimientos de tus puntos</caption>
                <thead>
                  <tr><th scope="col">Fecha</th><th scope="col">Movimiento</th><th scope="col">Puntos</th><th scope="col">Saldo</th></tr>
                </thead>
                <tbody>
                  {datos.movimientos.map((m) => (
                    <tr key={m.id}>
                      <td>{formatearFecha(m.fecha)}</td>
                      <td>{TIPO[m.tipo] || m.tipo} · {m.referencia}</td>
                      <td className={m.puntos < 0 ? "is-negativo" : "is-positivo"}>{m.puntos > 0 ? `+${m.puntos}` : m.puntos}</td>
                      <td>{m.saldoDespues}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </>
      )}
    </div>
  );
}
