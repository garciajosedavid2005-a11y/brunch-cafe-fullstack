import { useCallback, useMemo, useState } from "react";
import { PortadaContext } from "./portadaContextValue";

// 2.0b · Cuenta las portadas montadas (una página puede montar y desmontar la suya al navegar).
// El navbar es transparente solo con alguna; antes lo decidía la ruta y /reservas sin sesión, que
// no tiene foto, dejaba el texto claro sobre el fondo rosado y la tarjeta debajo del navbar.
export function PortadaProvider({ children }) {
  const [portadas, setPortadas] = useState(0);
  const registrar = useCallback(() => {
    setPortadas((n) => n + 1);
    return () => setPortadas((n) => n - 1);
  }, []);
  const valor = useMemo(() => ({ hayPortada: portadas > 0, registrar }), [portadas, registrar]);
  return <PortadaContext.Provider value={valor}>{children}</PortadaContext.Provider>;
}
