import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../../services/api", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "../../services/api";
import Perfil from "./Perfil";

const montar = () => render(
  <MemoryRouter initialEntries={["/perfil"]}>
    <Routes>
      <Route path="/perfil" element={<Perfil />} />
      <Route path="/login" element={<p>Pantalla de login</p>} />
    </Routes>
  </MemoryRouter>
);

describe("/perfil", () => {
  it("muestra los datos usando el cliente HTTP común", async () => {
    apiRequest.mockResolvedValue({ perfil: { nombre: "Ana", apellido: "Pérez", correo: "ana@example.com", telefono: "300", rol: { nombre: "cliente", etiqueta: "Cliente" } } });
    montar();
    expect(await screen.findByText("ana@example.com")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/v1/cliente/perfil");
  });

  it("si falla, lleva al login", async () => {
    apiRequest.mockRejectedValue(Object.assign(new Error("No autenticado"), { status: 401 }));
    montar();
    expect(await screen.findByText("Pantalla de login")).toBeInTheDocument();
  });
});
