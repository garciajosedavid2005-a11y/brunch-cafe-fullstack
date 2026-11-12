// 2.0b · El navbar solo es transparente (texto claro sobre la foto) cuando la página tiene de verdad una
// foto de portada montada; en cualquier otra (p. ej. /reservas sin sesión, login, 404) es sólido, con
// texto oscuro y en el flujo del documento (el contenido empieza debajo).
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Link } from "react-router-dom";
import { fireEvent } from "@testing-library/react";

vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ user: null, loading: false, logout: vi.fn() }) }));
vi.mock("../../context/useDialogo", () => ({ useDialogo: () => ({ avisar: vi.fn() }) }));
vi.mock("../../context/CarritoContext", () => ({ useCarrito: () => ({ productos: [] }) }));

import Navbar from "./Navbar";
import { PortadaProvider } from "../../context/PortadaContext";
import { useMarcarPortada } from "../../context/usePortada";

const ConPortada = () => {
  useMarcarPortada();
  return <section>Foto de portada <Link to="/aviso">Ir al aviso</Link></section>;
};

const pintar = (ruta) => render(
  <PortadaProvider>
    <MemoryRouter initialEntries={[ruta]}>
      <Navbar />
      <Routes>
        <Route path="/" element={<ConPortada />} />
        <Route path="/aviso" element={<main>Inicia sesión para reservar</main>} />
        <Route path="/reservas" element={<main>Inicia sesión para reservar</main>} />
      </Routes>
    </MemoryRouter>
  </PortadaProvider>,
);
const cabecera = () => screen.getByRole("banner");

describe("Navbar: transparente solo sobre una foto de portada (2.0b)", () => {
  it("con portada montada → transparente, con el logo claro", () => {
    pintar("/");
    expect(cabecera()).toHaveClass("top-bar--transparente");
  });

  it("/reservas sin portada (aviso de iniciar sesión) → sólido", () => {
    pintar("/reservas");
    expect(cabecera()).not.toHaveClass("top-bar--transparente");
  });

  it("al salir de la página con portada, vuelve a ser sólido", () => {
    pintar("/");
    fireEvent.click(screen.getByRole("link", { name: "Ir al aviso" }));
    expect(screen.getByText("Inicia sesión para reservar")).toBeInTheDocument();
    expect(cabecera()).not.toHaveClass("top-bar--transparente");
  });

  it("sin el proveedor (pantallas sueltas o tests) el navbar es sólido", () => {
    render(<MemoryRouter initialEntries={["/"]}><Navbar /></MemoryRouter>);
    expect(cabecera()).not.toHaveClass("top-bar--transparente");
  });
});
