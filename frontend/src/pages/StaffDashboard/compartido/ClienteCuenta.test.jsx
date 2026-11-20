import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

// 6.5 (F6-8, F6-e) · Cliente de la cuenta: buscar por correo o teléfono (datos enmascarados), elegirlo (con la versión
// de la cuenta) y quitarlo; el aviso «Alergias: …» se ve también sin el permiso.
const estado = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest }));

import ClienteCuenta, { AvisoCliente } from "./ClienteCuenta";
import { TarjetaRonda } from "../../Kds/TarjetasKds";

const ANA = { id: "u1", nombre: "Ana R.", tieneAvisos: true, correo: "an***@example.com", telefono: "******4567", cumpleEsteMes: true };
const CUENTA = { id: "c1", estado: "abierta", version: 4, cliente: null };

beforeEach(() => {
  estado.apiRequest.mockReset().mockImplementation((ruta, opciones = {}) => {
    if (ruta.startsWith("/v1/staff/salon/clientes")) return Promise.resolve({ clientes: ruta.includes("nadie") ? [] : [ANA] });
    if (opciones.method === "PUT") {
      const { clienteId } = JSON.parse(opciones.body);
      return Promise.resolve({ ...CUENTA, version: 5, cliente: clienteId ? { id: "u1", nombre: "Ana R.", alergias: "Maní", preferencias: "Leche de almendra" } : null });
    }
    return Promise.reject(new Error(`Ruta inesperada ${ruta}`));
  });
});

describe("6.5 · Cliente de la cuenta", () => {
  it("busca por correo, muestra los datos enmascarados y al elegirlo envía la versión y devuelve la cuenta nueva", async () => {
    const onCambio = vi.fn();
    render(<ClienteCuenta cuenta={CUENTA} puedeIdentificar onCambio={onCambio} />);
    fireEvent.click(screen.getByRole("button", { name: /Identificar cliente/ }));
    fireEvent.change(screen.getByLabelText("Correo o teléfono del cliente"), { target: { value: "ana@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Buscar/ }));
    const lista = await screen.findByRole("list", { name: "Clientes encontrados" });
    expect(lista).toHaveTextContent("an***@example.com · ******4567");
    expect(lista).toHaveTextContent("Cumple años este mes");
    expect(lista).toHaveTextContent("Tiene alergias o preferencias registradas");
    expect(estado.apiRequest).toHaveBeenCalledWith("/v1/staff/salon/clientes?buscar=ana%40example.com");
    fireEvent.click(within(lista).getByRole("button", { name: "Elegir a Ana R." }));
    await vi.waitFor(() => expect(onCambio).toHaveBeenCalledWith(expect.objectContaining({ version: 5 })));
    const [, opciones] = estado.apiRequest.mock.calls.find(([, o]) => o?.method === "PUT");
    expect(JSON.parse(opciones.body)).toEqual({ clienteId: "u1", versionEsperada: 4 });
  });

  it("sin coincidencia lo dice; un texto corto no busca", async () => {
    render(<ClienteCuenta cuenta={CUENTA} puedeIdentificar />);
    fireEvent.click(screen.getByRole("button", { name: /Identificar cliente/ }));
    fireEvent.change(screen.getByLabelText("Correo o teléfono del cliente"), { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: /Buscar/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Escribe el correo o el teléfono completo");
    fireEvent.change(screen.getByLabelText("Correo o teléfono del cliente"), { target: { value: "nadie@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Buscar/ }));
    expect(await screen.findByText("No hay un cliente con ese correo o teléfono exactos.")).toBeInTheDocument();
  });

  it("con cliente: muestra el aviso y permite quitarlo; sin el permiso solo se ve el aviso", async () => {
    const conCliente = { ...CUENTA, cliente: { id: "u1", nombre: "Ana R.", alergias: "Maní", preferencias: "" } };
    const onCambio = vi.fn();
    const { unmount } = render(<ClienteCuenta cuenta={conCliente} puedeIdentificar onCambio={onCambio} />);
    expect(screen.getByRole("heading", { name: "Cliente: Ana R." })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Alergias: Maní");
    fireEvent.click(screen.getByRole("button", { name: "Quitar el cliente Ana R. de la cuenta" }));
    await vi.waitFor(() => expect(onCambio).toHaveBeenCalledWith(expect.objectContaining({ cliente: null })));
    unmount();
    render(<ClienteCuenta cuenta={conCliente} />);
    expect(screen.getByRole("note")).toHaveTextContent("Alergias: Maní");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("el aviso no aparece sin alergias ni preferencias; el KDS lo muestra en la tarjeta", () => {
    const { container } = render(<AvisoCliente aviso={{ alergias: "", preferencias: "" }} />);
    expect(container).toBeEmptyDOMElement();
    const ronda = { comandaId: "r1", cuentaId: "c1", numeroRonda: 1, mesas: [3], mesero: "Mesero P.", enviadaEn: new Date().toISOString(), items: [], avisoCliente: { alergias: "Maní", preferencias: "Sin lactosa" } };
    render(<TarjetaRonda ronda={ronda} minutos={1} nivel="normal" ahora={Date.now()} usuarioId="u" puedePreparar={false} ocupado={false} onMarcarItem={() => {}} onTodoListo={() => {}} />);
    expect(screen.getByRole("note")).toHaveTextContent("Alergias: Maní · Preferencias: Sin lactosa");
  });
});
