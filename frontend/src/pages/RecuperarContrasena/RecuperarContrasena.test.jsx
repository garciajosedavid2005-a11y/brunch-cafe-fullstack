import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

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

  // 1.5b · Cuenta creada por el admin: el mismo enlace sirve para crear la contraseña
  it("con tipo=crear dice «Crea tu contraseña» y usa el mismo enlace de un solo uso", async () => {
    apiRequest.mockResolvedValue({ message: "Contraseña restablecida." });
    render(
      <MemoryRouter initialEntries={["/restablecer-contrasena?token=abc&tipo=crear"]}>
        <RecuperarContrasena />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Crea tu contraseña");
    fireEvent.change(screen.getByLabelText("Nueva contraseña", { exact: true }), { target: { value: "clave-nueva-123" } });
    fireEvent.change(screen.getByLabelText(/confirma la nueva contraseña/i), { target: { value: "clave-nueva-123" } });
    fireEvent.click(screen.getByRole("button", { name: /crear contraseña/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(/contraseña creada/i);
    expect(apiRequest).toHaveBeenCalledWith("/v1/auth/restablecer-contrasena", {
      method: "POST",
      body: JSON.stringify({ token: "abc", nueva: "clave-nueva-123" }),
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

  // 0.15c: el token no se queda en la barra de direcciones ni en el historial
  it("quita el token de la dirección y lo sigue usando al enviar", async () => {
    apiRequest.mockResolvedValue({ message: "Contraseña restablecida." });
    let ubicacion;
    const Ubicacion = () => {
      ubicacion = useLocation();
      return null;
    };
    render(
      <MemoryRouter initialEntries={["/restablecer-contrasena?token=abc"]}>
        <RecuperarContrasena />
        <Ubicacion />
      </MemoryRouter>,
    );

    await waitFor(() => expect(ubicacion.search).toBe(""));
    expect(ubicacion.pathname).toBe("/restablecer-contrasena");

    fireEvent.change(screen.getByLabelText("Nueva contraseña", { exact: true }), { target: { value: "clave-nueva-123" } });
    fireEvent.change(screen.getByLabelText(/confirma la nueva contraseña/i), { target: { value: "clave-nueva-123" } });
    fireEvent.click(screen.getByRole("button", { name: /restablecer contraseña/i }));
    await screen.findByRole("status");
    expect(apiRequest).toHaveBeenCalledWith("/v1/auth/restablecer-contrasena", {
      method: "POST",
      body: JSON.stringify({ token: "abc", nueva: "clave-nueva-123" }),
    });
  });
});
