import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("../../services/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@emailjs/browser", () => ({ default: { send: vi.fn() } }));
const CLIENTA = { id: "u1", nombre: "Ana", apellido: "Pérez", email: "ana@example.com", telefono: "3001234567", permisos: [], esPersonal: false };
const sesion = vi.hoisted(() => ({ user: null }));
vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ user: sesion.user }) }));

import { apiRequest } from "../../services/api";
import { reiniciarHorarios } from "../../hooks/useHorarios";
import FormularioReservas from "./FormularioReservas";

const HORARIOS = {
  domicilio: { desde: "08:00", hasta: "16:00", anticipacionMinutos: 60 },
  reservas: { entreSemana: { desde: "08:00", hasta: "19:00" }, finDeSemana: { desde: "08:00", hasta: "17:00" } },
};

describe("Formulario de reservas: horas del horario configurado", () => {
  beforeEach(() => {
    reiniciarHorarios();
    sesion.user = CLIENTA;
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ horarios: HORARIOS });
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-05T10:15:00-05:00") }); // jueves
  });
  afterEach(() => vi.useRealTimers());

  const horasPara = async (fecha) => {
    render(<FormularioReservas />);
    fireEvent.change(screen.getByLabelText(/fecha/i), { target: { value: fecha } });
    const selector = screen.getByLabelText(/hora/i);
    return (await within(selector).findAllByRole("option", { name: /m\./ })).map((o) => o.value);
  };

  it("entre semana de 8:00 a 19:00, en punto", async () => {
    const horas = await horasPara("2026-11-12");
    expect(horas[0]).toBe("08:00");
    expect(horas.at(-1)).toBe("19:00");
    expect(horas.every((h) => h.endsWith(":00"))).toBe(true);
  });

  it("sábado hasta las 17:00", async () => {
    expect((await horasPara("2026-11-14")).at(-1)).toBe("17:00");
  });

  it("hoy no ofrece horas que ya pasaron", async () => {
    expect((await horasPara("2026-11-05"))[0]).toBe("11:00");
  });

  it("muestra el horario configurado y pide el teléfono (prellenado)", async () => {
    render(<FormularioReservas />);
    expect((await screen.findByText(/lunes a viernes/i)).textContent.replace(/\s/g, " ")).toMatch(/8:00 a. m. a 7:00 p. m./);
    expect(screen.getByLabelText(/teléfono/i)).toHaveValue("3001234567");
  });

  // 0.15e: el personal registra la reserva de un cliente (usuario: null + registradaPor)
  describe("registrada por el personal", () => {
    const MESERO = { id: "m1", nombre: "Mario", apellido: "Mesa", email: "mario@cafe.test", telefono: "3110000000", permisos: ["reserva:crear"], esPersonal: true };

    it("empieza vacío, el correo es opcional y se envía a /v1/staff/reservas", async () => {
      sesion.user = MESERO;
      apiRequest.mockImplementation((ruta) => Promise.resolve(ruta.includes("horarios") ? { horarios: HORARIOS } : { reservation: {} }));
      render(<FormularioReservas />);

      expect(screen.getByLabelText(/nombre del cliente/i)).toHaveValue("");
      expect(screen.getByLabelText(/^correo del cliente .opcional.:$/i)).toHaveValue("");
      expect(screen.getByLabelText(/teléfono del cliente/i)).toHaveValue("");

      fireEvent.change(screen.getByLabelText(/nombre del cliente/i), { target: { value: "Laura Ruiz" } });
      fireEvent.change(screen.getByLabelText(/teléfono del cliente/i), { target: { value: "3209876543" } });
      fireEvent.change(screen.getByLabelText(/motivo/i), { target: { value: "Cumpleaños" } });
      fireEvent.change(screen.getByLabelText(/personas/i), { target: { value: "4" } });
      fireEvent.change(screen.getByLabelText(/fecha/i), { target: { value: "2026-11-12" } });
      await within(screen.getByLabelText(/hora/i)).findAllByRole("option", { name: /m./ });
      fireEvent.change(screen.getByLabelText(/hora/i), { target: { value: "10:00" } });
      fireEvent.click(screen.getByRole("button", { name: /enviar reserva/i }));
      fireEvent.click(await screen.findByRole("button", { name: /enviar solicitud/i }));

      expect(await screen.findByRole("status")).toHaveTextContent(/reserva registrada para laura ruiz/i);
      const [ruta, opciones] = apiRequest.mock.calls.find(([r]) => r.includes("reservas"));
      expect(ruta).toBe("/v1/staff/reservas");
      expect(JSON.parse(opciones.body)).toMatchObject({ nombre: "Laura Ruiz", telefono: "3209876543", correo: "" });
    });

    it("sin teléfono del cliente no deja continuar", async () => {
      sesion.user = MESERO;
      render(<FormularioReservas />);
      fireEvent.submit(screen.getByRole("button", { name: /enviar reserva/i }).closest("form"));
      expect(await screen.findByText("El teléfono es requerido.")).toBeInTheDocument();
      expect(screen.queryByText("Ingresa un correo válido.")).toBeNull();
    });
  });
});
