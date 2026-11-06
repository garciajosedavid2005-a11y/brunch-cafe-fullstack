import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../services/api", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "../../services/api";
import { reiniciarHorarios } from "../../hooks/useHorarios";
import Footer from "../Footer/Footer";
import UbicacionNosotros from "../UbicacionNosotros/UbicacionNosotros";

const HORARIOS = {
  domicilio: { desde: "08:00", hasta: "16:00", anticipacionMinutos: 60 },
  reservas: { entreSemana: { desde: "08:00", hasta: "15:00" }, finDeSemana: { desde: "09:00", hasta: "17:00" } },
};
const texto = (el) => el.textContent.replace(/\s/g, " ");

describe("Pie de página y Nosotros leen los horarios de la configuración", () => {
  beforeEach(() => {
    reiniciarHorarios();
    apiRequest.mockReset().mockResolvedValue({ horarios: HORARIOS });
  });

  it.each([
    ["pie de página", () => render(<MemoryRouter><Footer /></MemoryRouter>)],
    ["Nosotros", () => render(<UbicacionNosotros />)],
  ])("%s: muestra reservas y domicilios configurados, sin textos fijos", async (_, montar) => {
    const { container } = montar();
    const lista = await screen.findByRole("list", { name: /horarios/i });
    expect(texto(lista)).toContain("Reservas de lunes a viernes: 8:00 a. m. – 3:00 p. m.");
    expect(texto(lista)).toContain("Reservas de sábados y domingos: 9:00 a. m. – 5:00 p. m.");
    expect(texto(lista)).toContain("Domicilios para el mismo día: 8:00 a. m. – 4:00 p. m.");
    expect(apiRequest).toHaveBeenCalledWith("/v1/horarios");
    // Los textos fijos anteriores ya no están
    expect(container.textContent).not.toMatch(/8:00 AM - 4:00 PM|9:00 AM - 3:00 PM|8 am - 12 pm|8 am - 11 am/);
  });

  it("si no se pueden cargar no inventa un horario", async () => {
    apiRequest.mockReset().mockRejectedValue(new Error("No se pudo conectar con el servidor."));
    render(<MemoryRouter><Footer /></MemoryRouter>);
    expect(await screen.findByText(/no pudimos cargar los horarios/i)).toBeInTheDocument();
    expect(screen.queryByText(/a\. m\./)).toBeNull();
  });
});
