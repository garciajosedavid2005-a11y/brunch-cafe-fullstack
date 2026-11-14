import { useEffect } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { formatearCOP } from "../../../utils/moneda";
import { formatearFecha, formatearHora } from "../../../utils/fechas";
import { etiquetaMetodo } from "./cobro";

// Fase 3 · Comprobante interno (F3-4, F3-5): en pantalla e imprimible en tirilla de 80 mm (Caja.css,
// @media print: solo se imprime el comprobante). Sin DIAN: lleva sus leyendas.

// Mientras el comprobante está a la vista, al imprimir (botón o menú del navegador) solo sale él
const CLASE_IMPRESION = "imprimiendo-comprobante";

export default function Comprobante({ comprobante: c, onVolver }) {
  useEffect(() => {
    document.body.classList.add(CLASE_IMPRESION);
    const pagina = document.createElement("style");
    pagina.textContent = "@page { size: 80mm auto; margin: 0; }";
    document.head.appendChild(pagina);
    return () => {
      document.body.classList.remove(CLASE_IMPRESION);
      pagina.remove();
    };
  }, []);
  return (
    <div className="caja-comprobante">
      <div className="caja__acciones no-imprimir">
        <button type="button" className="caja__boton caja__boton--secundario" onClick={onVolver}>
          <ArrowLeft size={18} aria-hidden="true" /> Volver a la caja
        </button>
        <button type="button" className="caja__boton caja__boton--primario" onClick={() => window.print()}>
          <Printer size={18} aria-hidden="true" /> Imprimir
        </button>
      </div>

      <article className="comprobante" aria-label={`Comprobante ${c.codigo}`}>
        <header className="comprobante__cabecera">
          <strong className="comprobante__marca">Brunch Café</strong>
          <span>Comprobante interno</span>
          <strong className="comprobante__codigo">{c.codigo}</strong>
          <span>{formatearFecha(c.emitidoEn)} · {formatearHora(c.emitidoEn)}</span>
        </header>
        <dl className="comprobante__datos">
          <div><dt>{c.mesas.length > 1 ? "Mesas" : "Mesa"}</dt><dd>{c.mesas.join(" + ") || "—"}</dd></div>
          <div><dt>Mesero</dt><dd>{c.mesero || "—"}</dd></div>
          <div><dt>Cajero</dt><dd>{c.cajero || "—"}</dd></div>
        </dl>

        <table className="comprobante__lineas">
          <caption className="sr-only">Consumo</caption>
          <thead><tr><th scope="col">Producto</th><th scope="col">Valor</th></tr></thead>
          <tbody>
            {c.lineas.map((l, i) => (
              <tr key={i}>
                <td>
                  {l.cantidad} × {l.nombre}
                  {l.opciones.length > 0 && <span className="comprobante__detalle">{l.opciones.join(", ")}</span>}
                  {l.cantidad > 1 && <span className="comprobante__detalle">{formatearCOP(l.precioUnitario)} c/u</span>}
                </td>
                <td>{formatearCOP(l.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 3.5 · Se lee como una operación: Consumo + Propina = Total pagado */}
        <dl className="comprobante__totales" role="group" aria-label="Consumo + Propina = Total pagado">
          <div><dt>Consumo</dt><dd>{formatearCOP(c.subtotal)}</dd></div>
          <div><dt><span className="comprobante__operador">+</span> Propina voluntaria</dt><dd>{formatearCOP(c.propina)}</dd></div>
          <div className="comprobante__total"><dt><span className="comprobante__operador">=</span> Total pagado</dt><dd>{formatearCOP(c.total)}</dd></div>
        </dl>

        <dl className="comprobante__pagos">
          {c.pagos.map((p) => (
            <div key={p.metodo}>
              <dt>{etiquetaMetodo(p.metodo)}</dt>
              <dd>
                {formatearCOP(p.monto)}
                {p.metodo === "efectivo" && <span className="comprobante__detalle">Recibido {formatearCOP(p.recibido)} · Cambio {formatearCOP(p.cambio)}</span>}
              </dd>
            </div>
          ))}
        </dl>

        <footer className="comprobante__leyendas">
          {c.leyendas.map((l) => <p key={l}>{l}</p>)}
        </footer>
      </article>
    </div>
  );
}
