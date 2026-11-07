import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";

vi.mock("../../../services/api", () => ({
  apiRequest: vi.fn(),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

import { api } from "../../../services/api";
import SalonSection from "./SalonSection";

// 1.2 · Admin › Salón: zonas y mesas (tabla + formulario)
const ZONAS = [
  { id: "z1", nombre: "Interior", orden: 1, activa: true, ejemplo: true, mesas: 2 },
  { id: "z2", nombre: "Terraza", orden: 2, activa: false, ejemplo: false, mesas: 0 },
];
const MESAS = [
  { id: "m1", numero: 1, nombre: "", zona: { id: "z1", nombre: "Interior" }, capacidad: 2, estado: "libre", combinable: true, activa: true, posicion: null, ejemplo: true },
  { id: "m2", numero: 3, nombre: "Ventana", zona: { id: "z1", nombre: "Interior" }, capacidad: 4, estado: "ocupada", combinable: false, activa: true, posicion: null, ejemplo: false },
];

const montar = async () => {
  api.get.mockImplementation((ruta) => Promise.resolve(ruta === "/v1/admin/zonas" ? ZONAS : MESAS));
  render(<DialogoProvider><SalonSection /></DialogoProvider>);
  await screen.findByRole("table", { name: "Zonas del salón" });
  await screen.findByRole("table", { name: "Mesas del salón" });
};

describe("Admin › Salón", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
  });

  it("lista zonas y mesas con su estado en texto (no solo color) y marca los datos de ejemplo", async () => {
    await montar();
    const zonas = screen.getByRole("table", { name: "Zonas del salón" });
    const filaInterior = within(zonas).getByText("Interior").closest("tr");
    expect(within(filaInterior).getByText("Ejemplo")).toBeInTheDocument();
    expect(within(filaInterior).getByText("Activa")).toBeInTheDocument();
    expect(within(zonas).getByText("Terraza").closest("tr")).toHaveTextContent("Inactiva");

    const mesas = screen.getByRole("table", { name: "Mesas del salón" });
    const fila3 = within(mesas).getByText("Mesa 3").closest("tr");
    expect(fila3).toHaveTextContent("Ventana");
    expect(fila3).toHaveTextContent("4 personas");
    expect(within(fila3).getByText("Ocupada")).toHaveClass("admin-badge--warning");
    const fila1 = within(mesas).getByText("Mesa 1").closest("tr");
    expect(fila1).toHaveTextContent("Combinable");
    expect(within(fila1).getByText("Libre")).toHaveClass("admin-badge--success");
  });

  it("crea una mesa con número, zona (solo activas), capacidad y combinable", async () => {
    await montar();
    api.post.mockResolvedValue({ ...MESAS[0], id: "m9", numero: 9 });
    fireEvent.click(screen.getByRole("button", { name: "Nueva mesa" }));
    const dialogo = screen.getByRole("dialog", { name: "Nueva mesa" });
    fireEvent.change(within(dialogo).getByLabelText("Número *"), { target: { value: "9" } });
    const zona = within(dialogo).getByLabelText("Zona *");
    expect([...zona.options].map((o) => o.textContent)).toEqual(["Selecciona una zona", "Interior"]);
    fireEvent.change(zona, { target: { value: "z1" } });
    fireEvent.change(within(dialogo).getByLabelText("Capacidad (personas) *"), { target: { value: "2" } });
    fireEvent.click(within(dialogo).getByLabelText(/se puede unir/i));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Crear mesa" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/v1/admin/mesas", {
      numero: 9, nombre: "", zona: "z1", capacidad: 2, combinable: true, activa: true,
    }));
  });

  it("muestra el error del backend (p. ej. número duplicado) y no cierra el formulario", async () => {
    await montar();
    api.post.mockRejectedValue(new Error("Ya existe la mesa 1."));
    fireEvent.click(screen.getByRole("button", { name: "Nueva mesa" }));
    const dialogo = screen.getByRole("dialog", { name: "Nueva mesa" });
    fireEvent.change(within(dialogo).getByLabelText("Número *"), { target: { value: "1" } });
    fireEvent.change(within(dialogo).getByLabelText("Zona *"), { target: { value: "z1" } });
    fireEvent.change(within(dialogo).getByLabelText("Capacidad (personas) *"), { target: { value: "2" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Crear mesa" }));
    expect(await screen.findByText("Ya existe la mesa 1.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Nueva mesa" })).toBeInTheDocument();
  });

  it("edita una zona (nombre, orden y activa) con PUT", async () => {
    await montar();
    api.put.mockResolvedValue({ ...ZONAS[1], activa: true });
    const fila = within(screen.getByRole("table", { name: "Zonas del salón" })).getByText("Terraza").closest("tr");
    fireEvent.click(within(fila).getByRole("button", { name: "Editar zona Terraza" }));
    const dialogo = screen.getByRole("dialog", { name: "Editar zona" });
    expect(within(dialogo).getByLabelText("Nombre *")).toHaveValue("Terraza");
    fireEvent.click(within(dialogo).getByLabelText("Activa (aparece en el plano)"));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/v1/admin/zonas/z2", { nombre: "Terraza", orden: 2, activa: true }));
  });

  it("al borrar una mesa pide confirmación y recarga las zonas (conteo de mesas)", async () => {
    await montar();
    api.delete.mockResolvedValue({ message: "Mesa eliminada." });
    const fila = within(screen.getByRole("table", { name: "Mesas del salón" })).getByText("Mesa 1").closest("tr");
    fireEvent.click(within(fila).getByRole("button", { name: "Eliminar mesa 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar mesa" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/v1/admin/mesas/m1"));
    await waitFor(() => expect(api.get.mock.calls.filter(([r]) => r === "/v1/admin/zonas").length).toBeGreaterThan(1));
  });

  it("al editar una mesa de una zona inactiva, la zona actual sigue seleccionada (marcada como inactiva)", async () => {
    api.get.mockImplementation((ruta) => Promise.resolve(ruta === "/v1/admin/zonas"
      ? ZONAS
      : [{ ...MESAS[0], id: "m5", numero: 5, zona: { id: "z2", nombre: "Terraza" } }]));
    render(<DialogoProvider><SalonSection /></DialogoProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Editar mesa 5" }));
    const zona = within(screen.getByRole("dialog", { name: "Editar mesa" })).getByLabelText("Zona *");
    expect(zona).toHaveValue("z2");
    expect([...zona.options].map((o) => o.textContent)).toEqual(["Selecciona una zona", "Interior", "Terraza (inactiva)"]);
  });

  it("filtra las mesas por zona", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Filtrar mesas por zona"), { target: { value: "z2" } });
    const mesas = screen.getByRole("table", { name: "Mesas del salón" });
    expect(within(mesas).queryByText("Mesa 1")).not.toBeInTheDocument();
    expect(within(mesas).getByText(/no hay mesas en esta zona/i)).toBeInTheDocument();
  });
});
