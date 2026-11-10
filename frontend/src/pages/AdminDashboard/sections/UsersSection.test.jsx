import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";

vi.mock("../../../services/api", () => ({
  apiRequest: vi.fn(),
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock("../../../context/useAuth", () => ({ useAuth: () => ({ user: { id: "yo" } }) }));

import { api, apiRequest } from "../../../services/api";
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
  api.get.mockImplementation((ruta) => Promise.resolve(ruta === "/v1/admin/roles" ? ROLES : USUARIOS));
  render(<DialogoProvider><UsersSection /></DialogoProvider>);
  await screen.findByText("ana@example.com");
};
const fila = (correo) => screen.getByText(correo).closest("tr");

describe("Usuarios (admin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.patch.mockImplementation((ruta, datos) => Promise.resolve({ ...usuario(ruta.split("/").pop()), ...datos }));
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
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("confirmar desactivación envía activo=false", async () => {
    await montar();
    fireEvent.click(within(fila("ana@example.com")).getByRole("button", { name: "Desactivar" }));
    const confirmar = screen.getByRole("button", { name: "Desactivar usuario" });
    expect(confirmar).toHaveClass("dialogo__boton--peligro");
    fireEvent.click(confirmar);
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/v1/admin/usuarios/ana", { activo: false }));
  });

  it("reactivar no pide confirmación", async () => {
    await montar();
    fireEvent.click(within(fila("luis@example.com")).getByRole("button", { name: "Activar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/v1/admin/usuarios/luis", { activo: true }));
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
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("confirmar cambio de rol envía rolId", async () => {
    await montar();
    fireEvent.change(within(fila("ana@example.com")).getByRole("combobox"), { target: { value: "r-mesero" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cambio" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/v1/admin/usuarios/ana", { rolId: "r-mesero" }));
  });

  it("error de protección del backend se muestra en el diálogo", async () => {
    api.patch.mockRejectedValueOnce(Object.assign(new Error("Debe quedar al menos un administrador activo."), { code: "ULTIMO_ADMIN" }));
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

  // 1.5b · Crear usuario: el admin no escribe la contraseña; se confirma antes de crear
  describe("Crear usuario", () => {
    const llenar = (dialogo, datos) => {
      for (const [etiqueta, valor] of Object.entries(datos)) {
        fireEvent.change(within(dialogo).getByLabelText(etiqueta), { target: { value: valor } });
      }
    };
    const abrirFormulario = async () => {
      await montar();
      fireEvent.click(screen.getByRole("button", { name: "Crear usuario" }));
      return screen.getByRole("dialog", { name: "Crear usuario" });
    };

    it("el formulario pide nombre, apellido, correo, teléfono opcional y rol (sin contraseña)", async () => {
      const dialogo = await abrirFormulario();
      for (const etiqueta of [/^Nombre/, /^Apellido/, /^Correo/, /^Teléfono/, /^Rol/]) {
        expect(within(dialogo).getByLabelText(etiqueta)).toBeInTheDocument();
      }
      expect(within(dialogo).queryByLabelText(/contraseña/i)).not.toBeInTheDocument();
      const opciones = within(within(dialogo).getByLabelText(/^Rol/)).getAllByRole("option").map((o) => o.textContent);
      expect(opciones).toEqual(expect.arrayContaining(["Administrador", "Mesero", "Cliente"]));
      expect(within(dialogo).getByText(/enlace para crear su contraseña/i)).toBeInTheDocument();
    });

    it("confirma con el diálogo y crea; avisa que se envió el enlace", async () => {
      api.post.mockResolvedValue({ ...usuario("laura"), correo: "laura@example.com", entrega: "correo" });
      const dialogo = await abrirFormulario();
      llenar(dialogo, { "Nombre *": "Laura", "Apellido *": "Gómez", "Correo *": "laura@example.com", "Rol *": "r-mesero" });
      fireEvent.click(within(dialogo).getByRole("button", { name: "Crear usuario" }));

      const confirmacion = await screen.findByRole("dialog", { name: "Crear la cuenta" });
      expect(confirmacion).toHaveTextContent("laura@example.com");
      expect(confirmacion).toHaveTextContent("Mesero");
      expect(api.post).not.toHaveBeenCalled();
      fireEvent.click(within(confirmacion).getByRole("button", { name: "Crear cuenta" }));

      await waitFor(() => expect(api.post).toHaveBeenCalledWith("/v1/admin/usuarios", {
        nombre: "Laura", apellido: "Gómez", correo: "laura@example.com", rolId: "r-mesero",
      }));
      const aviso = await screen.findByRole("dialog", { name: "Cuenta creada" });
      expect(aviso).toHaveTextContent(/Crea tu contraseña/);
      expect(aviso).toHaveTextContent(/24 horas/);
      expect(await screen.findByText("laura@example.com")).toBeInTheDocument();
    });

    it("cancelar la confirmación no crea nada", async () => {
      const dialogo = await abrirFormulario();
      llenar(dialogo, { "Nombre *": "Laura", "Apellido *": "Gómez", "Correo *": "laura@example.com", "Rol *": "r-mesero" });
      fireEvent.click(within(dialogo).getByRole("button", { name: "Crear usuario" }));
      const confirmacion = await screen.findByRole("dialog", { name: "Crear la cuenta" });
      fireEvent.click(within(confirmacion).getByRole("button", { name: "Cancelar" }));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Crear la cuenta" })).not.toBeInTheDocument());
      expect(api.post).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Crear usuario" })).toBeInTheDocument();
    });

    it("correo ya registrado: muestra el mensaje del servidor", async () => {
      const error = new Error("Ese correo ya está registrado. Busca la cuenta en la lista o usa otro correo.");
      error.status = 409;
      api.post.mockRejectedValue(error);
      const dialogo = await abrirFormulario();
      llenar(dialogo, { "Nombre *": "Ana", "Apellido *": "Apellido", "Correo *": "ana@example.com", "Rol *": "r-cliente" });
      fireEvent.click(within(dialogo).getByRole("button", { name: "Crear usuario" }));
      fireEvent.click(within(await screen.findByRole("dialog", { name: "Crear la cuenta" })).getByRole("button", { name: "Crear cuenta" }));
      expect(await screen.findByText(/ya está registrado/)).toBeInTheDocument();
    });
  });

  // Ajuste tras 1.5b · «Reenviar enlace» solo para las cuentas que aún no crearon su contraseña
  describe("Reenviar enlace", () => {
    const montarConPendiente = async () => {
      const lista = [...USUARIOS, usuario("nueva", { accesoPendiente: true })];
      api.get.mockImplementation((ruta) => Promise.resolve(ruta === "/v1/admin/roles" ? ROLES : lista));
      render(<DialogoProvider><UsersSection /></DialogoProvider>);
      await screen.findByText("nueva@example.com");
    };

    it("solo aparece en las cuentas pendientes, que se marcan en texto", async () => {
      await montarConPendiente();
      expect(within(fila("nueva@example.com")).getByRole("button", { name: "Reenviar enlace" })).toBeInTheDocument();
      expect(within(fila("nueva@example.com")).getByText(/sin contraseña/i)).toBeInTheDocument();
      expect(within(fila("ana@example.com")).queryByRole("button", { name: "Reenviar enlace" })).not.toBeInTheDocument();
    });

    it("pide confirmación, llama al endpoint y avisa; cancelar no hace nada", async () => {
      apiRequest.mockResolvedValue({ ...usuario("nueva", { accesoPendiente: true }), entrega: "correo" });
      await montarConPendiente();
      fireEvent.click(within(fila("nueva@example.com")).getByRole("button", { name: "Reenviar enlace" }));
      const confirmacion = await screen.findByRole("dialog", { name: "Reenviar enlace" });
      expect(confirmacion).toHaveTextContent(/el enlace anterior deja de servir/i);
      fireEvent.click(within(confirmacion).getByRole("button", { name: "Cancelar" }));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Reenviar enlace" })).not.toBeInTheDocument());
      expect(apiRequest).not.toHaveBeenCalled();

      fireEvent.click(within(fila("nueva@example.com")).getByRole("button", { name: "Reenviar enlace" }));
      fireEvent.click(within(await screen.findByRole("dialog", { name: "Reenviar enlace" })).getByRole("button", { name: "Reenviar" }));
      await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
      const [ruta, opciones] = apiRequest.mock.calls[0];
      expect(ruta).toBe("/v1/admin/usuarios/nueva/reenviar-enlace");
      expect(opciones).toMatchObject({ method: "POST" });
      expect(opciones.headers["Idempotency-Key"]).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
      const aviso = await screen.findByRole("dialog", { name: "Enlace reenviado" });
      expect(aviso).toHaveTextContent(/24 horas/);
    });

    it("un 409 muestra el mensaje del servidor y recarga la lista", async () => {
      const error = Object.assign(new Error("Esta persona ya creó su contraseña."), { status: 409 });
      apiRequest.mockRejectedValue(error);
      await montarConPendiente();
      const cargasAntes = api.get.mock.calls.filter(([r]) => r === "/v1/admin/usuarios").length;
      fireEvent.click(within(fila("nueva@example.com")).getByRole("button", { name: "Reenviar enlace" }));
      fireEvent.click(within(await screen.findByRole("dialog", { name: "Reenviar enlace" })).getByRole("button", { name: "Reenviar" }));
      expect(await screen.findByRole("alertdialog")).toHaveTextContent("Esta persona ya creó su contraseña.");
      await waitFor(() => expect(api.get.mock.calls.filter(([r]) => r === "/v1/admin/usuarios").length).toBeGreaterThan(cargasAntes));
    });
  });
});
