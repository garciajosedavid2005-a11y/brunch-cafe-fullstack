// Fase 5 · Exportación a CSV de los reportes (F5-9). Separador «;» y BOM UTF-8: Excel en español lo abre con
// las columnas separadas y las tildes bien. Los números van sin formato (12500, 4.5) para poder sumarlos.
const celda = (valor) => {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor);
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

/** columnas = [{ titulo, valor: (fila) => … }] → texto CSV. */
export const aCSV = (columnas, filas) =>
  [columnas.map((c) => celda(c.titulo)).join(";"), ...filas.map((f) => columnas.map((c) => celda(c.valor(f))).join(";"))].join("\r\n");

const BOM = String.fromCharCode(0xfeff);

/** Descarga el CSV en el navegador. */
export const descargarCSV = (nombre, columnas, filas) => {
  const blob = new Blob([BOM + aCSV(columnas, filas)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre.endsWith(".csv") ? nombre : `${nombre}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
};
