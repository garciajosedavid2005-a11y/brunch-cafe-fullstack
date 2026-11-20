import { createContext } from "react";

// 7.1 · Aviso «X agregado al carrito». Sin proveedor (tests de componentes sueltos) no hace nada.
export const AvisoCarritoContext = createContext({ avisarAgregado: () => {} });
