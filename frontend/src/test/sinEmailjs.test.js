// 0.16: la confirmación de reserva la envía el backend por SMTP. El frontend no manda datos
// del cliente a EmailJS ni guarda sus claves.
import { describe, it, expect } from "vitest";
import paquete from "../../package.json";

const fuentes = import.meta.glob(["../**/*.{js,jsx}", "!../**/*.test.{js,jsx}", "!../test/**"], {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("Sin EmailJS en el frontend", () => {
  it("no es dependencia del proyecto", () => {
    expect(Object.keys({ ...paquete.dependencies, ...paquete.devDependencies })).not.toContain("@emailjs/browser");
  });

  it("ningún archivo lo importa ni contiene sus claves", () => {
    const hallazgos = Object.entries(fuentes)
      .filter(([, codigo]) => /@emailjs|emailjs\.|service_[a-z0-9]{6,}|template_[a-z0-9]{6,}/i.test(codigo))
      .map(([archivo]) => archivo);
    expect(hallazgos).toEqual([]);
  });
});
