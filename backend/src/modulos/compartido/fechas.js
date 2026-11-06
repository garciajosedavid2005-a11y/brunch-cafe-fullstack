// Utilidad única de fechas (0.10).
// - En la BD se guardan instantes en UTC (Date).
// - El calendario del negocio (qué día es, horarios, "hoy") es el de America/Bogota.
// - Se usa Intl con la zona, no un desfase fijo: si la zona cambiara de reglas, sigue siendo correcto.

export const ZONA_HORARIA = 'America/Bogota'

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/
const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/

export const esFechaValida = (texto) => {
    const m = FECHA.exec(texto ?? '')
    if (!m) return false
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

export const esHoraValida = (texto) => HORA.test(texto ?? '')

const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
})

const partesLocales = (instante) =>
    Object.fromEntries(partes.formatToParts(instante).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]))

/** Minutos que la zona está desplazada respecto a UTC en ese instante (Bogotá: -300). */
const desfaseMinutos = (instante) => {
    const p = partesLocales(instante)
    const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
    return Math.round((comoUtc - instante.getTime()) / 60000)
}

/** "2026-11-05" + "08:00" en Bogotá → Date (instante UTC). */
export const instanteLocal = (fecha, hora) => {
    if (!esFechaValida(fecha) || !esHoraValida(hora)) throw new Error(`Fecha u hora inválida: ${fecha} ${hora}`)
    const [a, m, d] = fecha.split('-').map(Number)
    const [h, min] = hora.split(':').map(Number)
    const comoUtc = Date.UTC(a, m - 1, d, h, min)
    // Primera aproximación con el desfase de ese momento y corrección por si cruza un cambio de reglas
    const aprox = new Date(comoUtc - desfaseMinutos(new Date(comoUtc)) * 60000)
    return new Date(comoUtc - desfaseMinutos(aprox) * 60000)
}

/** Instante → "YYYY-MM-DD" del calendario de Bogotá. */
export const fechaLocal = (instante = new Date()) => {
    const p = partesLocales(instante)
    return `${p.year}-${p.month}-${p.day}`
}

/** Instante → "HH:mm" en Bogotá. */
export const horaLocal = (instante = new Date()) => {
    const p = partesLocales(instante)
    return `${p.hour}:${p.minute}`
}

/** Fecha de calendario "YYYY-MM-DD" guardada como Date (las reservas usan mediodía UTC). */
export const fechaCalendario = (valor) => new Date(valor).toISOString().slice(0, 10)

/** Instante de inicio de una reserva a partir de su fecha de calendario y su hora. */
export const inicioReserva = (fecha, hora) => instanteLocal(fechaCalendario(fecha), hora)

/** Día de la semana (0 = domingo) de una fecha de calendario "YYYY-MM-DD". */
export const diaSemana = (fecha) => new Date(`${fecha}T00:00:00Z`).getUTCDay()
