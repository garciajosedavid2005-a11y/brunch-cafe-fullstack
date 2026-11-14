// 3.7.4 · Envía un correo de prueba de una plantilla por el SMTP de backend/.env (no toca la BD).
//   npm run correo:prueba -- <tipo> <correo>
//   tipos: recuperacion | creacion | reserva
// Los datos son de ejemplo y el enlace no sirve para cambiar ninguna contraseña. El asunto lleva «[Prueba]».
// No muestra las credenciales; de la dirección solo el comienzo.
import { config } from '../src/config.js'
import { enviarCorreo, smtpConfigurado } from '../src/modulos/compartido/correo.js'
import { correoCreacion, correoRecuperacion, correoReserva } from '../src/modulos/compartido/plantillasCorreo.js'

const base = config.CLIENT_URLS[0]
const enlacePrueba = (tipo) => {
    const url = new URL('/restablecer-contrasena', base)
    url.searchParams.set('token', 'enlace-de-prueba-no-valido')
    if (tipo === 'crear') url.searchParams.set('tipo', 'crear')
    return url.toString()
}
const manana = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1))

const PLANTILLAS = {
    recuperacion: () => correoRecuperacion({ nombre: 'Ana María', enlace: enlacePrueba() }),
    creacion: () => correoCreacion({ nombre: 'Ana María', rol: 'Mesero', enlace: enlacePrueba('crear') }),
    reserva: () => correoReserva({
        nombre: 'Ana María', fecha: manana, hora: '09:30', cantidadPersonas: 4, motivo: 'Cumpleaños',
        observaciones: 'Mesa junto a la ventana, si es posible', conCuenta: true, enlace: new URL('/cuenta', base).toString(),
    }),
}

const [tipo, para] = process.argv.slice(2)
// Solo el primer carácter y el dominio (también con partes locales cortas)
const oculta = (correo) => correo.replace(/^(.).*(@[^@]*)$/, '$1…$2')

if (!PLANTILLAS[tipo] || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para || '')) {
    console.error('Uso: npm run correo:prueba -- <recuperacion|creacion|reserva> <correo>')
    process.exit(1)
}
if (!smtpConfigurado()) {
    console.error('Falta configurar SMTP_HOST, SMTP_USER y SMTP_PASSWORD en backend/.env.')
    process.exit(1)
}

try {
    const correo = PLANTILLAS[tipo]()
    await enviarCorreo({ para, ...correo, asunto: `[Prueba] ${correo.asunto}` })
    console.log(`✓ Enviado «${tipo}» a ${oculta(para)} (puerto ${config.SMTP_PORT}).`)
} catch (error) {
    // Sin la dirección ni las credenciales: solo los códigos (el mensaje del servidor puede traer el destinatario)
    console.error(`✗ No se pudo enviar «${tipo}»: ${error?.code || 'SMTP_SEND_FAILED'}${error?.responseCode ? ` (SMTP ${error.responseCode})` : ''}`)
    process.exitCode = 1
}
