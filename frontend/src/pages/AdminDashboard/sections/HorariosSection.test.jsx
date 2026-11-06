import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../../services/api", () => ({ api: { get: vi.fn(), put: vi.fn() } }));

import { api } from "../../../services/api";
import HorariosSection from "./HorariosSection";

const HORARIOS = {
  domicilio: { desde: "08:00", hasta: "16:00", anticipacionMinutos: 60 },
  reservas: { entreSemana: { desde: "08:00", hasta: "19:00" }, finDeSemana: { desde: "08:00", hasta: "17:00" } },
};

describe("Admin: horarios de domicilio y reservas", () => {
  beforeEach(() => {
    api.get.mockReset().mockResolvedValue({ horarios: HORARIOS, actualizadoEn: null });
    api.put.mockReset().mockImplementation((ruta, datos) => Promise.resolve({ horarios: datos, actualizadoEn: "2026-11-05T15:00:00Z" }));
  });

  it("carga los horarios y guarda los cambios", async () => {
    render(<HorariosSection />);
    const ultima = await screen.findByLabelText("Última hora de reservas de lunes a viernes");
    expect(ultima).toHaveValue("19:00");
    fireEvent.change(ultima, { target: { value: "15:00" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar horarios/i }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/v1/admin/horarios", {
      ...HORARIOS, reservas: { ...HORARIOS.reservas, entreSemana: { desde: "08:00", hasta: "15:00" } },
    }));
    expect(await screen.findByText(/horarios guardados/i)).toBeInTheDocument();
  });

  it("solo ofrece horas en punto", async () => {
    render(<HorariosSection />);
    const desde = await screen.findByLabelText("Primera hora de domicilio");
    expect([...desde.options].every((o) => o.value.endsWith(":00"))).toBe(true);
  });

  it("no guarda si la primera hora es posterior a la última", async () => {
    render(<HorariosSection />);
    fireEvent.change(await screen.findByLabelText("Primera hora de domicilio"), { target: { value: "18:00" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar horarios/i }));
    expect(await screen.findByText(/domicilio: la primera hora no puede ser posterior/i)).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });
});
