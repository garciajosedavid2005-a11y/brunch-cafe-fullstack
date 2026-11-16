import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { DialogoProvider } from "../../context/DialogoContext";

vi.mock("../../services/api", () => ({
  apiRequest: vi.fn(),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

import { api } from "../../services/api";
import Inventario from "./Inventario";

// Fase 5 · 5.1 · Pantalla de inventario: insumos con su nivel en texto (no solo color) y alta con existencia inicial
const CAFE = { id: "i1", nombre: "Café en grano", unidad: "g", existencia: 300, minimo: 500, costoPromedio: 45.5, valor: 13650, activo: true, nivel: "bajo", version: 0 };
const LECHE = { id: "i2", nombre: "Leche entera", unidad: "ml", existencia: 8000, minimo: 2000, costoPromedio: 4.2, valor: 33600, activo: true, nivel: "ok", version: 0 };

const montar = async (permisos) => {
  api.get.mockResolvedValue([CAFE, LECHE]);
  render(<DialogoProvider><Inventario permisos={permisos} /></DialogoProvider>);
  return screen.findByRole("table", { name: "Insumos del inventario" });
};

describe("Inventario › Insumos", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
  });

  it("muestra existencia, mínimo y nivel en texto", async () => {
    const tabla = await montar(["inventario:ver"]);
    await within(tabla).findByText("Café en grano");
    const fila = within(tabla).getByText("Café en grano").closest("tr");
    expect(fila).toHaveTextContent("300 g");
    expect(fila).toHaveTextContent("Bajo el mínimo");
    expect(within(tabla).getByText("Leche entera").closest("tr")).toHaveTextContent("Suficiente");
  });

  it("sin inventario:gestionar no ofrece crear ni editar", async () => {
    const tabla = await montar(["inventario:ver"]);
    await within(tabla).findByText("Café en grano");
    expect(screen.queryByRole("button", { name: /nuevo insumo/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /editar café/i })).toBeNull();
  });

  it("crea un insumo con existencia inicial escrita con coma decimal", async () => {
    await montar(["inventario:ver", "inventario:gestionar"]);
    api.post.mockResolvedValue({ ...LECHE, id: "i3", nombre: "Aguacate", unidad: "unidad" });
    fireEvent.click(await screen.findByRole("button", { name: /nuevo insumo/i }));
    const dialogo = screen.getByRole("dialog", { name: "Nuevo insumo" });
    fireEvent.change(within(dialogo).getByLabelText("Nombre *"), { target: { value: "Aguacate" } });
    fireEvent.change(within(dialogo).getByLabelText("Unidad *"), { target: { value: "unidad" } });
    fireEvent.change(within(dialogo).getByLabelText(/Existencia inicial/), { target: { value: "12,5" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Crear insumo" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/v1/inventario/insumos", { nombre: "Aguacate", unidad: "unidad", existenciaInicial: 12.5 }));
  });
});
