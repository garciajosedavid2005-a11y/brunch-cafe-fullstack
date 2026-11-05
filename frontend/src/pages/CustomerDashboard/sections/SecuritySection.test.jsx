import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DialogoProvider } from "../../../context/DialogoContext";

const logout = vi.fn();
vi.mock("../../../services/api", () => ({ apiRequest: vi.fn() }));
vi.mock("../../../context/useAuth", () => ({ useAuth: () => ({ user: { nombre: "Ana" }, logout }) }));

import { apiRequest } from "../../../services/api";
import SecuritySection from "./SecuritySection";

const PERFIL = {
  nombre: "Ana", apellido: "Pérez", correo: "ana@example.com", telefono: "3001234567",
  rol: { nombre: "cliente", etiqueta: "Cliente" }, createdAt: "2026-10-30T15:00:00.000Z",
};

const montar = async () => {
  render(<MemoryRouter><DialogoProvider><SecuritySection /></DialogoProvider></MemoryRouter>);
  await screen.findByText("ana@example.com");
};
const llenar = (actual, nueva, confirmar) => {
  fireEvent.change(screen.getByLabelText("Contraseña actual"), { target: { value: actual } });
  fireEvent.change(screen.getByLabelText("Nueva contraseña"), { target: { value: nueva } });
  fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), { target: { value: confirmar } });
};

describe("Mi cuenta · Seguridad y configuración", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    logout.mockReset();
    apiRequest.mockImplementation((ruta, opciones) =>
      opciones?.method === "PUT" ? Promise.resolve({ message: "ok" }) : Promise.resolve(PERFIL)
    );
  });

  it("muestra datos de la cuenta, rol y fecha de registro", async () => {
    await montar();
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("Cliente")).toBeInTheDocument();
    expect(screen.getByText(/30 de octubre de 2026/)).toBeInTheDocument();
  });

  it("valida a la vista: mínimo 6 y confirmación igual; no llama al backend", async () => {
    await montar();
    llenar("secreta123", "123", "124");
    fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    expect(screen.getByText("La nueva contraseña debe tener al menos 6 caracteres.")).toBeInTheDocument();
    expect(screen.getByText("La confirmación no coincide.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nueva contraseña")).toHaveAttribute("aria-invalid", "true");
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("cambia la contraseña y limpia el formulario", async () => {
    await montar();
    llenar("secreta123", "nueva12345", "nueva12345");
    fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/usuarios/perfil/contrasena", {
      method: "PUT", body: JSON.stringify({ actual: "secreta123", nueva: "nueva12345" }),
    }));
    expect(await screen.findByText("Contraseña actualizada correctamente.")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña actual")).toHaveValue("");
  });

  it("muestra el error del backend (contraseña actual incorrecta)", async () => {
    apiRequest.mockImplementation((ruta, opciones) =>
      opciones?.method === "PUT" ? Promise.reject(new Error("La contraseña actual no es correcta.")) : Promise.resolve(PERFIL)
    );
    await montar();
    llenar("mala", "nueva12345", "nueva12345");
    fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La contraseña actual no es correcta.");
  });

  it("cerrar sesión", async () => {
    logout.mockResolvedValue();
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(logout).toHaveBeenCalled());
  });
});
