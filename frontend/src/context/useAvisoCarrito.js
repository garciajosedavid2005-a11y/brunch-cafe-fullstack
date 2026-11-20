import { useContext } from "react";
import { AvisoCarritoContext } from "./avisoCarritoValue";

/** const { avisarAgregado } = useAvisoCarrito(); avisarAgregado("Café americano"); */
export function useAvisoCarrito() {
  return useContext(AvisoCarritoContext);
}
