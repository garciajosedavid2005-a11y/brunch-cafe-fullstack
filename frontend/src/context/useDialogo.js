import { useContext } from "react";
import { DialogoContext } from "./dialogoContextValue";

/**
 * const { confirmar, avisar } = useDialogo();
 * const { confirmado, motivo } = await confirmar({ titulo, mensaje, confirmarTexto, cancelarTexto, peligroso, motivo: { requerido: true } });
 * await avisar({ titulo, mensaje, tipo: "error" });
 */
export function useDialogo() {
  const valor = useContext(DialogoContext);
  if (!valor) throw new Error("useDialogo debe usarse dentro de <DialogoProvider>");
  return valor;
}
