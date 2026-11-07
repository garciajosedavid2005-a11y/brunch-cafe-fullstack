import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";

vi.mock("../../../services/api", () => ({
  apiRequest: vi.fn(),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

import { api } from "../../../services/api";
import CategoriesSection from "./CategoriesSection";

// 1.3 · Estación por defecto de cada categoría (F1-3)
const COCINA = { id: "e1", codigo: "cocina", nombre: "Cocina", activa: true };
const BARRA = { id: "e2", codigo: "barra", nombre: "Barra", activa: true };
const HORNO = { id: "e3", codigo: "horno", nombre: "Horno", activa: false };
const CATEGORIAS = [
  { id: "c1", nombre: "Bebidas", descripcion: "Frías y calientes", productosAsociados: 4, estacion: { id: "e2", codigo: "barra", nombre: "Barra" } },
  { id: "c2", nombre: "Antigua", descripcion: "", productosAsociados: 0, estacion: null },
];

const montar = async () => {
  api.get.mockImplementation((ruta) => Promise.resolve(ruta === "/v1/admin/estaciones" ? [BARRA, COCINA, HORNO] : CATEGORIAS));
  render(<DialogoProvider><CategoriesSection /></DialogoProvider>);
  return screen.findByRole("table", { name: "Categorías del menú" });
};

describe("Admin › Categorías: estación por defecto", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
  });

  it("muestra la estación de cada categoría y avisa de la que no tiene", async () => {
    const tabla = await montar();
    expect(within(tabla).getByText("Bebidas").closest("tr")).toHaveTextContent("Barra");
    expect(within(tabla).getByText("Antigua").closest("tr")).toHaveTextContent("Sin estación");
  });

  it("una categoría nueva propone Cocina y solo ofrece estaciones activas", async () => {
    await montar();
    api.post.mockResolvedValue({ ...CATEGORIAS[0], id: "c9", nombre: "Postres" });
    fireEvent.click(screen.getByRole("button", { name: /nueva categoría/i }));
    const dialogo = screen.getByRole("dialog", { name: "Nueva Categoría" });
    const estacion = within(dialogo).getByLabelText("Estación por defecto *");
    expect(estacion).toHaveValue("e1");
    expect([...estacion.options].map((o) => o.textContent)).toEqual(["Barra", "Cocina"]);
    fireEvent.change(within(dialogo).getByLabelText("Nombre de la categoría *"), { target: { value: "Postres" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Crear categoría" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/v1/admin/categorias", {
      nombre: "Postres", descripcion: "", estacionId: "e1",
    }));
  });

  it("al editar conserva la estación y permite cambiarla", async () => {
    await montar();
    api.put.mockResolvedValue({ ...CATEGORIAS[0], estacion: { id: "e1", codigo: "cocina", nombre: "Cocina" } });
    fireEvent.click(within(screen.getByRole("table", { name: "Categorías del menú" })).getByText("Bebidas").closest("tr").querySelector("button"));
    const dialogo = screen.getByRole("dialog", { name: "Editar Categoría" });
    const estacion = within(dialogo).getByLabelText("Estación por defecto *");
    expect(estacion).toHaveValue("e2");
    fireEvent.change(estacion, { target: { value: "e1" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/v1/admin/categorias/c1", expect.objectContaining({ estacionId: "e1" })));
  });

  it("si no cargan las estaciones lo dice con un reintento (no un selector vacío sin explicación)", async () => {
    api.get.mockImplementation((ruta) => (ruta === "/v1/admin/estaciones" ? Promise.reject(new Error("Sin conexión")) : Promise.resolve(CATEGORIAS)));
    render(<DialogoProvider><CategoriesSection /></DialogoProvider>);
    await screen.findByRole("table", { name: "Categorías del menú" });
    fireEvent.click(screen.getByRole("button", { name: /nueva categoría/i }));
    const dialogo = screen.getByRole("dialog", { name: "Nueva Categoría" });
    expect(await within(dialogo).findByText(/no se pudieron cargar las estaciones/i)).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("una categoría sin estación (anterior a la migración) exige elegirla al editar", async () => {
    await montar();
    fireEvent.click(within(screen.getByRole("table", { name: "Categorías del menú" })).getByText("Antigua").closest("tr").querySelector("button"));
    const estacion = within(screen.getByRole("dialog", { name: "Editar Categoría" })).getByLabelText("Estación por defecto *");
    expect(estacion).toHaveValue("");
    expect(estacion).toBeRequired();
  });

  it("1.3b · con productos no deja borrar y dice por qué; sin productos borra y muestra un 409 si el conteo estaba desfasado", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar categoría Bebidas" }));
    const aviso = screen.getByRole("dialog", { name: "¿Eliminar categoría?" });
    expect(aviso).toHaveTextContent(/la usan 4 productos/i);
    expect(within(aviso).queryByRole("button", { name: /sí, eliminar/i })).not.toBeInTheDocument();
    fireEvent.click(within(aviso).getByRole("button", { name: "Entendido" }));

    api.delete.mockRejectedValue(new Error("No se puede eliminar: la usan 1 producto. Muévelos a otra categoría primero."));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar categoría Antigua" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "¿Eliminar categoría?" })).getByRole("button", { name: /sí, eliminar/i }));
    expect(await screen.findByText(/la usan 1 producto/i)).toBeInTheDocument();
    expect(api.delete).toHaveBeenCalledWith("/v1/admin/categorias/c2");
  });
});
