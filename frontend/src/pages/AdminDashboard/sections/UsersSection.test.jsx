import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";

vi.mock("../../../services/adminApi", () => ({
  adminApi: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock("../../../context/useAuth", () => ({ useAuth: () => ({ user: { id: "yo" } }) }));

import { adminApi } from "../../../services/adminApi";
import UsersSection from "./UsersSection";

const ROLES = [
  { id: "r-admin", nombre: "admin", etiqueta: "Administrador" },
  { id: "r-mesero", nombre: "mesero", etiqueta: "Mesero" },
  { id: "r-cliente", nombre: "cliente", etiqueta: "Cliente" },
];
const usuario = (id, extra) => ({
  id, nombre: `Nombre-${id}`, apellido: "Apellido", correo: `${id}@example.com`, activo: true,
  rol: { id: "r-cliente", codigo: "cliente", nombre: "Cliente" }, ...extra,
});
const USUARIOS = [
  usuario("yo", { rol: { id: "r-admin", codigo: "admin", nombre: "Administrador" } }),
  usuario("ana"),
  usuario("luis", { activo: false }),
];

const montar = async () => {
  adminApi.get.mockImplementation((ruta) => Promise.resolve(ruta === "/roles" ? ROLES : USUARIOS));
  render(<DialogoProvider><UsersSection /></DialogoProvider>);
  await screen.findByText("ana@example.com");
};
const fila = (correo) => screen.getByText(correo).closest("tr");

describe("Usuarios (admin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminApi.patch.mockImplementation((ruta, datos) => Promise.resolve({ ...usuario(ruta.split("/").pop()), ...datos }));
  });

  it("en la fila propia muestra 'Tu cuenta' sin desactivar ni cambiar rol", async () => {
    await montar();
    const propia = within(fila("yo@example.com"));
    expect(propia.getByText("Tu cuenta")).toBeInTheDocument();
    expect(propia.queryByRole("button", { name: /desactivar/i })).not.toBeInTheDocument();
    expect(propia.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("desactivar pide confirmación con nombre y correo; 'Cancelar' no cambia nada", async () => {
    await montar();
    fireEvent.click(within(fila("ana@example.com")).getByRole("button", { name: "Desactivar" }));
    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveTextContent("¿Estás seguro de que deseas desactivar esta cuenta?");
    expect(dialogo).toHaveTextContent("Nombre-ana Apellido");
    expect(dialogo).toHaveTextContent("ana@example.com");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(adminApi.patch).not.toHaveBeenCalled();
  });

  it("confirmar desactivación envía activo=false", async () => {
    await montar();
    fireEvent.click(within(fila("ana@example.com")).getByRole("button", { name: "Desactivar" }));
    const confirmar = screen.getByRole("button", { name: "Desactivar usuario" });
    expect(confirmar).toHaveClass("dialogo__boton--peligro");
    fireEvent.click(confirmar);
    await waitFor(() => expect(adminApi.patch).toHaveBeenCalledWith("/admin/usuarios/ana", { activo: false }));
  });

  it("reactivar no pide confirmación", async () => {
    await montar();
    fireEvent.click(within(fila("luis@example.com")).getByRole("button", { name: "Activar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(adminApi.patch).toHaveBeenCalledWith("/admin/usuarios/luis", { activo: true }));
  });

  it("cambiar rol muestra actual → nuevo; al cancelar el desplegable vuelve al anterior", async () => {
    await montar();
    const selector = within(fila("ana@example.com")).getByRole("combobox");
    fireEvent.change(selector, { target: { value: "r-mesero" } });
    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveTextContent("¿Estás seguro de que deseas cambiar el rol de este usuario?");
    expect(dialogo).toHaveTextContent(/Cliente\s*→\s*Mesero/);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(selector).toHaveValue("r-cliente");
    expect(adminApi.patch).not.toHaveBeenCalled();
  });

  it("confirmar cambio de rol envía rolId", async () => {
    await montar();
    fireEvent.change(within(fila("ana@example.com")).getByRole("combobox"), { target: { value: "r-mesero" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cambio" }));
    await waitFor(() => expect(adminApi.patch).toHaveBeenCalledWith("/admin/usuarios/ana", { rolId: "r-mesero" }));
  });

  it("error de protección del backend se muestra en el diálogo", async () => {
    adminApi.patch.mockRejectedValueOnce(Object.assign(new Error("Debe quedar al menos un administrador activo."), { code: "ULTIMO_ADMIN" }));
    await montar();
    fireEvent.click(within(fila("ana@example.com")).getByRole("button", { name: "Desactivar" }));
    fireEvent.click(screen.getByRole("button", { name: "Desactivar usuario" }));
    const alerta = await screen.findByRole("alertdialog");
    expect(alerta).toHaveTextContent("Debe quedar al menos un administrador activo.");
  });

  it("usa plural correcto en el contador", async () => {
    await montar();
    expect(screen.getByText("3 usuarios")).toBeInTheDocument();
  });
});
