// Idempotency-Key (0.9): reintentar un POST con la misma clave no repite la operación.
// - Sin cabecera: la petición sigue igual que antes (la clave es opcional).
// - Primera vez: se reserva la clave (índice único usuario+clave) y se guarda la respuesta 2xx.
// - Misma clave y mismos datos: se devuelve la respuesta guardada con `Idempotent-Replayed: true`.
// - Misma clave con otros datos: 422. Si la primera aún se procesa: 409.
// - Si la petición falla (4xx/5xx) la clave se libera para poder corregir y reintentar.
// - 1.5 · Si el proceso cae a mitad (la clave queda «en_proceso»), tras EN_CURSO_MAXIMO_MS un
//   reintento con los mismos datos la retoma (escritura condicional: solo uno la consigue). El plazo
//   supera lo que puede tardar conTransaccion (withTransaction reintenta hasta 120 s y cada intento
//   dura como mucho 60 s). Además, cada petición solo guarda o libera su propia reserva (createdAt):
//   si otra la retomó, la original ya no la toca.
// Requiere validateToken antes (las claves son por usuario).
import { createHash } from 'node:crypto'
import SolicitudIdempotente from './solicitudIdempotente.model.js'
import { AppError } from './errors.js'

const FORMATO_CLAVE = /^[A-Za-z0-9_-]{8,100}$/
export const EN_CURSO_MAXIMO_MS = 5 * 60_000

export const idempotencia = async (req, res, next) => {
    const clave = req.get('Idempotency-Key')
    if (clave === undefined) return next()
    if (!FORMATO_CLAVE.test(clave)) {
        throw new AppError(400, 'IDEMPOTENCY_KEY_INVALID', 'La cabecera Idempotency-Key debe tener de 8 a 100 letras, números, guiones o guiones bajos.')
    }
    const usuario = req.usuario.id
    const ruta = `${req.method} ${req.baseUrl}${req.path}`
    const huella = createHash('sha256').update(`${ruta}\n${JSON.stringify(req.body ?? {})}`).digest('hex')

    await SolicitudIdempotente.init() // el índice único debe existir antes del primer insert
    // createdAt identifica esta reserva: si otro reintento la retoma, esta petición ya no la toca
    const reservadaEn = new Date()
    try {
        await SolicitudIdempotente.create({ usuario, clave, ruta, huella, createdAt: reservadaEn })
    } catch (error) {
        if (error?.code !== 11000) throw error
        const previa = await SolicitudIdempotente.findOne({ usuario, clave }).lean()
        if (previa && previa.huella !== huella) {
            throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'Esta Idempotency-Key ya se usó con otros datos. Genera una nueva para otra solicitud.')
        }
        const vencida = previa && previa.estado !== 'completada' && previa.createdAt < new Date(Date.now() - EN_CURSO_MAXIMO_MS)
        const retomada = vencida && await SolicitudIdempotente.findOneAndUpdate(
            { _id: previa._id, estado: 'en_proceso', createdAt: previa.createdAt },
            { $set: { createdAt: reservadaEn } },
        )
        if (retomada) return continuar(req, res, next, { usuario, clave, createdAt: reservadaEn })
        if (!previa || previa.estado !== 'completada') {
            throw new AppError(409, 'IDEMPOTENCY_IN_PROGRESS', 'Tu solicitud anterior todavía se está procesando. Espera un momento antes de reintentar.')
        }
        res.set('Idempotent-Replayed', 'true')
        return res.status(previa.status).json(previa.cuerpo)
    }
    return continuar(req, res, next, { usuario, clave, createdAt: reservadaEn })
}

const continuar = (req, res, next, propia) => {
    // Se guarda (o libera) la clave antes de responder: un reintento inmediato ya ve el resultado
    const responder = res.json.bind(res)
    res.json = (cuerpo) => {
        const exito = res.statusCode >= 200 && res.statusCode < 300
        const guardar = exito
            ? SolicitudIdempotente.updateOne(
                { ...propia, estado: 'en_proceso' },
                { $set: { estado: 'completada', status: res.statusCode, cuerpo: JSON.parse(JSON.stringify(cuerpo)) } },
            )
            : SolicitudIdempotente.deleteOne({ ...propia, estado: 'en_proceso' })
        guardar
            .catch((err) => req.log?.error({ err }, 'No se pudo actualizar la Idempotency-Key'))
            .finally(() => responder(cuerpo))
        return res
    }
    return next()
}
