// 3.7.4 · Plantillas de correo de la marca (recuperar contraseña, «Crea tu contraseña» y solicitud de
// reserva). Cada una devuelve { asunto, texto, html, adjuntos } para compartido/correo.js:
//   - HTML con tablas y estilos en línea (Gmail y Outlook ignoran <style> y las clases) y ancho máximo de
//     560 px que se adapta al celular;
//   - logo incrustado como adjunto CID (PNG): no depende de una URL pública ni de que el lector descargue
//     imágenes remotas;
//   - versión en texto plano con lo mismo (y el enlace completo).
// Todo dato que viene del usuario (nombre, rol, observaciones…) y el enlace se escapan en el HTML.
import { fileURLToPath } from 'node:url'

export const LOGO_CID = 'logo@brunchcafe'
const LOGO = {
    filename: 'brunch-cafe.png',
    path: fileURLToPath(new URL('./recursos/logo-correo.png', import.meta.url)),
    cid: LOGO_CID,
    contentType: 'image/png',
}
const PIE = 'Brunch Café · Neiva, Colombia'

// Colores de la marca
const BORDO = '#890620'
const OSCURO = '#2b1a17'
const TEXTO = '#4a3a36'
const SUAVE = '#6b5a55'
const FONDO = '#f6ece9'
const LINEA = '#ead9d4'
const CUERPO = "font-family: Arial, Helvetica, sans-serif"
const TITULOS = "font-family: Georgia, 'Times New Roman', serif"

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/** Escapa texto para HTML (contenido y atributos). */
export const escapar = (valor) => String(valor ?? '').replace(/[&<>"']/g, (c) => ENTIDADES[c])

const saludo = (nombre) => (nombre ? `Hola, ${nombre}` : 'Hola')

const parrafo = (html) => `<p style="margin: 0 0 16px; ${CUERPO}; font-size: 16px; line-height: 24px; color: ${TEXTO};">${html}</p>`

const boton = (texto, enlace) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 8px 0 24px;">
  <tr>
    <td align="center" bgcolor="${BORDO}" style="border-radius: 10px; background-color: ${BORDO};">
      <a href="${escapar(enlace)}" target="_blank" style="display: inline-block; padding: 16px 32px; ${CUERPO}; font-size: 18px; font-weight: bold; line-height: 22px; color: #ffffff; text-decoration: none; border-radius: 10px;">${escapar(texto)}</a>
    </td>
  </tr>
</table>`

const respaldo = (enlace) => parrafo(`Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
<a href="${escapar(enlace)}" target="_blank" style="color: ${BORDO}; text-decoration: underline; word-break: break-all;">${escapar(enlace)}</a>`)

const aviso = (texto) => `<p style="margin: 24px 0 0; padding-top: 16px; border-top: 1px solid ${LINEA}; ${CUERPO}; font-size: 14px; line-height: 21px; color: ${SUAVE};">${escapar(texto)}</p>`

/** Filas «Etiqueta: valor» (datos de la reserva). */
const detalle = (filas) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 20px; border: 1px solid ${LINEA}; border-radius: 10px;">
  ${filas.map(([etiqueta, valor]) => `<tr>
    <td style="padding: 10px 14px; ${CUERPO}; font-size: 15px; line-height: 22px; color: ${SUAVE}; width: 38%; vertical-align: top;">${escapar(etiqueta)}</td>
    <td style="padding: 10px 14px; ${CUERPO}; font-size: 15px; line-height: 22px; color: ${OSCURO}; font-weight: bold;">${escapar(valor)}</td>
  </tr>`).join('')}
</table>`

/** Estructura común: logo, título, contenido y pie. `previo` es el texto que el buzón muestra junto al asunto. */
const marco = ({ asunto, previo, titulo, contenido }) => `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapar(asunto)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${FONDO};">
<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${escapar(previo)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${FONDO}" style="background-color: ${FONDO};">
  <tr>
    <td align="center" style="padding: 24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; width: 100%;">
        <tr>
          <td align="center" style="padding: 8px 0 20px;">
            <img src="cid:${LOGO_CID}" width="220" height="73" alt="Brunch Café" style="display: block; width: 220px; max-width: 70%; height: auto; border: 0;">
          </td>
        </tr>
        <tr>
          <td bgcolor="#ffffff" style="background-color: #ffffff; border-radius: 16px; padding: 32px 28px;">
            <h1 style="margin: 0 0 20px; ${TITULOS}; font-size: 26px; line-height: 32px; font-weight: normal; color: ${OSCURO};">${escapar(titulo)}</h1>
            ${contenido}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 8px; ${CUERPO}; font-size: 13px; line-height: 20px; color: ${SUAVE};">${escapar(PIE)}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

const textoPlano = (lineas) => [...lineas, '', '—', PIE].join('\n')

/** (a) Recuperar contraseña (cualquier usuario): enlace de un uso que vence en 30 minutos. */
export const correoRecuperacion = ({ nombre, enlace }) => {
    const asunto = 'Restablece tu contraseña de Brunch Café'
    const vence = 'El enlace vence en 30 minutos y sirve una sola vez.'
    const ignora = 'Si no lo pediste, ignora este correo: tu contraseña no cambia.'
    return {
        asunto,
        texto: textoPlano([
            `${saludo(nombre)}.`, '',
            'Recibimos una solicitud para restablecer la contraseña de tu cuenta de Brunch Café.',
            `Restablécela con este enlace: ${enlace}`, '',
            vence, '', ignora,
        ]),
        html: marco({
            asunto,
            previo: 'Restablece tu contraseña con el enlace (vence en 30 minutos).',
            titulo: 'Restablece tu contraseña',
            contenido: [
                parrafo(`${escapar(saludo(nombre))}.`),
                parrafo('Recibimos una solicitud para restablecer la contraseña de tu cuenta de Brunch Café.'),
                boton('Restablecer contraseña', enlace),
                parrafo(`<strong>${escapar(vence)}</strong>`),
                respaldo(enlace),
                aviso(ignora),
            ].join('\n'),
        }),
        adjuntos: [LOGO],
    }
}

/** (b) «Crea tu contraseña» para un empleado nuevo (cuenta creada por el admin): vence en 24 horas. */
export const correoCreacion = ({ nombre, rol, enlace }) => {
    const asunto = 'Crea tu contraseña de Brunch Café'
    const vence = 'El enlace vence en 24 horas y sirve una sola vez.'
    const ignora = 'Si no lo pediste ni esperabas este correo, ignóralo.'
    const creada = rol ? `El equipo de Brunch Café te creó una cuenta como ${rol}.` : 'El equipo de Brunch Café te creó una cuenta.'
    return {
        asunto,
        texto: textoPlano([
            `${saludo(nombre)}.`, '',
            creada,
            `Crea tu contraseña con este enlace para empezar: ${enlace}`, '',
            vence, '', ignora,
        ]),
        html: marco({
            asunto,
            previo: 'Tu cuenta está lista: crea tu contraseña (el enlace vence en 24 horas).',
            // Con rol, un empleado nuevo; sin rol, un cliente al que el admin le creó la cuenta
            titulo: rol ? 'Bienvenido al equipo' : 'Crea tu contraseña',
            contenido: [
                parrafo(`${escapar(saludo(nombre))}.`),
                parrafo(rol
                    ? `El equipo de Brunch Café te creó una cuenta como <strong>${escapar(rol)}</strong>. Crea tu contraseña para empezar.`
                    : 'El equipo de Brunch Café te creó una cuenta. Crea tu contraseña para empezar.'),
                boton('Crear mi contraseña', enlace),
                parrafo(`<strong>${escapar(vence)}</strong>`),
                respaldo(enlace),
                aviso(ignora),
            ].join('\n'),
        }),
        adjuntos: [LOGO],
    }
}

// Reserva.fecha es una fecha de calendario guardada a medianoche UTC y la hora es «HH:MM» local: se
// formatean en UTC a propósito (como antes de 3.7.4) para no correr el día al pasar a America/Bogota
const fechaTexto = (fecha) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(fecha))
const horaTexto = (hora) => new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
    .format(new Date(`2000-01-01T${hora}:00Z`))

/**
 * (c) Solicitud de reserva recibida (queda pendiente de confirmación). El botón lleva a «Mis reservas» si la
 * hizo el cliente desde su cuenta (`conCuenta`) o al menú si la registró el personal (no tiene cuenta).
 */
export const correoReserva = ({ nombre, fecha, hora, cantidadPersonas, motivo, observaciones, enlace, conCuenta }) => {
    const asunto = 'Recibimos tu solicitud de reserva en Brunch Café'
    const ignora = 'Si no hiciste esta reserva, ignora este correo.'
    const filas = [
        ['Fecha', fechaTexto(fecha)],
        ['Hora', horaTexto(hora)],
        ['Personas', `${cantidadPersonas} ${cantidadPersonas === 1 ? 'persona' : 'personas'}`],
        ['Motivo', motivo || '—'],
        ['Observaciones', observaciones || 'Ninguna'],
    ]
    const textoBoton = conCuenta ? 'Ver mis reservas' : 'Ver el menú'
    return {
        asunto,
        texto: textoPlano([
            `${saludo(nombre)}.`, '',
            'Recibimos tu solicitud de reserva en Brunch Café. Quedó pendiente de confirmación.', '',
            ...filas.map(([etiqueta, valor]) => `${etiqueta}: ${valor}`), '',
            'Te avisaremos cuando la confirmemos.',
            `${textoBoton}: ${enlace}`, '',
            ignora,
        ]),
        html: marco({
            asunto,
            previo: `Reserva para ${filas[2][1]} el ${filas[0][1]}: pendiente de confirmación.`,
            titulo: 'Recibimos tu reserva',
            contenido: [
                parrafo(`${escapar(saludo(nombre))}.`),
                parrafo('Recibimos tu solicitud de reserva. Quedó <strong>pendiente de confirmación</strong>: te avisaremos cuando la confirmemos.'),
                detalle(filas),
                boton(textoBoton, enlace),
                respaldo(enlace),
                aviso(ignora),
            ].join('\n'),
        }),
        adjuntos: [LOGO],
    }
}
