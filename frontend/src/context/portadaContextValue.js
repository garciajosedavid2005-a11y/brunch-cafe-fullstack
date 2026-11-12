import { createContext } from "react";

// 2.0b · ¿Hay una foto de portada montada? Sin proveedor: no (navbar sólido)
export const PortadaContext = createContext({ hayPortada: false, registrar: () => () => {} });
