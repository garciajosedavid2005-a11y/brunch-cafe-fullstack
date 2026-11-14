import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// 2.6b · Si una sección del admin falla al dibujarse, la cabecera y el menú siguen en pie con el aviso.
vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({ user: { nombre: "Admin", email: "admin.dev@brunchcafe.test", permisos: ["*"] }, logout: vi.fn() }),
}));
vi.mock("./sections/OverviewSection", () => ({ default: () => { throw new TypeError("x is undefined"); } }));

import AdminDashboard from "./AdminDashboard";

let consola;
beforeEach(() => { consola = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => consola.mockRestore());

describe("Límite de errores en el admin (2.6b)", () => {
  it("una sección que falla no deja la pantalla en blanco", () => {
    render(<MemoryRouter><AdminDashboard /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("Algo salió mal en esta sección");
    expect(screen.getByRole("heading", { name: "Hola, Admin" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Panel de sala" })).toBeInTheDocument();
    // En la consola, con el nombre de la sección en español (revisor-reglas)
    expect(consola.mock.calls.some(([m]) => String(m).includes("[Brunch Café] Error en la sección «Resumen»"))).toBe(true);
  });
});
