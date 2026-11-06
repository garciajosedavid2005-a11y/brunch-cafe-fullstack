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

const producto = (id, nombre, extra) => ({
  id, codigo: id, nombre, precio: 12000, descripcion: "", imagen: "", destacado: false,
  disponible: true, categoria: "Bebidas", categoriaId: "c1", ...extra,
});
const PRODUCTOS = [producto("p1", "Latte"), producto("p2", "Waffle", { disponible: false })];

const montar = () => {
  api.get.mockImplementation((ruta) =>
    Promise.resolve(ruta === "/v1/admin/categorias" ? [{ id: "c1", nombre: "Bebidas" }] : PRODUCTOS));
  api.put.mockImplementation((ruta, datos) =>
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
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/v1/admin/productos/p1", { disponible: false }));
    await waitFor(() => expect(interruptor).toHaveAttribute("aria-checked", "false"));
  });
});

describe("Productos: imagen", () => {
  beforeEach(() => vi.clearAllMocks());

  const subir = async (archivo) => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /nuevo producto/i }));
    fireEvent.change(screen.getByLabelText("Imagen del producto"), { target: { files: [archivo] } });
  };

  it("una imagen de más de 2 MB se rechaza en el navegador con un mensaje claro", async () => {
    const lector = vi.spyOn(FileReader.prototype, "readAsDataURL");
    const grande = new File(["x"], "foto.png", { type: "image/png" });
    Object.defineProperty(grande, "size", { value: 3.4 * 1024 * 1024 });
    await subir(grande);
    expect(await screen.findByText(/pesa 3,4 MB.*máximo.*2 MB/i)).toBeInTheDocument();
    expect(lector).not.toHaveBeenCalled();
    lector.mockRestore();
  });

  it("un archivo que no es imagen PNG/JPG/WEBP/GIF se rechaza", async () => {
    await subir(new File(["x"], "menu.pdf", { type: "application/pdf" }));
    expect(await screen.findByText(/debe ser una imagen png, jpg, webp o gif/i)).toBeInTheDocument();
  });
});

describe("Productos: precio", () => {
  beforeEach(() => vi.clearAllMocks());

  const guardarCon = async (precio) => {
    montar();
    api.post.mockResolvedValue(producto("p9", "Mocca"));
    fireEvent.click(await screen.findByRole("button", { name: /nuevo producto/i }));
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "Mocca" } });
    fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: precio } });
    fireEvent.submit(screen.getByLabelText(/precio/i).closest("form"));
  };

  it.each([["22000"], ["22.000"], ["$22.000"], ["$ 22.000"]])("acepta %s como 22000", async (texto) => {
    await guardarCon(texto);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/v1/admin/productos", expect.objectContaining({ precio: 22000 })));
  });

  it.each([["12.500,5"], ["12,5"], ["-3000"], ["doce mil"]])("rechaza %s con un mensaje (no lo convierte a otro número)", async (texto) => {
    await guardarCon(texto);
    expect(await screen.findByText(/número entero de pesos/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
