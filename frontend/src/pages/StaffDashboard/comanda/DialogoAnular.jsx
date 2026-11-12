import { useId, useState } from "react";
import ModalComanda from "./ModalComanda";
import { MOTIVOS_ANULACION } from "./estadosComanda";

// 1.7 · Anular un ítem enviado (F1-6, D1): solo con item:anular, motivo del catálogo; «Otro» exige el
// detalle (el backend responde 400 MOTIVO_REQUERIDO). No se cobra y queda en el historial (mermas, Fase 5).
export default function DialogoAnular({ item, onConfirmar, onCerrar }) {
  const id = useId();
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const anular = async () => {
    if (!motivo) return setError("Elige el motivo de la anulación.");
    if (motivo === "otro" && !detalle.trim()) return setError("Describe el motivo en el detalle.");
    setEnviando(true);
    const fallo = await onConfirmar({ motivo, ...(detalle.trim() ? { detalle: detalle.trim() } : {}) });
    if (!fallo) return;
    setError(fallo.message);
    setEnviando(false);
  };

  const pie = (
    <>
      {error && <p className="comanda__error" role="alert">{error}</p>}
      <div className="modal-comanda__acciones">
        <button type="button" className="comanda__boton comanda__boton--secundario" data-modal-inicial onClick={onCerrar}>Volver</button>
        <button type="button" className="comanda__boton comanda__boton--peligro" disabled={enviando} onClick={anular}>Anular ítem</button>
      </div>
    </>
  );

  return (
    <ModalComanda titulo={`Anular ${item.nombre}`} subtitulo="No se cobra y queda registrado con tu nombre y el motivo." onCerrar={onCerrar} pie={pie}>
      <fieldset className="comanda-grupo">
        <legend>Motivo</legend>
        <div className="comanda-grupo__opciones comanda-grupo__opciones--lista">
          {Object.entries(MOTIVOS_ANULACION).map(([codigo, etiqueta]) => (
            <label key={codigo} className={`comanda-opcion${motivo === codigo ? " is-marcada" : ""}`}>
              <input type="radio" name={`${id}-motivo`} checked={motivo === codigo}
                onChange={() => { setMotivo(codigo); setError(""); }} />
              <span>{etiqueta}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="comanda__campo">
        <span className="comanda__etiqueta">Detalle{motivo === "otro" ? " *" : " (opcional)"}</span>
        <textarea rows={2} maxLength={300} value={detalle} onChange={(e) => { setDetalle(e.target.value); setError(""); }} />
      </label>
    </ModalComanda>
  );
}
