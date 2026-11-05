import { useCallback, useMemo, useRef, useState } from "react";
import Dialogo from "../components/Dialogo/Dialogo";
import { DialogoContext } from "./dialogoContextValue";

// Reemplaza window.alert/confirm/prompt por un diálogo propio (un solo diálogo a la vez)
export function DialogoProvider({ children }) {
  const [actual, setActual] = useState(null);
  const resolverRef = useRef(null);
  const contador = useRef(0);

  const abrir = useCallback((opciones) => new Promise((resolve) => {
    // Si había otro abierto, se resuelve como cancelado
    resolverRef.current?.({ confirmado: false, motivo: "" });
    resolverRef.current = resolve;
    contador.current += 1;
    setActual({ ...opciones, clave: contador.current });
  }), []);

  const cerrar = useCallback((resultado) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setActual(null);
    resolve?.(resultado);
  }, []);

  const valor = useMemo(() => ({
    confirmar: (opciones) => abrir({ tipo: "confirmar", ...opciones }),
    avisar: ({ tipo = "aviso", confirmarTexto = "Entendido", ...opciones }) =>
      abrir({ tipo, confirmarTexto, ...opciones }).then(() => undefined),
  }), [abrir]);

  return (
    <DialogoContext.Provider value={valor}>
      {children}
      {actual && (
        <Dialogo
          key={actual.clave}
          {...actual}
          onConfirmar={({ motivo }) => cerrar({ confirmado: true, motivo })}
          onCancelar={() => cerrar({ confirmado: false, motivo: "" })}
        />
      )}
    </DialogoContext.Provider>
  );
}
