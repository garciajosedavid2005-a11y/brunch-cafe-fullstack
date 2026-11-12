import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({ user: { nombre: "Admin", email: "admin.dev@brunchcafe.test", permisos: ["*"] }, logout: vi.fn() }),
}));
// El resumen carga datos al montarse; aquí solo importa la cabecera
vi.mock("./sections/OverviewSection", () => ({ default: () => null }));

import AdminDashboard from "./AdminDashboard";

// F1-19 · Desde el admin se entra al panel de sala (/staff) para anular ítems en la toma de comanda
describe("Admin › enlace al panel de sala", () => {
  it("la cabecera tiene «Panel de sala», que lleva a /staff", () => {
    render(<MemoryRouter><AdminDashboard /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Panel de sala" })).toHaveAttribute("href", "/staff");
  });
});
