// 0.15f: el personal ve «Mi panel» (→ /staff) y no ve el carrito de domicilios
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const sesion = vi.hoisted(() => ({ user: null }));
vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ user: sesion.user, loading: false, logout: vi.fn() }) }));
vi.mock("../../context/useDialogo", () => ({ useDialogo: () => ({ avisar: vi.fn() }) }));
vi.mock("../../context/CarritoContext", () => ({ useCarrito: () => ({ productos: [] }) }));

import Navbar from "./Navbar";

const pintar = () => render(<MemoryRouter initialEntries={["/menu"]}><Navbar /></MemoryRouter>);

describe("Barra de navegación según el tipo de cuenta", () => {
  beforeEach(() => {
    sesion.user = null;
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
