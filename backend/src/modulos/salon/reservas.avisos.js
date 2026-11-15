// 4.5 (F4-7) · Avisos en vivo de reservas y lista de espera por el bus (canal «reservas», que escucha quien tiene
// reserva:ver; los de reservas también van a «plano», que muestra las reservadas próximas). Solo tipo e id: cada
// pantalla vuelve a leer con su permiso. Llamar DESPUÉS de confirmar la transacción.
import { publicar } from '../tiempoReal/bus.js'

/** `reserva_editada` (un cliente editó su reserva confirmada) o `reserva_cambio` (cualquier otro cambio). */
export const avisarReserva = (reservaId, tipo = 'reserva_cambio') =>
    publicar(['reservas', 'plano'], { tipo, ids: { reserva: String(reservaId) } })

export const avisarEspera = (esperaId) => publicar(['reservas'], { tipo: 'espera_cambio', ids: { espera: String(esperaId) } })
