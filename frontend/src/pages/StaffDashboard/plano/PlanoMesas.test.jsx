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

  // Revisión de 1.6 · Unir: se ven todas las mesas de la zona; las que no se pueden unir, deshabilitadas con su motivo
  it("unir: lista todas las mesas de la zona y deshabilita las no elegibles con su motivo", async () => {
    const terraza = { id: "z2", nombre: "Terraza" };
    respuestas.plano = {
      ...PLANO(),
      mesas: [
        ...PLANO().mesas,
        mesa(5, "bloqueada"), // combinable pero bloqueada
        mesa(6, "libre", { combinable: false }),
        mesa(8, "ocupada", { cuenta: cuenta({ id: "c8", mesas: [{ id: "m8", numero: 8 }] }) }),
        mesa(9, "libre", { zona: terraza }), // otra zona: no aparece
      ],
    };
    pintar();
    fireEvent.click(await screen.findByRole("button", { name: /^Mesa 1\b/ }));
    const panel = screen.getByRole("region", { name: "Mesa 1" });
    fireEvent.click(within(panel).getByRole("button", { name: "Unir mesas" }));

    const casilla = (n) => within(panel).getByRole("checkbox", { name: new RegExp(`^Mesa ${n}\\b`) });
    expect(casilla(2)).toBeEnabled();
    expect(casilla(3)).toBeDisabled();
    expect(casilla(3)).toHaveAccessibleName(/cuenta pedida/);
    expect(casilla(4)).toBeDisabled();
    expect(casilla(4)).toHaveAccessibleName(/no combinable/);
    expect(casilla(5)).toHaveAccessibleName(/bloqueada/);
    expect(casilla(6)).toHaveAccessibleName(/no combinable/);
    expect(casilla(8)).toBeDisabled();
    expect(casilla(8)).toHaveAccessibleName(/ocupada/);
    expect(within(panel).queryByRole("checkbox", { name: /^Mesa 1\b/ })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("checkbox", { name: /^Mesa 9\b/ })).not.toBeInTheDocument();

    fireEvent.click(casilla(2));
    fireEvent.click(within(panel).getByRole("button", { name: "Unir mesa" }));
    await waitFor(() => expect(llamadasA("/v1/staff/salon/mesas/unir")).toHaveLength(1));
    expect(JSON.parse(llamadasA("/v1/staff/salon/mesas/unir")[0][1].body)).toEqual({ principalId: "m1", mesaIds: ["m2"], versionEsperada: 4 });
  });

  // 1.7b · El mesero solo ve que no es combinable; dónde cambiarlo, solo quien configura el salón
  it("una mesa no combinable no ofrece «Unir mesas»: el mesero solo ve el aviso, sin dónde cambiarlo", async () => {
    respuestas.plano = { ...PLANO(), mesas: [mesa(1, "ocupada", { combinable: false, cuenta: cuenta() }), mesa(2, "libre")] };
    pintar();
    fireEvent.click(await screen.findByRole("button", { name: /^Mesa 1\b/ }));
    const panel = screen.getByRole("region", { name: "Mesa 1" });
    expect(within(panel).queryByRole("button", { name: "Unir mesas" })).not.toBeInTheDocument();
    expect(within(panel).getByText("Esta mesa no es combinable")).toBeInTheDocument();
    expect(within(panel).queryByText(/Admin › Salón/)).not.toBeInTheDocument();
  });

  it("con salon:configurar el aviso dice dónde cambiarlo", async () => {
    respuestas.plano = { ...PLANO(), mesas: [mesa(1, "ocupada", { combinable: false, cuenta: cuenta() }), mesa(2, "libre")] };
    pintar([...MESERO, "salon:configurar"]);
    fireEvent.click(await screen.findByRole("button", { name: /^Mesa 1\b/ }));
    const panel = screen.getByRole("region", { name: "Mesa 1" });
    expect(within(panel).getByText("Esta mesa no es combinable (cámbialo en Admin › Salón)")).toBeInTheDocument();
  });

  // 1.7 · Desde el panel de una mesa con cuenta se abre la toma de comanda y se vuelve al plano
  it("«Ver cuenta / Tomar comanda» abre la cuenta de la mesa; «Volver al plano» regresa y recarga", async () => {
    const respuestaBase = estado.apiRequest.getMockImplementation();
    estado.apiRequest.mockImplementation((ruta, opciones = {}) => {
      if (ruta === "/v1/staff/salon/cuentas/c1") {
        return Promise.resolve({ ...cuenta(), rondas: [], subtotal: 0, ultimaRonda: 0, mesas: [{ id: "m1", numero: 1, zona: { id: "z1", nombre: "Interior" } }] });
      }
      if (ruta === "/v1/staff/salon/catalogo") return Promise.resolve({ categorias: [], productos: [] });
      return respuestaBase(ruta, opciones);
    });
    pintar();
    fireEvent.click(await screen.findByRole("button", { name: /^Mesa 1\b/ }));
    fireEvent.click(within(screen.getByRole("region", { name: "Mesa 1" })).getByRole("button", { name: "Ver cuenta / Tomar comanda" }));
    expect(await screen.findByRole("heading", { name: "Mesa 1", level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Plano de mesas" })).not.toBeInTheDocument();
    const antes = llamadasA("/v1/staff/salon/mesas").length;
    fireEvent.click(screen.getByRole("button", { name: "Volver al plano" }));
    expect(await screen.findByRole("heading", { name: "Plano de mesas" })).toBeInTheDocument();
    await waitFor(() => expect(llamadasA("/v1/staff/salon/mesas").length).toBeGreaterThan(antes));
  });

  it("mientras se ve la cuenta el plano no se refresca; al volver se recarga enseguida", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const respuestaBase = estado.apiRequest.getMockImplementation();
    estado.apiRequest.mockImplementation((ruta, opciones = {}) => {
      if (ruta === "/v1/staff/salon/cuentas/c1") return Promise.resolve({ ...cuenta(), rondas: [], subtotal: 0, mesas: [{ id: "m1", numero: 1, zona: { id: "z1", nombre: "Interior" } }] });
      if (ruta === "/v1/staff/salon/catalogo") return Promise.resolve({ categorias: [], productos: [] });
      return respuestaBase(ruta, opciones);
    });
    pintar();
    fireEvent.click(await screen.findByRole("button", { name: /^Mesa 1,/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ver cuenta / Tomar comanda" }));
    await screen.findByRole("button", { name: "Volver al plano" });
    const antes = llamadasA("/v1/staff/salon/mesas").length;
    await act(async () => { await vi.advanceTimersByTimeAsync(25_000); });
    expect(llamadasA("/v1/staff/salon/mesas").length).toBe(antes);
    fireEvent.click(screen.getByRole("button", { name: "Volver al plano" }));
    await waitFor(() => expect(llamadasA("/v1/staff/salon/mesas").length).toBe(antes + 1));
  });

  it("el botón depende de cuenta:ver y dice «Ver cuenta» a quien no toma comandas; no sale en una mesa sin cuenta", async () => {
    const { unmount } = pintar(["mesa:ver", "cuenta:ver"]);
    fireEvent.click(await screen.findByRole("button", { name: /^Mesa 1\b/ }));
    expect(screen.getByRole("button", { name: "Ver cuenta" })).toBeInTheDocument();
    fireEvent.click(tarjeta(2));
    expect(screen.queryByRole("button", { name: /^Ver cuenta/ })).not.toBeInTheDocument();
    unmount();
    pintar(["mesa:ver", "mesa:operar"]);
    fireEvent.click(await screen.findByRole("button", { name: /^Mesa 1\b/ }));
    expect(screen.queryByRole("button", { name: /^Ver cuenta/ })).not.toBeInTheDocument();
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
