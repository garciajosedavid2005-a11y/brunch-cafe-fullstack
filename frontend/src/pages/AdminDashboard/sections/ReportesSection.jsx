import { createElement, useCallback, useEffect, useState } from "react";
import { BarChart3, Download, Timer } from "lucide-react";
import { api } from "../../../services/api";
import { formatearCOP, formatearNumero } from "../../../utils/moneda";
import { formatearFechaCalendario, hoyLocal } from "../../../utils/fechas";
import { descargarCSV } from "../../../utils/csv";
import "./ReportesSection.css";

// Fase 5 · 5.6 y 5.7 (F5-9) · Admin › Reportes: rango de fechas de Bogotá, gráficos de barras en HTML (sin
// librería: barras horizontales de una sola serie, con su valor escrito y la tabla debajo) y CSV de cada reporte.
const sumarDias = (fecha, n) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const METODOS = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia" };
const minutos = (v) => (v === null || v === undefined ? "—" : `${formatearNumero(v)} min`);

/** Barras horizontales de una serie: etiqueta, barra proporcional y valor (texto en tinta, no en el color). */
function Barras({ titulo, filas, etiqueta, valor, formato }) {
  const max = Math.max(...filas.map(valor), 0);
  if (!filas.length || max <= 0) return <p className="reportes__vacio">Sin datos para graficar en este rango.</p>;
  return (
    <ul className="reportes-barras" aria-label={titulo}>
      {filas.map((f) => {
        const v = valor(f);
        return (
          <li key={etiqueta(f)} title={`${etiqueta(f)}: ${formato(v)}`}>
            <span className="reportes-barras__etiqueta">{etiqueta(f)}</span>
            <span className="reportes-barras__pista" aria-hidden="true">
              <span className="reportes-barras__barra" style={{ width: `${Math.max((v / max) * 100, v > 0 ? 1.5 : 0)}%` }} />
            </span>
            <span className="reportes-barras__valor">{formato(v)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Una tarjeta de reporte: título, botón CSV, gráfico opcional y la tabla (la vista accesible de los datos). */
function Reporte({ titulo, archivo, columnas, filas, grafico, nota }) {
  return (
    <section className="admin-card reportes-tarjeta" aria-labelledby={`rep-${archivo}`}>
      <div className="reportes-tarjeta__cabecera">
        <h3 id={`rep-${archivo}`}>{titulo}</h3>
        <button type="button" className="admin-button--secondary-sm" disabled={!filas.length}
          onClick={() => descargarCSV(archivo, columnas.map((c) => ({ titulo: c.titulo, valor: c.csv || c.valor })), filas)}
          aria-label={`Descargar CSV de ${titulo}`}>
          <Download size={14} aria-hidden="true" />
          <span>CSV</span>
        </button>
      </div>
      {nota && <p className="reportes__nota">{nota}</p>}
      {grafico}
      <div className="admin-table-container">
        <table className="admin-table inventario-tabla-compacta reportes-tabla" aria-label={titulo}>
          <thead><tr>{columnas.map((c) => <th key={c.titulo} className={c.numero ? "reportes-num" : ""}>{c.titulo}</th>)}</tr></thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>{columnas.map((c) => <td key={c.titulo} className={c.numero ? "reportes-num" : ""}>{c.mostrar ? c.mostrar(f) : c.valor(f)}</td>)}</tr>
            ))}
            {!filas.length && <tr><td colSpan={columnas.length} className="admin-table__empty">Sin datos en este rango.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const peso = (campo, titulo) => ({ titulo, numero: true, valor: (f) => f[campo], mostrar: (f) => formatearCOP(f[campo]) });
const numero = (campo, titulo) => ({ titulo, numero: true, valor: (f) => f[campo], mostrar: (f) => formatearNumero(f[campo]) });
const texto = (campo, titulo) => ({ titulo, valor: (f) => f[campo] });

export default function ReportesSection() {
  const hoy = hoyLocal();
  const [rango, setRango] = useState({ desde: sumarDias(hoy, -6), hasta: hoy });
  const [vista, setVista] = useState("ventas");
  const [datos, setDatos] = useState({ ventas: null, operacion: null });
  const [estado, setEstado] = useState({ cargando: true, error: "" });

  const consultar = useCallback(async ({ desde, hasta }) => {
    setEstado({ cargando: true, error: "" });
    try {
      const q = `?desde=${desde}&hasta=${hasta}`;
      const [ventas, operacion] = await Promise.all([api.get(`/v1/admin/reportes/ventas${q}`), api.get(`/v1/admin/reportes/operacion${q}`)]);
      setDatos({ ventas, operacion });
      setEstado({ cargando: false, error: "" });
    } catch (e) {
      setEstado({ cargando: false, error: e.message });
    }
  }, []);
  // Primera carga: últimos 7 días (la función solo cambia el estado tras la respuesta)
  useEffect(() => {
    let activo = true;
    const q = `?desde=${sumarDias(hoy, -6)}&hasta=${hoy}`;
    Promise.all([api.get(`/v1/admin/reportes/ventas${q}`), api.get(`/v1/admin/reportes/operacion${q}`)])
      .then(([ventas, operacion]) => {
        if (!activo) return;
        setDatos({ ventas, operacion });
        setEstado({ cargando: false, error: "" });
      })
      .catch((e) => activo && setEstado({ cargando: false, error: e.message }));
    return () => { activo = false; };
  }, [hoy]);

  const atajo = (dias) => {
    const nuevo = { desde: sumarDias(hoy, -(dias - 1)), hasta: hoy };
    setRango(nuevo);
    consultar(nuevo);
  };
  const enviar = (e) => {
    e.preventDefault();
    if (rango.desde && rango.hasta) consultar(rango);
  };

  const v = datos.ventas;
  const o = datos.operacion;
  const sufijo = v ? `${v.rango.desde}_${v.rango.hasta}` : "";

  return (
    <div className="admin-section reportes">
      <div className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Reportes</h2>
          <p className="admin-section__subtitle">Ventas y operación del café, con fechas y horas de Bogotá.</p>
        </div>
      </div>

      <form className="reportes-filtros" onSubmit={enviar} aria-label="Rango de fechas">
        <label>
          <span>Desde</span>
          <input type="date" className="admin-form-input" value={rango.desde} max={rango.hasta} onChange={(e) => setRango({ ...rango, desde: e.target.value })} />
        </label>
        <label>
          <span>Hasta</span>
          <input type="date" className="admin-form-input" value={rango.hasta} min={rango.desde} max={hoy} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} />
        </label>
        <button type="submit" className="admin-button--primary" disabled={estado.cargando}>Consultar</button>
        <div className="reportes-atajos" role="group" aria-label="Atajos de fecha">
          <button type="button" className="admin-button--secondary-sm" onClick={() => atajo(1)}>Hoy</button>
          <button type="button" className="admin-button--secondary-sm" onClick={() => atajo(7)}>7 días</button>
          <button type="button" className="admin-button--secondary-sm" onClick={() => atajo(30)}>30 días</button>
        </div>
      </form>

      <nav className="inventario-pestanas" aria-label="Tipo de reporte">
        {[["ventas", "Ventas", BarChart3], ["operacion", "Operación y márgenes", Timer]].map(([id, label, Icono]) => (
          <button key={id} type="button" className={vista === id ? "is-active" : ""} aria-current={vista === id ? "page" : undefined} onClick={() => setVista(id)}>
            {createElement(Icono, { size: 18, "aria-hidden": true })}
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {estado.cargando && <p className="reportes__vacio">Cargando reportes…</p>}
      {estado.error && <p className="admin-alert-error" role="alert">{estado.error}</p>}

      {!estado.cargando && v && vista === "ventas" && (
        <>
          <p className="reportes__rango">Del {formatearFechaCalendario(v.rango.desde)} al {formatearFechaCalendario(v.rango.hasta)}</p>
          <div className="reportes-kpis">
            {[
              ["Ventas", formatearCOP(v.resumen.ventas)],
              ["Descuentos", formatearCOP(v.resumen.descuentos ?? 0)], // 6.7
              ["Ventas netas", formatearCOP(v.resumen.ventasNetas ?? v.resumen.ventas)],
              ["Cuentas y pedidos", formatearNumero(v.resumen.tickets)],
              ["Ticket promedio", formatearCOP(v.resumen.ticketPromedio)],
              ["Propinas", formatearCOP(v.resumen.propinas)],
              ["Notas crédito", formatearCOP(v.resumen.notasCredito)],
            ].map(([etiqueta, valor]) => (
              <div key={etiqueta} className={`admin-card reportes-kpi${etiqueta === "Ventas netas" ? " reportes-kpi--destacado" : ""}`}>
                <span>{etiqueta}</span>
                <strong>{valor}</strong>
              </div>
            ))}
          </div>
          <div className="reportes-rejilla">
            <Reporte titulo="Ventas por día" archivo={`ventas-por-dia_${sufijo}`} filas={v.porDia}
              grafico={<Barras titulo="Ventas por día" filas={v.porDia} etiqueta={(f) => formatearFechaCalendario(f.fecha, "diaMes")} valor={(f) => f.total} formato={formatearCOP} />}
              columnas={[texto("fecha", "Fecha"), peso("salon", "Salón"), peso("domicilio", "Domicilio"), peso("paraLlevar", "Para llevar"), peso("total", "Total"), numero("tickets", "Cuentas y pedidos")]} />
            <Reporte titulo="Ventas por franja horaria" archivo={`ventas-por-franja_${sufijo}`} filas={v.porFranja}
              grafico={<Barras titulo="Ventas por franja horaria" filas={v.porFranja} etiqueta={(f) => f.franja} valor={(f) => f.ventas} formato={formatearCOP} />}
              columnas={[texto("franja", "Franja"), peso("ventas", "Ventas"), numero("tickets", "Cuentas y pedidos")]} />
            <Reporte titulo="Ventas por producto" archivo={`ventas-por-producto_${sufijo}`} filas={v.porProducto}
              columnas={[texto("nombre", "Producto"), texto("categoria", "Categoría"), numero("cantidad", "Unidades"), peso("ventas", "Ventas")]} />
            <Reporte titulo="Ventas por categoría" archivo={`ventas-por-categoria_${sufijo}`} filas={v.porCategoria}
              grafico={<Barras titulo="Ventas por categoría" filas={v.porCategoria} etiqueta={(f) => f.categoria} valor={(f) => f.ventas} formato={formatearCOP} />}
              columnas={[texto("categoria", "Categoría"), numero("cantidad", "Unidades"), peso("ventas", "Ventas")]} />
            <Reporte titulo="Ventas por canal" archivo={`ventas-por-canal_${sufijo}`} filas={v.porCanal}
              columnas={[{ titulo: "Canal", valor: (f) => f.etiqueta, mostrar: (f) => (f.disponible ? f.etiqueta : `${f.etiqueta} (aún no existe)`) }, peso("ventas", "Ventas"), numero("tickets", "Cuentas y pedidos")]} />
            <Reporte titulo="Ventas por mesero" archivo={`ventas-por-mesero_${sufijo}`} filas={v.porMesero}
              columnas={[texto("mesero", "Mesero"), numero("cuentas", "Cuentas"), peso("ventas", "Ventas"), peso("ticketPromedio", "Ticket promedio"), peso("propinas", "Propinas")]} />
            {/* 6.7 (F6-7) · Descuentos de los comprobantes del rango, por tipo */}
            <Reporte titulo="Descuentos por tipo" archivo={`descuentos-por-tipo_${sufijo}`} filas={v.porDescuento || []}
              nota="De los comprobantes emitidos en el rango. Ventas netas = ventas − descuentos."
              columnas={[texto("etiqueta", "Tipo"), numero("cantidad", "Comprobantes"), peso("monto", "Descontado")]} />
            <Reporte titulo="Por método de pago" archivo={`metodos-de-pago_${sufijo}`} filas={v.porMetodo}
              nota="Lo cobrado en los comprobantes (con propina) menos lo devuelto con notas crédito."
              columnas={[{ titulo: "Método", valor: (f) => METODOS[f.metodo] || f.metodo }, numero("pagos", "Pagos"), peso("cobrado", "Cobrado"), peso("devuelto", "Devuelto"), peso("neto", "Neto")]} />
          </div>
        </>
      )}

      {!estado.cargando && o && vista === "operacion" && (
        <div className="reportes-rejilla">
          <Reporte titulo="Rotación de mesas" archivo={`rotacion-de-mesas_${sufijo}`} filas={o.rotacion}
            nota="Cuentas cerradas que se abrieron en el rango; ocupación = de abrir a cerrar la cuenta."
            columnas={[{ titulo: "Mesa", valor: (f) => f.mesa, mostrar: (f) => `Mesa ${f.mesa}${f.nombre ? ` · ${f.nombre}` : ""}` }, texto("zona", "Zona"), numero("cuentas", "Cuentas"), numero("cuentasPorDia", "Cuentas por día"), { titulo: "Ocupación media", numero: true, valor: (f) => f.ocupacionMediaMin, mostrar: (f) => minutos(f.ocupacionMediaMin) }]} />
          <Reporte titulo="Tiempos de preparación por estación" archivo={`tiempos-por-estacion_${sufijo}`} filas={o.tiempos}
            nota="Espera: de enviar la ronda a «listo». Preparación: de «en preparación» a «listo». Mediana y percentil 90 en minutos."
            columnas={[
              texto("estacion", "Estación"), numero("items", "Ítems"),
              { titulo: "Espera (mediana)", numero: true, valor: (f) => f.espera.mediana, mostrar: (f) => minutos(f.espera.mediana) },
              { titulo: "Espera (p90)", numero: true, valor: (f) => f.espera.p90, mostrar: (f) => minutos(f.espera.p90) },
              { titulo: "Preparación (mediana)", numero: true, valor: (f) => f.preparacion.mediana, mostrar: (f) => minutos(f.preparacion.mediana) },
              { titulo: "Preparación (p90)", numero: true, valor: (f) => f.preparacion.p90, mostrar: (f) => minutos(f.preparacion.p90) },
            ]} />
          <Reporte titulo="Costo frente a venta por producto" archivo={`margen-por-producto_${sufijo}`} filas={o.margenes}
            nota={`Costo con las recetas y el costo promedio actual de los insumos. Total: venta ${formatearCOP(o.totalesMargen.ventas)}, costo ${formatearCOP(o.totalesMargen.costo)}, margen ${formatearCOP(o.totalesMargen.margen)} (${formatearNumero(o.totalesMargen.margenPct)} %).`}
            columnas={[
              { titulo: "Producto", valor: (f) => f.nombre, mostrar: (f) => (f.conReceta ? f.nombre : `${f.nombre} (sin receta)`) },
              numero("cantidad", "Unidades"), peso("ventas", "Venta"), peso("costo", "Costo"), peso("margen", "Margen"),
              { titulo: "Margen %", numero: true, valor: (f) => f.margenPct, mostrar: (f) => `${formatearNumero(f.margenPct)} %` },
            ]} />
        </div>
      )}
    </div>
  );
}
