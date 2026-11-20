import { useEffect, useState } from "react";
import { ArrowLeft, Ban, Printer } from "lucide-react";
import { apiRequest } from "../../../services/api";
import { useAuth } from "../../../context/useAuth";
import { useDialogo } from "../../../context/useDialogo";
import { tienePermiso } from "../../../utils/permisos";
import { nuevaClave } from "../plano/estadosMesa";
import { formatearCOP } from "../../../utils/moneda";
import { formatearFecha, formatearHora } from "../../../utils/fechas";
import { etiquetaMetodo } from "./cobro";

// Fase 3 · Comprobante interno (F3-4, F3-5): en pantalla e imprimible en tirilla de 80 mm (Caja.css,
// @media print: solo se imprime el comprobante). Sin DIAN: lleva sus leyendas.

// Mientras el comprobante está a la vista, al imprimir (botón o menú del navegador) solo sale él
const CLASE_IMPRESION = "imprimiendo-comprobante";

export default function Comprobante({ comprobante, onVolver }) {
  // 3b.3 · Anular con nota crédito (factura:anular, solo el admin): pide el motivo y muestra la nota
  const [c, setC] = useState(comprobante);
  const [anulando, setAnulando] = useState(false);
  const { user } = useAuth();
  const { confirmar, avisar } = useDialogo();
  const anular = async () => {
    const { confirmado, motivo } = await confirmar({
      titulo: "Anular comprobante",
      mensaje: `Se emitirá una nota crédito por ${formatearCOP(c.total)} que devuelve lo pagado por los mismos métodos. El comprobante ${c.codigo} no se borra y la cuenta no se reabre.`,
      confirmarTexto: "Anular comprobante",
      cancelarTexto: "Volver",
      peligroso: true,
      motivo: { etiqueta: "Motivo", requerido: true },
    });
    if (!confirmado) return;
    if (motivo.trim().length < 5) {
      await avisar({ tipo: "error", titulo: "Motivo muy corto", mensaje: "Escribe un motivo de al menos 5 caracteres." });
      return;
    }
    setAnulando(true);
    try {
      const { nota } = await apiRequest(`/v1/staff/caja/comprobantes/${c.id}/anular`, {
        method: "POST", headers: { "Idempotency-Key": nuevaClave() }, body: JSON.stringify({ motivo: motivo.trim() }),
      });
      setC((actual) => ({ ...actual, anulado: { codigo: nota.codigo, motivo: nota.motivo, emitidaEn: nota.emitidaEn, autor: nota.autor } }));
    } catch (e) {
      await avisar({ tipo: "error", titulo: "No se pudo anular", mensaje: e.message });
    } finally {
      setAnulando(false);
    }
  };
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
        {!c.anulado && tienePermiso(user, "factura:anular") && (
          <button type="button" className="caja__boton caja__boton--secundario caja__boton--peligro" disabled={anulando} onClick={anular}>
            <Ban size={18} aria-hidden="true" /> {anulando ? "Anulando…" : "Anular comprobante"}
          </button>
        )}
      </div>

      <article className="comprobante" aria-label={`Comprobante ${c.codigo}`}>
        <header className="comprobante__cabecera">
          <strong className="comprobante__marca">Brunch Café</strong>
          <span>Comprobante interno</span>
          <strong className="comprobante__codigo">{c.codigo}</strong>
          <span>{formatearFecha(c.emitidoEn)} · {formatearHora(c.emitidoEn)}</span>
          {c.parte && <span>Parte {c.parte.numero}{c.parte.de ? ` de ${c.parte.de}` : ""}</span>}
        </header>
        {c.anulado && (
          <p className="comprobante__anulado" role="status">
            <strong>ANULADO</strong>
            <span>con la nota crédito {c.anulado.codigo}</span>
            <span>{formatearFecha(c.anulado.emitidaEn)} · {formatearHora(c.anulado.emitidaEn)}{c.anulado.autor ? ` · ${c.anulado.autor}` : ""}</span>
            <span>Motivo: {c.anulado.motivo}</span>
          </p>
        )}
        <dl className="comprobante__datos">
          {c.pedido ? (
            <div><dt>Domicilio</dt><dd>{c.pedido}</dd></div>
          ) : (
            <>
              {/* 6.3 · Una para llevar no tiene mesa */}
              {c.mesas.length ? <div><dt>{c.mesas.length > 1 ? "Mesas" : "Mesa"}</dt><dd>{c.mesas.join(" + ")}</dd></div> : <div><dt>Origen</dt><dd>Para llevar</dd></div>}
              <div><dt>Mesero</dt><dd>{c.mesero || "—"}</dd></div>
            </>
          )}
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
