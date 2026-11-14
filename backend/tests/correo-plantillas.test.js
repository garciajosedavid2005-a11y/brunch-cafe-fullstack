// 3.7.4 · Correos reales con plantillas HTML de la marca: recuperar contraseña, «Crea tu contraseña» (empleado
// nuevo, con su rol) y solicitud de reserva. Logo incrustado (CID, PNG), saludo con el nombre, botón bordó,
// enlace de respaldo, vencimiento, aviso de «si no lo pediste», pie y versión en texto plano. Sin enviar nada:
// nodemailer va simulado. También el transporte: STARTTLS obligatorio (requireTLS) fuera del puerto 465.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const smtp = vi.hoisted(() => ({ createTransport: vi.fn(), sendMail: vi.fn() }))
vi.mock('nodemailer', () => ({ default: { createTransport: smtp.createTransport } }))

import { config } from '../src/config.js'
import { enviarCorreo } from '../src/modulos/compartido/correo.js'
import { LOGO_CID, correoRecuperacion, correoCreacion, correoReserva } from '../src/modulos/compartido/plantillasCorreo.js'

const ENLACE = 'http://localhost:5173/restablecer-contrasena?token=abc123&tipo=crear'
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const RESERVA = {
    nombre: 'Ana Pérez', fecha: new Date('2026-11-20T00:00:00Z'), hora: '09:00', cantidadPersonas: 3, motivo: 'Cumpleaños', observaciones: 'Mesa junto a la ventana',
}

const comunes = (correo) => {
    // Logo incrustado como adjunto CID (PNG real), referenciado desde el HTML
    expect(correo.adjuntos).toHaveLength(1)
    const [logo] = correo.adjuntos
    expect(logo).toMatchObject({ cid: LOGO_CID, contentType: 'image/png' })
    expect([...readFileSync(logo.path).subarray(0, 8)]).toEqual(PNG)
    expect(correo.html).toContain(`src="cid:${LOGO_CID}"`)
    // Pie, celular (viewport y ancho máximo) y estilos en línea: sin <style> ni scripts
    expect(correo.html).toContain('Brunch Café · Neiva, Colombia')
    expect(correo.texto).toContain('Brunch Café · Neiva, Colombia')
    expect(correo.html).toMatch(/<meta name="viewport"/)
    expect(correo.html).toMatch(/max-width:\s*560px/)
    expect(correo.html).not.toMatch(/<style|<script|class="/)
    expect(correo.html).toMatch(/lang="es"/)
}

describe('Plantillas de correo (3.7.4)', () => {
    it('recuperar contraseña: saludo, botón bordó con el enlace, enlace de respaldo, vence en 30 minutos y aviso', () => {
        const correo = correoRecuperacion({ nombre: 'Ana', enlace: ENLACE })
        comunes(correo)
        expect(correo.asunto).toBe('Restablece tu contraseña de Brunch Café')
        expect(correo.html).toContain('Hola, Ana')
        // Botón grande bordó y el mismo enlace como texto (con & escapado en el HTML)
        const href = ENLACE.replace(/&/g, '&amp;')
        expect(correo.html.match(new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'))).toHaveLength(2)
        expect(correo.html).toMatch(/background(-color)?:\s*#890620/)
        expect(correo.html).toContain('Restablecer contraseña')
        expect(correo.html).toContain('vence en 30 minutos')
        expect(correo.html).toMatch(/Si no lo pediste, ignora este correo/)
        // Texto plano: todo lo esencial, con el enlace tal cual
        expect(correo.texto).toContain('Hola, Ana')
        expect(correo.texto).toContain(ENLACE)
        expect(correo.texto).toContain('vence en 30 minutos')
        expect(correo.texto).toMatch(/Si no lo pediste, ignora este correo/)
    })

    it('«Crea tu contraseña»: nombre y rol del empleado, vence en 24 horas', () => {
        const correo = correoCreacion({ nombre: 'Carlos', rol: 'Mesero', enlace: ENLACE })
        comunes(correo)
        expect(correo.asunto).toBe('Crea tu contraseña de Brunch Café')
        expect(correo.html).toContain('Hola, Carlos')
        expect(correo.html).toContain('<strong>Mesero</strong>')
        expect(correo.texto).toContain('como Mesero')
        expect(correo.html).toContain('Crear mi contraseña')
        expect(correo.html).toContain('vence en 24 horas')
        expect(correo.texto).toContain(ENLACE)
        // Sin rol (un cliente creado por el admin) el título es neutro, no «Bienvenido al equipo»
        const cliente = correoCreacion({ nombre: 'Carlos', enlace: ENLACE })
        expect(cliente.texto).not.toMatch(/como\s*\./)
        expect(cliente.html).not.toContain('Bienvenido al equipo')
        expect(correo.html).toContain('Bienvenido al equipo')
    })

    it('reserva: datos de la reserva, estado pendiente y botón a la cuenta (o al menú si la registró el personal)', () => {
        const correo = correoReserva({ ...RESERVA, enlace: 'http://localhost:5173/cuenta', conCuenta: true })
        comunes(correo)
        expect(correo.asunto).toBe('Recibimos tu solicitud de reserva en Brunch Café')
        expect(correo.html).toContain('Hola, Ana Pérez')
        expect(correo.texto).toMatch(/3 personas/)
        expect(correo.texto).toMatch(/9:00 a\.\s?m\./)
        expect(correo.texto).toMatch(/pendiente de confirmación/i)
        expect(correo.html).toContain('Mesa junto a la ventana')
        expect(correo.html).toContain('Ver mis reservas')
        expect(correo.html).toMatch(/Si no hiciste esta reserva, ignora este correo/)
        const sinCuenta = correoReserva({ ...RESERVA, enlace: 'http://localhost:5173/menu', conCuenta: false })
        expect(sinCuenta.html).toContain('Ver el menú')
    })

    it('escapa los caracteres especiales en el HTML (nombre, rol, observaciones) y deja el texto plano tal cual', () => {
        const nombre = '<img src=x onerror=alert(1)> Ana & "Leo" \'O\''
        const correo = correoCreacion({ nombre, rol: 'Caja & <b>barra</b>', enlace: `${ENLACE}"><script>` })
        expect(correo.html).not.toContain('<img src=x')
        expect(correo.html).not.toContain('<b>barra</b>')
        expect(correo.html).not.toContain('"><script>')
        expect(correo.html).toContain('&lt;img src=x onerror=alert(1)&gt; Ana &amp; &quot;Leo&quot; &#39;O&#39;')
        expect(correo.html).toContain('Caja &amp; &lt;b&gt;barra&lt;/b&gt;')
        expect(correo.texto).toContain(nombre)
        const reserva = correoReserva({ ...RESERVA, observaciones: '<a href="http://malo">clic</a>', enlace: 'http://localhost:5173/cuenta', conCuenta: true })
        expect(reserva.html).not.toContain('<a href="http://malo">')
        expect(reserva.html).toContain('&lt;a href=&quot;http://malo&quot;&gt;clic&lt;/a&gt;')
    })
})

describe('Transporte SMTP (3.7.4)', () => {
    const original = { ...config }
    afterEach(() => {
        Object.assign(config, original)
        vi.clearAllMocks()
    })
    const configurar = (puerto) => Object.assign(config, { SMTP_HOST: 'smtp.example.com', SMTP_PORT: puerto, SMTP_USER: 'u', SMTP_PASSWORD: 'p', SMTP_FROM: 'Brunch Café <u@example.com>' })

    it('puerto 587: STARTTLS obligatorio (requireTLS) y sin TLS implícito; 465: TLS implícito', async () => {
        smtp.createTransport.mockReturnValue({ sendMail: smtp.sendMail })
        configurar(587)
        await enviarCorreo({ para: 'a@example.com', asunto: 'Hola', texto: 'Hola' })
        expect(smtp.createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ port: 587, secure: false, requireTLS: true }))
        configurar(465)
        await enviarCorreo({ para: 'a@example.com', asunto: 'Hola', texto: 'Hola' })
        expect(smtp.createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ port: 465, secure: true, requireTLS: false }))
    })

    it('envía el HTML, el texto plano y el logo adjunto', async () => {
        smtp.createTransport.mockReturnValue({ sendMail: smtp.sendMail })
        configurar(587)
        const correo = correoRecuperacion({ nombre: 'Ana', enlace: ENLACE })
        await enviarCorreo({ para: 'a@example.com', ...correo })
        expect(smtp.sendMail).toHaveBeenCalledWith({
            from: 'Brunch Café <u@example.com>', to: 'a@example.com', subject: correo.asunto, text: correo.texto, html: correo.html,
            attachments: [expect.objectContaining({ cid: LOGO_CID })],
        })
    })
})
