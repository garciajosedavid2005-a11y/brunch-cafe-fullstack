import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import LimiteErrores from "./LimiteErrores";

// 2.6b · Si una parte de la pantalla falla al dibujarse, se ve un aviso con «Recargar» en vez de dejar toda la
// pantalla en blanco, y el error queda en la consola (con la sección) para poder diagnosticarlo.
function Rota() {
  throw new ReferenceError("conAccionesListo is not defined");
}

let consola;
beforeEach(() => { consola = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { consola.mockRestore(); vi.unstubAllGlobals(); });

describe("LimiteErrores (2.6b)", () => {
  it("muestra el aviso de la sección y deja vivo lo que está fuera", () => {
    render(
      <div>
        <nav>Navegación</nav>
        <LimiteErrores seccion="Mesas"><Rota /></LimiteErrores>
      </div>,
    );
    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent("Algo salió mal en esta sección");
    expect(screen.getByRole("button", { name: "Recargar" })).toBeInTheDocument();
    expect(screen.getByText("Navegación")).toBeInTheDocument();
  });

  it("registra el error en la consola con la sección", () => {
    render(<LimiteErrores seccion="Mesas"><Rota /></LimiteErrores>);
    const propias = consola.mock.calls.filter(([primero]) => String(primero).includes("[Brunch Café]"));
    expect(propias).toHaveLength(1);
    expect(propias[0].join(" ")).toMatch(/Mesas/);
    expect(propias[0].some((arg) => arg instanceof ReferenceError)).toBe(true);
  });

  it("«Recargar» vuelve a cargar la página", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    render(<LimiteErrores seccion="Mesas"><Rota /></LimiteErrores>);
    fireEvent.click(screen.getByRole("button", { name: "Recargar" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("sin errores, solo dibuja su contenido", () => {
    render(<LimiteErrores seccion="Mesas"><p>Plano</p></LimiteErrores>);
    expect(screen.getByText("Plano")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
