import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";

vi.mock("../../../services/adminApi", () => ({
  adminApi: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock("../../../services/api", () => ({ apiAssetUrl: (p) => p }));

import { adminApi } from "../../../services/adminApi";
import ProductsSection from "./ProductsSection";

const producto = (id, nombre, extra) => ({
  id, codigo: id, nombre, precio: 12000, descripcion: "", imagen: "", destacado: false,
  disponible: true, categoria: "Bebidas", categoriaId: "c1", ...extra,
});
const PRODUCTOS = [producto("p1", "Latte"), producto("p2", "Waffle", { disponible: false })];

const montar = () => {
  adminApi.get.mockImplementation((ruta) =>
    Promise.resolve(ruta === "/categorias" ? [{ id: "c1", nombre: "Bebidas" }] : PRODUCTOS));
  adminApi.put.mockImplementation((ruta, datos) =>
    Promise.resolve({ ...PRODUCTOS.find((p) => ruta.endsWith(p.id)), ...datos }));
  return render(<DialogoProvider><ProductsSection /></DialogoProvider>);
};

const fila = async (nombre) => (await screen.findByText(nombre)).closest("tr");

describe("Productos: disponibilidad", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cada producto tiene un interruptor accesible con su estado", async () => {
    montar();
    const latte = within(await fila("Latte")).getByRole("switch", { name: /disponible/i });
    const waffle = within(await fila("Waffle")).getByRole("switch", { name: /disponible/i });
    expect(latte).toHaveAttribute("aria-checked", "true");
    expect(waffle).toHaveAttribute("aria-checked", "false");
    expect(within(await fila("Waffle")).getByText("Agotado")).toBeInTheDocument();
  });

  it("al pulsarlo envía solo { disponible } y refleja el cambio", async () => {
    montar();
    const interruptor = within(await fila("Latte")).getByRole("switch", { name: /disponible/i });
    fireEvent.click(interruptor);
    await waitFor(() => expect(adminApi.put).toHaveBeenCalledWith("/productos/p1", { disponible: false }));
    await waitFor(() => expect(interruptor).toHaveAttribute("aria-checked", "false"));
  });
});
