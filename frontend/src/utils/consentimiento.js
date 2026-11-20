// 6.4 (F6-8, F6-f) · Política de tratamiento de datos (Ley 1581 de 2012). La versión debe ser la misma del backend
// (modulos/identidad/consentimiento.js): al cambiar el texto se suben las dos y cada cliente la acepta de nuevo.
export const CONSENTIMIENTO_VERSION = "2026-11";

// Resumen de la política (texto pendiente de revisión por Brayan; ver PROGRESO, 6.4)
export const POLITICA_DATOS = [
  {
    titulo: "Responsable",
    texto: "Brunch Café es responsable del tratamiento de los datos personales que nos entregas al crear tu cuenta, hacer pedidos y reservas.",
  },
  {
    titulo: "Qué datos usamos",
    texto: "Nombre, correo, teléfono, direcciones de entrega, fecha de nacimiento y, si nos las indicas, alergias y preferencias.",
  },
  {
    titulo: "Para qué",
    texto: "Atender tus pedidos, domicilios y reservas, avisarle al equipo de cocina y de sala de tus alergias y preferencias, y darte los beneficios del programa (puntos y descuento de cumpleaños).",
  },
  {
    titulo: "Quién los ve",
    texto: "Solo el personal de Brunch Café que atiende tu pedido. Al personal le mostramos tus alergias y preferencias, no tu correo completo ni tu teléfono en las listas. No vendemos ni cedemos tus datos.",
  },
  {
    titulo: "Tus derechos",
    texto: "Puedes conocer, actualizar y corregir tus datos desde Mi cuenta, y pedir que los suprimamos o revocar esta autorización escribiéndonos por los canales de contacto del restaurante.",
  },
];
