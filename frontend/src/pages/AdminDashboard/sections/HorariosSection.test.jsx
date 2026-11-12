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
    api.get.mockReset().mockResolvedValue({ horarios: HORARIOS, version: 3, actualizadoEn: null });
    api.put.mockReset().mockImplementation((ruta, { versionEsperada, ...datos }) => Promise.resolve({
      horarios: datos, version: versionEsperada + 1, actualizadoEn: "2026-11-05T15:00:00Z",
    }));
  });

  it("carga los horarios y guarda los cambios con la versión leída", async () => {
    render(<HorariosSection />);
    const ultima = await screen.findByLabelText("Última hora de reservas de lunes a viernes");
    expect(ultima).toHaveValue("19:00");
    fireEvent.change(ultima, { target: { value: "15:00" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar horarios/i }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/v1/admin/horarios", {
      ...HORARIOS, reservas: { ...HORARIOS.reservas, entreSemana: { desde: "08:00", hasta: "15:00" } }, versionEsperada: 3,
    }));
    expect(await screen.findByText(/horarios guardados/i)).toBeInTheDocument();
    // El siguiente guardado usa la versión nueva
    fireEvent.click(screen.getByRole("button", { name: /guardar horarios/i }));
    await waitFor(() => expect(api.put).toHaveBeenLastCalledWith("/v1/admin/horarios", expect.objectContaining({ versionEsperada: 4 })));
  });

  // 1.15 · Otro admin guardó antes: aviso del servidor y «Recargar» trae lo nuevo sin perder la pantalla
  it("si otro usuario cambió los horarios (409), lo avisa y «Recargar» trae los cambios", async () => {
    api.put.mockRejectedValueOnce(Object.assign(new Error("Otro usuario cambió los horarios; recarga para ver los cambios."), {
      status: 409, code: "HORARIOS_MODIFICADOS", details: { version: 4 },
    }));
    render(<HorariosSection />);
    fireEvent.change(await screen.findByLabelText("Última hora de domicilio"), { target: { value: "15:00" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar horarios/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Otro usuario cambió los horarios; recarga para ver los cambios.");

    api.get.mockResolvedValueOnce({
      horarios: { ...HORARIOS, domicilio: { ...HORARIOS.domicilio, hasta: "17:00" } }, version: 4, actualizadoEn: "2026-11-05T16:00:00Z",
    });
    fireEvent.click(screen.getByRole("button", { name: "Recargar" }));
    await waitFor(() => expect(screen.getByLabelText("Última hora de domicilio")).toHaveValue("17:00"));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /guardar horarios/i }));
    await waitFor(() => expect(api.put).toHaveBeenLastCalledWith("/v1/admin/horarios", expect.objectContaining({ versionEsperada: 4 })));
  });

  it("muestra «Última modificación» solo si hubo un cambio real", async () => {
    const { unmount } = render(<HorariosSection />);
    await screen.findByLabelText("Primera hora de domicilio");
    expect(screen.queryByText(/Última modificación/)).toBeNull();
    unmount();
    api.get.mockResolvedValueOnce({ horarios: HORARIOS, version: 3, actualizadoEn: "2026-11-05T15:00:00Z" });
    render(<HorariosSection />);
    expect(await screen.findByText(/Última modificación/)).toBeInTheDocument();
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

  it("anticipación: etiqueta corta y el detalle como ayuda asociada al campo", async () => {
    render(<HorariosSection />);
    const campo = await screen.findByLabelText("Anticipación (min)");
    expect(campo).toHaveValue(60);
    expect(campo).toHaveAccessibleDescription("Tiempo mínimo entre el pedido y la entrega");
    expect(screen.queryByText("Anticipación mínima (minutos)")).toBeNull();
  });
});
