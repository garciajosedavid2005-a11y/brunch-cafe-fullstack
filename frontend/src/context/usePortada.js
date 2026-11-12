import { useContext, useLayoutEffect } from "react";
import { PortadaContext } from "./portadaContextValue";

/** true mientras haya una foto de portada montada (el navbar va transparente sobre ella). */
export const useHayPortada = () => useContext(PortadaContext).hayPortada;

/**
 * Para los componentes de portada con foto oscura (Hero, HeroReservas, HeroComentarios): mientras estén
 * montados, el navbar va transparente con texto claro. Antes de pintar (useLayoutEffect), para que el
 * navbar no parpadee entre sólido y transparente.
 */
export const useMarcarPortada = () => {
  const { registrar } = useContext(PortadaContext);
  useLayoutEffect(() => registrar(), [registrar]);
};
