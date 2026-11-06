import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock("../../services/api", () => ({ apiRequest }));

import RecuperarContrasena from "./RecuperarContrasena";

describe("Recuperar contraseña", () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it("solicita un enlace sin exponer si el correo está registrado", async () => {
    apiRequest.mockResolvedValue({
      message: "Si la cuenta existe, recibirás un enlace para restablecer tu contraseña.",
    });
    render(
      <MemoryRouter initialEntries={["/recuperar-contrasena"]}>
        <RecuperarContrasena />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: "ana@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar enlace/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/si la cuenta existe/i);
    expect(apiRequest).toHaveBeenCalledWith("/v1/auth/recuperar-contrasena", {
      method: "POST",
      body: JSON.stringify({ correo: "ana@example.com" }),
    });
  });

  it("envía la nueva contraseña al confirmar un enlace válido", async () => {
    apiRequest.mockResolvedValue({ message: "Contraseña restablecida." });
    render(
      <MemoryRouter initialEntries={["/restablecer-contrasena?token=abc"]}>
        <RecuperarContrasena />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Nueva contraseña", { exact: true }), {
      target: { value: "clave-nueva-123" },
    });
    fireEvent.change(screen.getByLabelText(/confirma la nueva contraseña/i), {
      target: { value: "clave-nueva-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /restablecer contraseña/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Contraseña restablecida.");
    expect(apiRequest).toHaveBeenCalledWith("/v1/auth/restablecer-contrasena", {
      method: "POST",
      body: JSON.stringify({ token: "abc", nueva: "clave-nueva-123" }),
    });
  });
});
