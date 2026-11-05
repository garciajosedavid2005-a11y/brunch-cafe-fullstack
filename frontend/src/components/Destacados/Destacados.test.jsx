import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../services/api", () => ({ apiRequest: vi.fn(), apiAssetUrl: (p) => p }));
vi.mock("../../context/useCarrito", () => ({ useCarrito: () => ({ agregarProducto: vi.fn() }) }));
vi.mock("../../context/CarritoContext", () => ({ useCarrito: () => ({ agregarProducto: vi.fn() }) }));
import { apiRequest } from "../../services/api";
import Destacados from "./Destacados";

// IntersectionObserver controlable: guarda los elementos observados para "hacerlos visibles"
let observados;
const OriginalIO = globalThis.IntersectionObserver;
beforeEach(() => {
  observados = [];
  globalThis.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(elemento) { observados.push({ elemento, callback: this.callback, observador: this }); }
    unobserve() {}
    disconnect() {}
  };
});
afterEach(() => { globalThis.IntersectionObserver = OriginalIO; });

const entrarEnPantalla = () => act(() => {
  for (const { elemento, callback, observador } of observados) callback([{ isIntersecting: true, target: elemento }], observador);
});

const PRODUCTOS = [
  { id: 1, nombre: "Waffle", precio: "$15.000", categoria: "Postres", descripcion: "", imagen: "", destacado: true },
  { id: 2, nombre: "Latte", precio: "$9.000", categoria: "Bebidas", descripcion: "", imagen: "", destacado: false },
];

describe("Destacados (inicio)", () => {
  it("cuando llegan los productos, la sección se observa y queda visible", async () => {
    apiRequest.mockResolvedValue({ productos: PRODUCTOS });
    render(<MemoryRouter><Destacados /></MemoryRouter>);
    const titulo = await screen.findByText("Nuestros Destacados");
    expect(screen.getAllByText("Waffle").length).toBeGreaterThan(0);
    expect(screen.queryByText("Latte")).not.toBeInTheDocument();

    entrarEnPantalla();
    expect(titulo.closest("header")).toHaveClass("visible");
    expect(document.querySelector(".destacados__slider")).toHaveClass("visible");
  });

  it("sin destacados, la sección no se muestra", async () => {
    apiRequest.mockResolvedValue({ productos: [{ ...PRODUCTOS[1] }] });
    const { container } = render(<MemoryRouter><Destacados /></MemoryRouter>);
    await act(async () => {});
    expect(container.querySelector("#destacados")).toBeNull();
  });
});
