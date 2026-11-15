import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const estado = vi.hoisted(() => ({ apiRequest: vi.fn(), confirmar: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest }));
vi.mock("../../../context/useDialogo", () => ({ useDialogo: () => ({ confirmar: estado.confirmar, avisar: vi.fn() }) }));

import PlanoMesas from "./PlanoMesas";

// 4.3 · Reservas en el plano (F4-e), mesa reservada (F4-c), «Sentar» (F4-6) y no-show sugerido (F4-5)
const reserva = (extra = {}) => ({
  id: "r1", codigo: "RES-00000A", cliente: "Laura Gómez", personas: 2, hora: "08:00", inicio: "2026-11-15T13:00:00Z",
  estado: "confirmada", bloqueada: false, minutosRetraso: 0, ...extra,
});
const mesa = (numero, extra = {}) => ({
  id: `m${numero}`, numero, nombre: "", zona: { id: "z1", nombre: "Interior" }, capacidad: 4,
  estado: "libre", combinable: true, posicion: null, cuenta: null, reserva: null, ...extra,
});
const MESERO = ["mesa:ver", "mesa:operar", "cuenta:abrir", "cuenta:ver", "comanda:tomar", "reserva:ver", "reserva:cambiar_estado"];

let plano;
beforeEach(() => {
  plano = { actualizadoEn: "2026-11-15T12:50:00Z", zonas: [{ id: "z1", nombre: "Interior", orden: 1 }], mesas: [mesa(1), mesa(2, { reserva: reserva() })] };
  estado.confirmar.mockReset();
  estado.apiRequest.mockReset();
  estado.apiRequest.mockImplementation((ruta, opciones = {}) => {
    if (ruta === "/v1/staff/salon/mesas") return Promise.resolve(plano);
    if (ruta === "/v1/staff/salon/meseros") return Promise.resolve([{ id: "u9", nombre: "Mesero P.", yo: true }]);
    if (opciones.method) return Promise.resolve({});
    return Promise.reject(new Error(`Ruta inesperada ${ruta}`));
  });
});

const tarjeta = (numero) => screen.getByRole("button", { name: new RegExp(`^Mesa ${numero}\\b`) });

describe("4.3 · Reservas en el plano", () => {
  it("la mesa con reserva próxima lo dice en texto (no solo color) y en su nombre accesible", async () => {
    render(<PlanoMesas permisos={MESERO} />);
    await screen.findByRole("button", { name: /^Mesa 2\b/ });
    expect(within(tarjeta(2)).getByText("Reservada 8:00 a. m.")).toBeInTheDocument();
    expect(tarjeta(2)).toHaveAccessibleName(expect.stringMatching(/reservada a las 8:00 a\. m\. para Laura Gómez/));
    expect(within(tarjeta(1)).queryByText(/Reservada/)).toBeNull();
  });

  it("antes del bloque: el panel avisa de la reserva y deja abrir la cuenta o sentar a la reserva", async () => {
    render(<PlanoMesas permisos={MESERO} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Mesa 2\b/ }));
    expect(screen.getByText(/Reservada para Laura Gómez \(2 personas\) a las 8:00 a\. m\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir cuenta" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Sentar a Laura Gómez" }));
    await waitFor(() => expect(estado.apiRequest).toHaveBeenCalledWith("/v1/staff/reservas/r1/sentar",
      expect.objectContaining({ method: "POST", body: "{}", headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }) })));
  });

  it("con el bloque empezado no se ofrece «Abrir cuenta»: solo «Sentar»; con 15 min de retraso sugiere «No llegó»", async () => {
    plano.mesas[1].reserva = reserva({ bloqueada: true, minutosRetraso: 20 });
    estado.confirmar.mockResolvedValue({ confirmado: true });
    render(<PlanoMesas permisos={MESERO} />);
    await screen.findByRole("button", { name: /^Mesa 2\b/ });
    expect(within(tarjeta(2)).getByText("Retrasada 20 min · 8:00 a. m.")).toBeInTheDocument();
    fireEvent.click(tarjeta(2));
    expect(screen.queryByRole("button", { name: "Abrir cuenta" })).toBeNull();
    expect(screen.getByText(/La mesa está reservada/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "No llegó" }));
    await waitFor(() => expect(estado.apiRequest).toHaveBeenCalledWith("/v1/staff/reservas/r1/estado",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ codigo: "no_show" }) })));
  });

  it("sin reserva:cambiar_estado no se ofrecen «Sentar» ni «No llegó»", async () => {
    plano.mesas[1].reserva = reserva({ bloqueada: true, minutosRetraso: 20 });
    render(<PlanoMesas permisos={MESERO.filter((p) => p !== "reserva:cambiar_estado")} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Mesa 2\b/ }));
    expect(screen.queryByRole("button", { name: /Sentar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "No llegó" })).toBeNull();
  });
});
