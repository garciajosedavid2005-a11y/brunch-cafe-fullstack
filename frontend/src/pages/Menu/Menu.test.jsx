import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../services/api", () => ({
  apiRequest: vi.fn(),
  apiAssetUrl: (path) => path,
}));
vi.mock("../../context/CarritoContext", () => ({
  useCarrito: () => ({ agregarProducto: vi.fn() }),
}));

import { apiRequest } from "../../services/api";
import Menu from "./Menu";

const PRODUCTOS = [
  { id: "a".repeat(24), codigo: 1, nombre: "Latte", precio: 9000, categoria: "Bebidas", descripcion: "Café con leche", imagen: "" },
  { id: "b".repeat(24), codigo: 2, nombre: "Waffle", precio: 15000, categoria: "Postres", descripcion: "Con frutas", imagen: "" },
];

// Primera llamada: menú; segunda: calificaciones
const responder = (menu) => {
  apiRequest.mockImplementation((ruta) =>
    ruta.startsWith("/v1/catalogo") ? menu() : Promise.resolve({ productRatings: [] })
  );
};

const renderMenu = () => render(<MemoryRouter><Menu /></MemoryRouter>);

describe("Menú", () => {
  // Con llaves: devolver el mock haría que Vitest lo llamara como limpieza (sin argumentos)
  beforeEach(() => { apiRequest.mockReset(); });

  it("muestra productos y categorías", async () => {
    responder(() => Promise.resolve({ productos: PRODUCTOS, categorias: ["Bebidas", "Postres"] }));
    renderMenu();
    expect(await screen.findByText("Latte")).toBeInTheDocument();
    expect(screen.getByText("Waffle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bebidas" })).toBeInTheDocument();
    // El precio llega como entero y se formatea en COP
    expect(screen.getByText((_, el) => el?.className === "tarjeta-menu__precio" && /^\$\s9\.000$/.test(el.textContent))).toBeInTheDocument();
  });

  it("menú vacío: lo dice claramente (no como 'sin productos en esta categoría')", async () => {
    responder(() => Promise.resolve({ productos: [], categorias: [] }));
    renderMenu();
    expect(await screen.findByText(/todavía no hay productos en el menú/i)).toBeInTheDocument();
    expect(screen.queryByText(/en esta categoría/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("categoría sin productos conserva su mensaje", async () => {
    responder(() => Promise.resolve({ productos: PRODUCTOS.slice(0, 1), categorias: ["Bebidas", "Postres"] }));
    renderMenu();
    await screen.findByText("Latte");
    fireEvent.click(screen.getByRole("button", { name: "Postres" }));
    expect(screen.getByText(/no hay productos disponibles en esta categoría/i)).toBeInTheDocument();
  });

  it("error al cargar: aviso de error con opción de reintentar", async () => {
    let falla = true;
    responder(() => (falla ? Promise.reject(new Error("No se pudo conectar con el servidor.")) : Promise.resolve({ productos: PRODUCTOS, categorias: [] })));
    renderMenu();
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/no pudimos cargar el menú/i);
    expect(screen.queryByText(/todavía no hay productos/i)).not.toBeInTheDocument();

    falla = false;
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(await screen.findByText("Latte")).toBeInTheDocument();
  });

  it("ids por ObjectId: el ancla del menú usa el código y las calificaciones se cruzan por productoRef", async () => {
    apiRequest.mockImplementation((ruta) =>
      ruta.startsWith("/v1/catalogo")
        ? Promise.resolve({ productos: PRODUCTOS, categorias: [] })
        : Promise.resolve({ productRatings: [{ productoRef: "b".repeat(24), productoId: 2, average: 3, count: 4 }] })
    );
    const { container } = renderMenu();
    await screen.findByText("Waffle");
    expect(container.querySelector("#producto-2")).not.toBeNull();
    expect(await screen.findByLabelText(/3\.0 de 5 estrellas, basada en 4 comentarios/)).toBeInTheDocument();
  });
});
