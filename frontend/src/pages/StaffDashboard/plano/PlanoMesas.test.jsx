import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const estado = vi.hoisted(() => ({ apiRequest: vi.fn(), confirmar: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest }));
vi.mock("../../../context/useDialogo", () => ({ useDialogo: () => ({ confirmar: estado.confirmar, avisar: vi.fn() }) }));

import PlanoMesas from "./PlanoMesas";

// 1.6 · Plano de mesas (tablet): estado en texto e icono (no solo color), acciones por permiso,
// polling y «actualizado hace N s».
const ZONAS = [{ id: "z1", nombre: "Interior", orden: 1 }, { id: "z2", nombre: "Terraza", orden: 2 }];
const cuenta = (extra = {}) => ({
  id: "c1", codigo: "C-000001", estado: "abierta", comensales: 3, mesero: { id: "u1", nombre: "Ana P." },
  abiertaEn: "2026-11-10T12:00:00Z", minutosOcupada: 35, total: 18000, pendiente: 0,
  mesas: [{ id: "m1", numero: 1 }], version: 4, ...extra,
});
const mesa = (numero, estadoMesa, extra = {}) => ({
  id: `m${numero}`, numero, nombre: "", zona: { id: "z1", nombre: "Interior" }, capacidad: 4,
  estado: estadoMesa, combinable: true, posicion: null, cuenta: null, ...extra,
});
const PLANO = () => ({
  actualizadoEn: "2026-11-10T12:35:00Z",
  zonas: ZONAS,
  mesas: [
    mesa(1, "ocupada", { cuenta: cuenta() }),
    mesa(2, "libre"),
    mesa(3, "cuenta_pedida", { cuenta: cuenta({ id: "c3", codigo: "C-000003", estado: "cuenta_pedida", mesas: [{ id: "m3", numero: 3 }] }) }),
    mesa(4, "bloqueada", { combinable: false }),
    mesa(7, "por_limpiar", { zona: { id: "z2", nombre: "Terraza" } }),
  ],
});

// Permisos del mesero desde 1.5b (también bloquea, une y transfiere: el rol anfitrión se eliminó)
const MESERO = [
  "mesa:ver", "mesa:operar", "mesa:bloquear", "mesa:unir", "cuenta:abrir", "cuenta:ver", "cuenta:transferir",
  "comanda:tomar", "comanda:enviar", "cuenta:solicitar",
];
// Un rol sin comanda:tomar (p. ej. uno creado por el admin para recepción): elige el mesero al abrir
const SIN_COMANDAS = ["mesa:ver", "mesa:operar", "mesa:bloquear", "mesa:unir", "cuenta:abrir", "cuenta:transferir"];
// Un rol con lo mínimo para atender: sin bloquear, unir ni transferir
const BASICO = ["mesa:ver", "mesa:operar", "cuenta:abrir", "comanda:tomar"];

let respuestas;
beforeEach(() => {
  respuestas = { plano: PLANO() };
  estado.confirmar.mockReset();
  estado.apiRequest.mockReset();
  estado.apiRequest.mockImplementation((ruta, opciones = {}) => {
    if (ruta === "/v1/staff/salon/mesas") return Promise.resolve(respuestas.plano);
    if (ruta === "/v1/staff/salon/meseros") return Promise.resolve([{ id: "u1", nombre: "Ana P." }, { id: "u2", nombre: "Luis G." }]);
    if (opciones.method === "POST") return Promise.resolve({ id: "c9" });
    return Promise.reject(new Error(`Ruta inesperada ${ruta}`));
  });
});
afterEach(() => vi.useRealTimers());

const pintar = (permisos = MESERO) => render(<PlanoMesas permisos={permisos} />);
const tarjeta = (numero) => screen.getByRole("button", { name: new RegExp(`^Mesa ${numero}\\b`) });
const llamadasA = (ruta) => estado.apiRequest.mock.calls.filter(([r]) => r === ruta);

describe("Plano de mesas", () => {
  it("cada mesa dice su estado en texto, con comensales, mesero y tiempo; la leyenda cuenta por estado", async () => {
    pintar();
    await screen.findByRole("button", { name: /^Mesa 1\b/ });
    const ocupada = tarjeta(1);
    expect(within(ocupada).getByText("Ocupada")).toBeInTheDocument();
    expect(ocupada).toHaveAccessibleName(/Mesa 1, Ocupada, 3 comensales, Ana P\., 35 min/);
    expect(within(ocupada).getByText("$ 18.000")).toBeInTheDocument();
    expect(within(tarjeta(3)).getByText("Cuenta pedida")).toBeInTheDocument();
    expect(within(tarjeta(7)).getByText("Por limpiar")).toBeInTheDocument();

    const leyenda = screen.getByRole("list", { name: /leyenda/i });
    expect(within(leyenda).getByText("Libre").closest("li")).toHaveTextContent("1");
    expect(within(leyenda).getByText("Bloqueada").closest("li")).toHaveTextContent("1");
  });

  it("filtra por zona con pestañas", async () => {
    pintar();
    await screen.findByRole("button", { name: /^Mesa 1\b/ });
    fireEvent.click(screen.getByRole("button", { name: "Terraza" }));
    expect(screen.queryByRole("button", { name: /^Mesa 1\b/ })).not.toBeInTheDocument();
    expect(tarjeta(7)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terraza" })).toHaveAttribute("aria-pressed", "true");
  });

  it("se refresca solo cada 10 s y dice hace cuánto se actualizó", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    pintar();
    await screen.findByRole("button", { name: /^Mesa 1\b/ });
    expect(llamadasA("/v1/staff/salon/mesas")).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(screen.getByText(/actualizado hace [3-5] s/i)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    expect(llamadasA("/v1/staff/salon/mesas").length).toBeGreaterThanOrEqual(2);
  });

  it("si falla la actualización conserva el plano y lo avisa", async () => {
    pintar();
    await screen.findByRole("button", { name: /^Mesa 1\b/ });
    estado.apiRequest.mockImplementation(() => Promise.reject(new Error("No se pudo conectar con el servidor.")));
    fireEvent.click(screen.getByRole("button", { name: /actualizar/i }));
    expect(await screen.findByText(/no se pudo actualizar/i)).toBeInTheDocument();
    expect(tarjeta(1)).toBeInTheDocument();
  });

  it("abrir cuenta en una mesa libre: comensales y Idempotency-Key, luego recarga el plano", async () => {
    pintar();
    fireEvent.click(await screen.findByRole("button", { name: /^Mesa 2\b/ }));
    const panel = screen.getByRole("region", { name: "Mesa 2" });
    fireEvent.click(within(panel).getByRole("button", { name: "Sumar comensal" }));
    expect(within(panel).getByText("3", { selector: "output" })).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Abrir cuenta" }));
    await waitFor(() => expect(llamadasA("/v1/staff/salon/mesas/m2/abrir")).toHaveLength(1));
    const [, opciones] = llamadasA("/v1/staff/salon/mesas/m2/abrir")[0];
    expect(JSON.parse(opciones.body)).toEqual({ comensales: 3 });
    expect(opciones.headers["Idempotency-Key"]).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
    await waitFor(() => expect(llamadasA("/v1/staff/salon/mesas").length).toBeGreaterThanOrEqual(2));
  });

  it("quien no toma comandas debe elegir el mesero al abrir", async () => {
    pintar(SIN_COMANDAS);
    fireEvent.click(await screen.findByRole("button", { name: /^Mesa 2\b/ }));
    const panel = screen.getByRole("region", { name: "Mesa 2" });
    const selector = await within(panel).findByRole("combobox", { name: /mesero/i });
    fireEvent.change(selector, { target: { value: "u2" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Abrir cuenta" }));
    await waitFor(() => expect(llamadasA("/v1/staff/salon/mesas/m2/abrir")).toHaveLength(1));
    expect(JSON.parse(llamadasA("/v1/staff/salon/mesas/m2/abrir")[0][1].body)).toEqual({ comensales: 2, meseroId: "u2" });
  });

  it("las acciones dependen de los permisos: sin ellos no se bloquea, une ni transfiere; el mesero (1.5b) sí", async () => {
    const { unmount } = pintar(BASICO);
    fireEvent.click(await screen.findByRole("button", { name: /^Mesa 2\b/ }));
    expect(screen.queryByRole("button", { name: "Bloquear mesa" })).not.toBeInTheDocument();
    fireEvent.click(tarjeta(1));
    const panelMesero = screen.getByRole("region", { name: "Mesa 1" });
    expect(within(panelMesero).getByRole("button", { name: "Mover a otra mesa" })).toBeInTheDocument();
    expect(within(panelMesero).queryByRole("button", { name: "Unir mesas" })).not.toBeInTheDocument();
    expect(within(panelMesero).queryByRole("button", { name: "Transferir" })).not.toBeInTheDocument();
    unmount();

    pintar(MESERO);
    fireEvent.click(await screen.findByRole("button", { name: /^Mesa 2\b/ }));
    expect(screen.getByRole("button", { name: "Bloquear mesa" })).toBeInTheDocument();
    fireEvent.click(tarjeta(1));
    const panel = screen.getByRole("region", { name: "Mesa 1" });
    expect(within(panel).getByRole("button", { name: "Unir mesas" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Transferir" })).toBeInTheDocument();
  });

  it("marcar limpia una mesa por limpiar", async () => {
    pintar();
    fireEvent.click(await screen.findByRole("button", { name: /^Mesa 7\b/ }));
    fireEvent.click(screen.getByRole("button", { name: "Marcar como limpia" }));
    await waitFor(() => expect(llamadasA("/v1/staff/salon/mesas/m7/estado")).toHaveLength(1));
    expect(JSON.parse(llamadasA("/v1/staff/salon/mesas/m7/estado")[0][1].body)).toEqual({ a: "libre" });
  });

  it("bloquear pide el motivo", async () => {
    estado.confirmar.mockResolvedValue({ confirmado: true, motivo: "Mantenimiento" });
    pintar(MESERO);
    fireEvent.click(await screen.findByRole("button", { name: /^Mesa 2\b/ }));
    fireEvent.click(screen.getByRole("button", { name: "Bloquear mesa" }));
    await waitFor(() => expect(llamadasA("/v1/staff/salon/mesas/m2/estado")).toHaveLength(1));
    expect(estado.confirmar.mock.calls[0][0].motivo).toMatchObject({ requerido: true });
    expect(JSON.parse(llamadasA("/v1/staff/salon/mesas/m2/estado")[0][1].body)).toEqual({ a: "bloqueada", motivo: "Mantenimiento" });
  });

  it("mover: elige una mesa libre de destino y envía la versión de la cuenta", async () => {
    estado.confirmar.mockResolvedValue({ confirmado: true, motivo: "" });
    pintar();
    fireEvent.click(await screen.findByRole("button", { name: /^Mesa 1\b/ }));
    const panel = screen.getByRole("region", { name: "Mesa 1" });
    fireEvent.click(within(panel).getByRole("button", { name: "Mover a otra mesa" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Mesa 2" }));
    await waitFor(() => expect(llamadasA("/v1/staff/salon/mesas/m1/mover")).toHaveLength(1));
    expect(JSON.parse(llamadasA("/v1/staff/salon/mesas/m1/mover")[0][1].body)).toEqual({ mesaDestinoId: "m2", versionEsperada: 4 });
  });

  it("un 409 muestra el mensaje del servidor y recarga el plano", async () => {
    pintar();
    fireEvent.click(await screen.findByRole("button", { name: /^Mesa 7\b/ }));
    estado.apiRequest.mockImplementation((ruta, opciones = {}) => {
      if (opciones.method === "POST") {
        const error = new Error("La mesa cambió mientras la editabas. Recarga e intenta de nuevo.");
        error.status = 409;
        return Promise.reject(error);
      }
      return Promise.resolve(respuestas.plano);
    });
    const antes = llamadasA("/v1/staff/salon/mesas").length;
    fireEvent.click(screen.getByRole("button", { name: "Marcar como limpia" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/cambió mientras la editabas/);
    await waitFor(() => expect(llamadasA("/v1/staff/salon/mesas").length).toBeGreaterThan(antes));
  });
});
