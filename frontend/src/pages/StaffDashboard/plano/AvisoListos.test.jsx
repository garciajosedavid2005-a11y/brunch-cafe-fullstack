import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

const estado = vi.hoisted(() => ({ apiRequest: vi.fn(), confirmar: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest, API_URL: "http://api.test/api" }));
vi.mock("../../../context/useDialogo", () => ({ useDialogo: () => ({ confirmar: estado.confirmar, avisar: vi.fn() }) }));

import AvisoListos from "./AvisoListos";
import PlanoMesas from "./PlanoMesas";

// 2.6 · «Listo para servir» en el plano y aviso no intrusivo en /staff para el mesero de la cuenta, que se
// actualiza por su canal «mesero:<id>» (con polling de respaldo) y lleva a la cuenta con un toque.
const cuenta = (id, numeros, listos, meseroId = "u1") => ({
  id, codigo: `C-${id}`, estado: "abierta", comensales: 2, mesero: { id: meseroId, nombre: "Ana P." },
  abiertaEn: "2026-11-10T12:00:00Z", minutosOcupada: 20, total: 18000, pendiente: 0,
  mesas: numeros.map((n) => ({ id: `m${n}`, numero: n })), version: 1, listosParaServir: listos,
});
const mesa = (numero, c = null) => ({
  id: `m${numero}`, numero, nombre: "", zona: { id: "z1", nombre: "Interior" }, capacidad: 4,
  estado: c ? "ocupada" : "libre", combinable: true, posicion: null, cuenta: c,
});
const PLANO = () => {
  const unida = cuenta("c2", [2, 3], 1);
  return {
    actualizadoEn: "2026-11-10T12:35:00Z",
    zonas: [{ id: "z1", nombre: "Interior", orden: 1 }],
    mesas: [mesa(1, cuenta("c1", [1], 2)), mesa(2, unida), mesa(3, unida), mesa(4, cuenta("c4", [4], 0)), mesa(5, cuenta("c5", [5], 3, "otro")), mesa(6)],
  };
};

class FakeEventSource {
  static instancias = [];
  static CLOSED = 2;
  constructor(url) { this.url = url; FakeEventSource.instancias.push(this); }
  addEventListener() {}
  close() {}
}

let respuestas;
beforeEach(() => {
  FakeEventSource.instancias = [];
  globalThis.EventSource = FakeEventSource;
  respuestas = { plano: PLANO() };
  estado.apiRequest.mockReset();
  estado.apiRequest.mockImplementation((ruta) => {
    if (ruta === "/v1/staff/salon/mesas") return Promise.resolve(respuestas.plano);
    return Promise.reject(new Error(`Ruta inesperada ${ruta}`));
  });
});
afterEach(() => { delete globalThis.EventSource; });

describe("Insignia en el plano (2.6)", () => {
  it("la mesa con ítems listos lo dice con texto e icono y en su nombre accesible; sin listos, nada", async () => {
    render(<PlanoMesas permisos={["mesa:ver", "cuenta:ver"]} />);
    const m1 = await screen.findByRole("button", { name: /^Mesa 1\b/ });
    expect(m1.querySelector(".plano__listos")).toHaveTextContent("Listo para servir (2)");
    expect(m1).toHaveAccessibleName(/listo para servir: 2/);
    // Mesas unidas: la insignia en las dos tarjetas de la misma cuenta
    expect(screen.getByRole("button", { name: /^Mesa 3\b/ }).querySelector(".plano__listos")).toHaveTextContent("Listo para servir (1)");
    const m4 = screen.getByRole("button", { name: /^Mesa 4\b/ });
    expect(within(m4).queryByText(/Listo para servir/)).not.toBeInTheDocument();
    expect(m4).not.toHaveAccessibleName(/listo para servir/);
  });
});

describe("Aviso en /staff (2.6)", () => {
  const pintar = (props = {}) => render(<AvisoListos usuarioId="u1" onAbrirCuenta={vi.fn()} {...props} />);

  it("solo las cuentas del propio mesero con ítems listos, una vez por cuenta (mesas unidas juntas)", async () => {
    pintar();
    const aviso = await screen.findByRole("status", { name: "Listo para servir" });
    const botones = within(aviso).getAllByRole("button", { name: /^Mesa/ });
    expect(botones.map((b) => b.textContent)).toEqual(["Mesa 1 (2)", "Mesa 2 + 3 (1)"]);
    expect(aviso).not.toHaveTextContent("Mesa 5"); // de otro mesero
    expect(aviso).not.toHaveTextContent("Mesa 4"); // sin listos
  });

  it("tocar una mesa abre su cuenta", async () => {
    const onAbrirCuenta = vi.fn();
    pintar({ onAbrirCuenta });
    fireEvent.click(await screen.findByRole("button", { name: "Mesa 2 + 3 (1)" }));
    expect(onAbrirCuenta).toHaveBeenCalledWith("c2");
  });

  it("escucha su canal «mesero:<id>» y relee el plano al recibir un aviso", async () => {
    pintar();
    await screen.findByRole("status", { name: "Listo para servir" });
    const fuente = FakeEventSource.instancias.at(-1);
    expect(new URL(fuente.url).searchParams.get("canales")).toBe("mesero:u1");
    respuestas.plano = { ...PLANO(), mesas: PLANO().mesas.map((m) => (m.cuenta ? { ...m, cuenta: { ...m.cuenta, listosParaServir: 0 } } : m)) };
    await act(async () => { fuente.onmessage({ data: JSON.stringify({ canal: "mesero:u1", tipo: "item_estado", ids: {} }) }); });
    expect(screen.queryByRole("status", { name: "Listo para servir" })).not.toBeInTheDocument();
  });

  it("sin nada listo no ocupa espacio ni anuncia nada", async () => {
    respuestas.plano = { ...PLANO(), mesas: [mesa(4, cuenta("c4", [4], 0))] };
    pintar();
    await act(async () => {});
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("avisa (para el sonido) cuando aumentan los listos, no en la primera carga ni cuando bajan", async () => {
    const onNuevos = vi.fn();
    pintar({ onNuevos });
    await screen.findByRole("status", { name: "Listo para servir" });
    expect(onNuevos).not.toHaveBeenCalled();
    const fuente = FakeEventSource.instancias.at(-1);
    const conListos = (n) => ({ ...PLANO(), mesas: PLANO().mesas.map((m) => (m.cuenta?.id === "c1" ? { ...m, cuenta: { ...m.cuenta, listosParaServir: n } } : m)) });
    respuestas.plano = conListos(4);
    await act(async () => { fuente.onmessage({ data: JSON.stringify({ tipo: "item_estado", ids: {} }) }); });
    expect(onNuevos).toHaveBeenCalledTimes(1);
    respuestas.plano = conListos(1);
    await act(async () => { fuente.onmessage({ data: JSON.stringify({ tipo: "item_estado", ids: {} }) }); });
    expect(onNuevos).toHaveBeenCalledTimes(1);
  });
});

describe("Sonido por pantalla (F2-8)", () => {
  class FakeAudioContext { state = "suspended"; resume() { this.state = "running"; return Promise.resolve(); } close() {} }
  beforeEach(() => { globalThis.AudioContext = FakeAudioContext; localStorage.clear(); });
  afterEach(() => { delete globalThis.AudioContext; });

  it("en /staff empieza apagado; en /kds, encendido; cada pantalla guarda el suyo", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useSonidoKds } = await import("../../Kds/useSonidoKds");
    const staff = renderHook(() => useSonidoKds({ clave: "staff.sonido", porDefecto: false }));
    const kds = renderHook(() => useSonidoKds());
    expect(staff.result.current.activado).toBe(false);
    expect(kds.result.current.activado).toBe(true);
    act(() => staff.result.current.alternar());
    expect(staff.result.current.activado).toBe(true);
    expect(localStorage.getItem("staff.sonido")).toBe("si");
    expect(localStorage.getItem("kds.sonido")).toBeNull();
  });
});
