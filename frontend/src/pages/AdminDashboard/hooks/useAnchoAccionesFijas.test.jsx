import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useRef, useState } from "react";
import useAnchoAccionesFijas from "./useAnchoAccionesFijas";

// 1.6b · Mide la columna «Acciones» de cada tabla con acciones fijas y lo deja en --ancho-acciones de la
// tabla, para fijar la columna de estado justo a su izquierda. jsdom no tiene ResizeObserver: se simula.
let observados;
let avisar;
class ResizeObserverFalso {
  constructor(cb) { avisar = cb; observados = []; }
  observe(el) { observados.push(el); }
  disconnect() { observados = []; }
}

function Tabla({ conTabla = true }) {
  const ref = useRef(null);
  useAnchoAccionesFijas(ref);
  return (
    <div ref={ref}>
      {conTabla && (
        <table className="admin-table--acciones-fijas" data-testid="tabla">
          <thead><tr><th>Nombre</th><th className="admin-col-estado">Estado</th><th>Acciones</th></tr></thead>
        </table>
      )}
    </div>
  );
}

function TablaQueAparece() {
  const [visible, setVisible] = useState(false);
  return <><button onClick={() => setVisible(true)}>mostrar</button><Tabla conTabla={visible} /></>;
}

afterEach(() => vi.unstubAllGlobals());

describe("useAnchoAccionesFijas", () => {
  it("escribe el ancho de la columna «Acciones» en --ancho-acciones de su tabla", () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverFalso);
    const { getByTestId } = render(<Tabla />);
    const th = getByTestId("tabla").querySelector("th:last-child");
    expect(observados).toContain(th);
    th.getBoundingClientRect = () => ({ width: 183.4 });
    act(() => avisar([{ target: th }]));
    expect(getByTestId("tabla").style.getPropertyValue("--ancho-acciones")).toBe("183.4px");
  });

  it("también mide las tablas que aparecen después (al cargar los datos)", async () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverFalso);
    const { getByText, findByTestId } = render(<TablaQueAparece />);
    expect(observados).toHaveLength(0);
    act(() => getByText("mostrar").click());
    const tabla = await findByTestId("tabla");
    await vi.waitFor(() => expect(observados).toContain(tabla.querySelector("th:last-child")));
  });

  it("sin ResizeObserver no falla (la columna de estado queda en su sitio)", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    expect(() => render(<Tabla />)).not.toThrow();
  });
});
