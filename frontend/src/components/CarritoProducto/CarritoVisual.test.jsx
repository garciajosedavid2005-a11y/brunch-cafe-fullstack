// 3.6 · Carrito: título sin cortes, botón «+» con el estilo de la marca, «inicia sesión» en bordó, el icono de
// línea del sitio en lugar del emoji y mayúsculas de oración (sin puntos suspensivos en títulos y etiquetas).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DialogoProvider } from "../../context/DialogoContext";
import { contraste } from "../../test/contraste";

vi.mock("../../services/api", () => ({ apiRequest: vi.fn() }));
vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ user: null }) }));
const carrito = vi.hoisted(() => ({ productos: [] }));
vi.mock("../../context/CarritoContext", () => ({
  useCarrito: () => ({ ...carrito, calcularTotal: () => 0, limpiarCarrito: vi.fn(), marcarProblemas: vi.fn(), aumentarCantidad: vi.fn(), disminuirCantidad: vi.fn(), eliminarProducto: vi.fn(), problemas: {} }),
}));

import { apiRequest } from "../../services/api";
import CarritoProducto from "./CarritoProducto";
import CarritoFormulario from "../CarritoFormulario/CarritoFormulario";

const leer = (archivo) => readFileSync(join(import.meta.dirname, archivo), "utf8").replace(/\r\n/g, "\n");
const regla = (css, selector) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
const valor = (bloque, propiedad) => bloque.match(new RegExp(`(?:^|;|\\s)${propiedad}\\s*:\\s*([^;]+);`))?.[1].trim();
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe("Carrito (3.6)", () => {
  beforeEach(() => {
    carrito.productos = [];
    apiRequest.mockReset();
    apiRequest.mockImplementation((ruta) => Promise.resolve(ruta === "/v1/horarios"
      ? { horarios: { domicilio: { desde: "08:00", hasta: "16:00", anticipacionMinutos: 60 }, reservas: {} } }
      : [{ id: "m1", nombre: "Contra entrega", descripcion: "" }]));
  });

  it("carrito vacío: sin emoji (el icono de línea del sitio) y «Agregar producto al carrito» en mayúsculas de oración", () => {
    const { container } = render(<MemoryRouter><CarritoProducto /></MemoryRouter>);
    const vacio = container.querySelector(".carrito-producto__vacio");
    expect(vacio.textContent).not.toMatch(EMOJI);
    expect(vacio.querySelector("img[alt='']")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Agregar producto al carrito" })).toBeInTheDocument();
  });

  it("con productos: «Agregar otro producto al carrito» en mayúsculas de oración", () => {
    carrito.productos = [{ id: 1, linea: "l1", nombre: "Huevos", precio: 15000, cantidad: 1, descripcion: "", imagen: "" }];
    render(<MemoryRouter><CarritoProducto /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Agregar otro producto al carrito" })).toBeInTheDocument();
  });

  it("el «+» con el estilo de la marca (≥ 4,5:1) y el título sin cortes (alto de línea y relleno)", () => {
    const css = leer("CarritoProducto.css");
    const mas = regla(css, ".carrito-producto__agregar-btn span");
    expect(contraste(valor(mas, "color"), valor(mas, "background-color"))).toBeGreaterThanOrEqual(4.5);
    const titulo = regla(css, ".carrito-producto__titulo");
    expect(Number.parseFloat(valor(titulo, "line-height"))).toBeGreaterThanOrEqual(1.3);
    expect(valor(titulo, "padding-top")).toBeTruthy();
  });

  it("sin sesión: «inicia sesión» en bordó y títulos y etiquetas sin puntos suspensivos", async () => {
    carrito.productos = [{ id: 1, cantidad: 1 }];
    render(<MemoryRouter><DialogoProvider><CarritoFormulario /></DialogoProvider></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Información de domicilio" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "inicia sesión" })).toHaveClass("carrito-formulario__enlace");
    for (const etiqueta of ["Tu nombre", "Tu dirección", "Teléfono de contacto", "Hora de entrega", "Barrio o conjunto", "Indicaciones especiales"]) {
      expect(screen.getByText(etiqueta, { exact: false }).textContent).not.toMatch(/\.\.\.|…/);
    }
    const css = leer("../CarritoFormulario/CarritoFormulario.css");
    expect(valor(regla(css, ".carrito-formulario__enlace,\n.carrito-formulario__enlace:visited"), "color")).toBe("var(--color-primario)");
  });
});
