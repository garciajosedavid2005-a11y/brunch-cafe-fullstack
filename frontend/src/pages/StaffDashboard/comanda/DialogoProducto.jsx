import { useId, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { formatearCOP } from "../../../utils/moneda";
import { nuevaClave } from "../plano/estadosMesa";
import ModalComanda from "./ModalComanda";
import { MAX_CANTIDAD, MAX_NOTA, reglaGrupo } from "./estadosComanda";
import "./TomaComanda.css";

// 1.7 · Agregar un producto a la ronda: cantidad, modificadores (F1-4: obligatorios, mínimo y máximo,
// recargo a la vista) y nota libre (F1-5, máx. 140). El backend valida lo mismo y fija el precio.
// Un grupo obligatorio de una sola opción va en radios; el resto, en casillas (se pueden desmarcar).
// 1.12 · El carrito del pedido a domicilio usa este mismo diálogo (máximo 20 y su propio texto).
export default function DialogoProducto({
  producto, onAgregar, onCerrar, maxCantidad = MAX_CANTIDAD, textoAgregar = "Agregar", etiquetaNota = "Nota para cocina o barra (opcional)",
}) {
  const id = useId();
  const grupos = producto.modificadores || [];
  const [cantidad, setCantidad] = useState(1);
  const [seleccion, setSeleccion] = useState({}); // grupoId → [opcionId]
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  // Una clave por intento: un reintento tras un corte de red no duplica el ítem (1.5)
  const clave = useRef(nuevaClave());

  const elegidas = (g) => seleccion[g.id] || [];
  const recargos = grupos.reduce((suma, g) => suma + g.opciones
    .filter((o) => elegidas(g).includes(o.id)).reduce((s, o) => s + o.precioExtra, 0), 0);
  const total = (producto.precio + recargos) * cantidad;

  const alternar = (g, opcionId, marcada) => {
    setError("");
    setSeleccion((actual) => {
      const previas = actual[g.id] || [];
      let nuevas;
      if (g.max === 1) nuevas = marcada ? [opcionId] : [];
      else nuevas = marcada ? [...previas, opcionId] : previas.filter((x) => x !== opcionId);
      return { ...actual, [g.id]: nuevas };
    });
  };

  const agregar = async () => {
    const falta = grupos.find((g) => elegidas(g).length < g.min);
    if (falta) {
      setError(`Elige ${falta.min === 1 ? "una opción de" : `al menos ${falta.min} opciones de`} ${falta.nombre}.`);
      return;
    }
    setEnviando(true);
    const datos = {
      productoId: producto.id,
      cantidad,
      ...(nota.trim() ? { nota: nota.trim() } : {}),
      modificadores: grupos.filter((g) => elegidas(g).length).map((g) => ({ grupoId: g.id, opcionIds: elegidas(g) })),
    };
    const fallo = await onAgregar(datos, clave.current);
    if (!fallo) return; // el padre cierra el diálogo
    if (fallo.status) clave.current = nuevaClave(); // el servidor respondió: el próximo intento es otro
    setError(fallo.message);
    setEnviando(false);
  };

  const pie = (
    <>
      {error && <p className="comanda__error" role="alert">{error}</p>}
      <div className="modal-comanda__acciones">
        <button type="button" className="comanda__boton comanda__boton--secundario" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="comanda__boton comanda__boton--primario" disabled={enviando} onClick={agregar}>
          {textoAgregar} · {formatearCOP(total)}
        </button>
      </div>
    </>
  );

  return (
    <ModalComanda titulo={producto.nombre} subtitulo={formatearCOP(producto.precio)} onCerrar={onCerrar} pie={pie}>
      {grupos.map((g) => {
        const radios = g.obligatorio && g.max === 1;
        return (
          <fieldset key={g.id} className="comanda-grupo">
            <legend>
              {g.nombre} <span className="comanda-grupo__regla">({reglaGrupo(g)})</span>
            </legend>
            <div className="comanda-grupo__opciones">
              {g.opciones.map((o) => {
                const marcada = elegidas(g).includes(o.id);
                const tope = !radios && g.max > 1 && !marcada && elegidas(g).length >= g.max;
                return (
                  <label key={o.id} className={`comanda-opcion${!o.disponible || tope ? " is-deshabilitada" : ""}${marcada ? " is-marcada" : ""}`}>
                    <input
                      type={radios ? "radio" : "checkbox"}
                      name={`${id}-${g.id}`}
                      checked={marcada}
                      disabled={!o.disponible || tope}
                      onChange={(e) => alternar(g, o.id, e.target.checked)}
                    />
                    <span>{o.nombre}</span>
                    {o.precioExtra > 0 && <span className="comanda-opcion__recargo"> + {formatearCOP(o.precioExtra)}</span>}
                    {!o.disponible && <span className="comanda-opcion__agotada"> (agotado)</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <div className="comanda-dialogo__fila">
        <span className="comanda__etiqueta" id={`${id}-cantidad`}>Cantidad</span>
        <div className="comanda__contador" role="group" aria-labelledby={`${id}-cantidad`}>
          <button type="button" className="comanda__boton-icono" aria-label="Quitar uno" disabled={cantidad <= 1}
            onClick={() => setCantidad((n) => Math.max(1, n - 1))}>
            <Minus size={22} aria-hidden="true" />
          </button>
          <output aria-live="polite">{cantidad}</output>
          <button type="button" className="comanda__boton-icono" aria-label="Sumar uno" disabled={cantidad >= maxCantidad}
            onClick={() => setCantidad((n) => Math.min(maxCantidad, n + 1))}>
            <Plus size={22} aria-hidden="true" />
          </button>
        </div>
      </div>

      <label className="comanda__campo">
        <span className="comanda__etiqueta">{etiquetaNota}</span>
        <textarea rows={2} maxLength={MAX_NOTA} value={nota} placeholder="Ej.: sin cebolla, término medio"
          aria-describedby={`${id}-contador`} onChange={(e) => setNota(e.target.value)} />
        <small id={`${id}-contador`} className="comanda__nota">{nota.length}/{MAX_NOTA}</small>
      </label>
    </ModalComanda>
  );
}
