// 2.4 (revisor-visual) · «Actualizado hace N s» cambia cada segundo: no puede estar en una región viva
// (un lector de pantalla lo anunciaría sin parar). Se anuncian el error, sin los segundos, y el estado
// del tiempo real.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Actualizado from "./Actualizado";

const enRegionViva = (nodo) => Boolean(nodo.closest("[aria-live], [role='status'], [role='alert']"));

describe("Actualizado", () => {
  it("el contador de segundos no está en una región viva", () => {
    render(<Actualizado desde={Date.now() - 5000} error="" onActualizar={() => {}} enVivo="en_vivo" />);
    expect(enRegionViva(screen.getByText(/Actualizado hace/))).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent("En vivo");
  });

  it("el error se anuncia una vez, sin los segundos que cambian", () => {
    render(<Actualizado desde={Date.now() - 5000} error="falló" onActualizar={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/^No se pudo actualizar\. Se reintenta solo\.$/);
    expect(enRegionViva(screen.getByText(/último dato hace/))).toBe(false);
  });
});
