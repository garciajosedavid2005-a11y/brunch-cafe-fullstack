// 0.15f: el personal ve «Mi panel» (→ /staff) y no ve el carrito de domicilios
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const sesion = vi.hoisted(() => ({ user: null, productos: [] }));
vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ user: sesion.user, loading: false, logout: vi.fn() }) }));
vi.mock("../../context/useDialogo", () => ({ useDialogo: () => ({ avisar: vi.fn() }) }));
vi.mock("../../context/CarritoContext", () => ({ useCarrito: () => ({ productos: sesion.productos }) }));

import Navbar from "./Navbar";

const pintar = () => render(<MemoryRouter initialEntries={["/menu"]}><Navbar /></MemoryRouter>);

describe("Barra de navegación según el tipo de cuenta", () => {
  beforeEach(() => {
    sesion.user = null;
    sesion.productos = [];
  });

  it("personal: «Mi panel» lleva a /staff y no hay carrito", () => {
    sesion.user = { nombre: "Mario", permisos: ["pedido:ver"], esPersonal: true };
    pintar();
    expect(screen.getByRole("link", { name: "Mi panel" })).toHaveAttribute("href", "/staff");
    expect(screen.queryByRole("link", { name: "Mi cuenta" })).toBeNull();
    expect(screen.queryByAltText("Carrito de compras")).toBeNull();
  });

  it("cliente: «Mi cuenta» y carrito", () => {
    sesion.user = { nombre: "Ana", permisos: [], esPersonal: false };
    pintar();
    expect(screen.getByRole("link", { name: "Mi cuenta" })).toHaveAttribute("href", "/cuenta");
    expect(screen.getByAltText("Carrito de compras")).toBeInTheDocument();
  });
});

describe("«Ingresar» activo en las pantallas de acceso (3.6)", () => {
  it.each(["/login", "/registro", "/recuperar-contrasena", "/restablecer-contrasena"])("en %s", (ruta) => {
    sesion.user = null;
    render(<MemoryRouter initialEntries={[ruta]}><Navbar /></MemoryRouter>);
    const ingresar = screen.getByRole("link", { name: "Ingresar" });
    // Activo a la vista (aria-current solo en /login, que es la página actual)
    expect(ingresar).toHaveClass("active");
  });

  it("no en otras páginas", () => {
    sesion.user = null;
    pintar();
    expect(screen.getByRole("link", { name: "Ingresar" })).not.toHaveClass("active");
  });
});

// 7.1 · En el celular el carrito queda dentro del menú: su contador también va en la hamburguesa
describe("Contador del carrito en la hamburguesa (7.1)", () => {
  beforeEach(() => {
    sesion.productos = [{ id: "p1", cantidad: 2 }, { id: "p2", cantidad: 1 }];
  });

  it("con productos: contador y etiqueta con el total; al abrir el menú se va", () => {
    sesion.user = { nombre: "Ana", permisos: [], esPersonal: false };
    pintar();
    const hamburguesa = screen.getByRole("button", { name: "Abrir menú de navegación (3 en el carrito)" });
    expect(hamburguesa.querySelector(".navbar__hamburger-badge")).toHaveTextContent("3");
    fireEvent.click(hamburguesa);
    expect(hamburguesa.querySelector(".navbar__hamburger-badge")).toBeNull();
  });

  it("el personal no tiene carrito: sin contador ni total en la etiqueta", () => {
    sesion.user = { nombre: "Mario", permisos: ["pedido:ver"], esPersonal: true };
    pintar();
    const hamburguesa = screen.getByRole("button", { name: "Abrir menú de navegación" });
    expect(hamburguesa.querySelector(".navbar__hamburger-badge")).toBeNull();
  });
});
