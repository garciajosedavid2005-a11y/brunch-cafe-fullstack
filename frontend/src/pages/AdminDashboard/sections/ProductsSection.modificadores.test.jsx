import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";

vi.mock("../../../services/api", () => ({
  apiAssetUrl: (p) => p,
  apiRequest: vi.fn(),
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { api } from "../../../services/api";
import ProductsSection from "./ProductsSection";

// 1.3 · Admin › Productos: estación propia (con la heredada a la vista) y grupos de modificadores
const BARRA = { id: "e2", codigo: "barra", nombre: "Barra" };
const ESTACIONES = [{ ...BARRA, activa: true }, { id: "e1", codigo: "cocina", nombre: "Cocina", activa: true }, { id: "e3", codigo: "horno", nombre: "Horno", activa: false }];
const CATEGORIAS = [{ id: "c1", nombre: "Bebidas", estacion: BARRA }];
const GRUPOS = [
  { id: "g1", nombre: "Leche", activo: true, obligatorio: false, min: 0, max: 1, opciones: [] },
  { id: "g2", nombre: "Tamaño", activo: true, obligatorio: false, min: 0, max: 1, opciones: [] },
  { id: "g3", nombre: "Extras", activo: false, obligatorio: false, min: 0, max: 1, opciones: [] },
];
const LATTE = {
  id: "p1", codigo: 1, nombre: "Latte", precio: 9000, descripcion: "", imagen: "", destacado: false, disponible: true,
  categoria: "Bebidas", categoriaId: "c1", estacionId: null, estacionEfectiva: BARRA,
  gruposModificadores: [{ id: "g2", nombre: "Tamaño", activo: true }, { id: "g3", nombre: "Extras", activo: false }],
};

const RUTAS = {
  "/v1/admin/productos": [LATTE],
  "/v1/admin/categorias": CATEGORIAS,
  "/v1/admin/estaciones": ESTACIONES,
  "/v1/admin/grupos-modificadores": GRUPOS,
};

const abrirEdicion = async () => {
  api.get.mockImplementation((ruta) => Promise.resolve(RUTAS[ruta]));
  api.put.mockImplementation((ruta, datos) => Promise.resolve({ ...LATTE, ...datos }));
  render(<DialogoProvider><ProductsSection /></DialogoProvider>);
  const fila = (await screen.findByText("Latte")).closest("tr");
  fireEvent.click(within(fila).getByRole("button", { name: /editar/i }));
  return screen.getByRole("dialog", { name: "Editar Producto" });
};

describe("Productos: estación y modificadores (1.3)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("la tabla muestra la estación efectiva y cuántos grupos tiene", async () => {
    api.get.mockImplementation((ruta) => Promise.resolve(RUTAS[ruta]));
    render(<DialogoProvider><ProductsSection /></DialogoProvider>);
    const fila = (await screen.findByText("Latte")).closest("tr");
    expect(fila).toHaveTextContent("Barra");
    expect(fila).toHaveTextContent("2 grupos de modificadores");
  });

  it("la estación hereda por defecto (y dice cuál) y se puede sobrescribir solo con estaciones activas", async () => {
    const dialogo = await abrirEdicion();
    const estacion = within(dialogo).getByLabelText("Estación");
    expect(estacion).toHaveValue("");
    expect([...estacion.options].map((o) => o.textContent)).toEqual(["Heredar de la categoría (Barra)", "Barra", "Cocina"]);
    fireEvent.change(estacion, { target: { value: "e1" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/v1/admin/productos/p1", expect.objectContaining({ estacionId: "e1" })));
  });

  it("«Heredar» envía null", async () => {
    const dialogo = await abrirEdicion();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/v1/admin/productos/p1", expect.objectContaining({ estacionId: null })));
  });

  it("si no cargan los grupos lo dice (no «no hay grupos») y conserva los asignados al guardar", async () => {
    api.get.mockImplementation((ruta) => (ruta === "/v1/admin/grupos-modificadores"
      ? Promise.reject(new Error("Sin conexión"))
      : Promise.resolve(RUTAS[ruta])));
    api.put.mockImplementation((ruta, datos) => Promise.resolve({ ...LATTE, ...datos }));
    render(<DialogoProvider><ProductsSection /></DialogoProvider>);
    fireEvent.click(within((await screen.findByText("Latte")).closest("tr")).getByRole("button", { name: /editar/i }));
    const dialogo = screen.getByRole("dialog", { name: "Editar Producto" });
    expect(within(dialogo).getByText(/no se pudieron cargar los grupos/i)).toBeInTheDocument();
    expect(within(dialogo).queryByText(/no hay grupos activos/i)).not.toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/v1/admin/productos/p1", expect.objectContaining({ gruposModificadoresIds: ["g2", "g3"] })));
  });

  it("grupos: los asignados marcados en su orden, el inactivo asignado se ve como tal y los nuevos van al final", async () => {
    const dialogo = await abrirEdicion();
    const grupos = within(dialogo).getByRole("group", { name: "Grupos de modificadores" });
    expect(within(grupos).getByLabelText("Tamaño")).toBeChecked();
    expect(within(grupos).getByLabelText("Extras (inactivo)")).toBeChecked();
    expect(within(grupos).getByLabelText("Leche")).not.toBeChecked();
    expect(within(dialogo).getByText("Orden en la comanda: Tamaño → Extras (inactivo)")).toBeInTheDocument();

    fireEvent.click(within(grupos).getByLabelText("Extras (inactivo)"));
    fireEvent.click(within(grupos).getByLabelText("Leche"));
    // Un grupo inactivo que se quita ya no se puede volver a marcar
    expect(within(grupos).queryByLabelText("Extras (inactivo)")).not.toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/v1/admin/productos/p1", expect.objectContaining({ gruposModificadoresIds: ["g2", "g1"] })));
  });
});
