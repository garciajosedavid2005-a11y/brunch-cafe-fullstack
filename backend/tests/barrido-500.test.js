// 3.5 · Barrido: ninguna ruta de la API responde 500 ante entradas inválidas (ids mal formados,
// cuerpo ausente, arreglos u objetos donde van textos, consultas repetidas). Deben ser 400/404/409…
// con el formato estándar { error: { code, message } }.
import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { api } from './helpers/app.js'
import { crearConSesion } from './helpers/usuarios.js'
import { categoriaDePrueba, crearPedido, crearReserva } from './helpers/datos.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import { abrirCuenta, agregarItem, enviarRonda, solicitarCuenta } from '../src/modulos/salon/cuentas.service.js'

const RUTAS = [
    // Caja
    'GET /api/v1/staff/caja/cuentas', 'POST /api/v1/staff/caja/cuentas/:id/cobrar',
    'GET /api/v1/staff/caja/comprobantes', 'GET /api/v1/staff/caja/comprobantes/:id',
    // Agotados
    'GET /api/v1/staff/agotados', 'POST /api/v1/staff/agotados/productos/:id',
    'POST /api/v1/staff/agotados/grupos/:id/opciones/:id',
    // Cocina
    'POST /api/v1/staff/items/:id/estado', 'POST /api/v1/staff/cocina/rondas/:id/todo-listo',
    'GET /api/v1/staff/cocina/estaciones', 'GET /api/v1/staff/cocina/cola',
    'POST /api/v1/staff/cocina/pedidos/:id/estacion',
    // Salón
    'GET /api/v1/staff/salon/mesas', 'GET /api/v1/staff/salon/catalogo', 'GET /api/v1/staff/salon/meseros',
    'GET /api/v1/staff/salon/cuentas/:id', 'POST /api/v1/staff/salon/mesas/unir',
    'POST /api/v1/staff/salon/mesas/:id/abrir', 'POST /api/v1/staff/salon/mesas/:id/mover',
    'POST /api/v1/staff/salon/mesas/:id/separar', 'POST /api/v1/staff/salon/mesas/:id/estado',
    'POST /api/v1/staff/salon/cuentas/:id/items', 'PATCH /api/v1/staff/salon/cuentas/:id/items/:id',
    'DELETE /api/v1/staff/salon/cuentas/:id/items/:id', 'POST /api/v1/staff/salon/cuentas/:id/items/:id/anular',
    'POST /api/v1/staff/salon/cuentas/:id/rondas/:n/enviar', 'POST /api/v1/staff/salon/cuentas/:id/solicitar',
    'POST /api/v1/staff/salon/cuentas/:id/cancelar', 'POST /api/v1/staff/salon/cuentas/:id/transferir',
    'POST /api/v1/staff/salon/cuentas/:id/cerrar-sin-cobro', 'GET /api/v1/staff/cuentas-abiertas',
    // Pedidos y reservas del personal
    'GET /api/v1/staff/pedidos', 'GET /api/v1/staff/pedidos/:id', 'PATCH /api/v1/staff/pedidos/:id/estado',
    'PATCH /api/v1/staff/pedidos/:id/cancelar',
    'GET /api/v1/staff/reservas', 'POST /api/v1/staff/reservas', 'PATCH /api/v1/staff/reservas/:id/estado',
    // Admin
    'GET /api/v1/admin/categorias', 'POST /api/v1/admin/categorias', 'PUT /api/v1/admin/categorias/:id', 'DELETE /api/v1/admin/categorias/:id',
    'GET /api/v1/admin/productos', 'POST /api/v1/admin/productos', 'PUT /api/v1/admin/productos/:id', 'DELETE /api/v1/admin/productos/:id',
    'GET /api/v1/admin/estados', 'POST /api/v1/admin/estados', 'PUT /api/v1/admin/estados/:id', 'DELETE /api/v1/admin/estados/:id',
    'GET /api/v1/admin/roles', 'POST /api/v1/admin/roles', 'PUT /api/v1/admin/roles/:id', 'DELETE /api/v1/admin/roles/:id',
    'GET /api/v1/admin/permisos',
    'GET /api/v1/admin/metodos-pago', 'POST /api/v1/admin/metodos-pago', 'PUT /api/v1/admin/metodos-pago/:id', 'DELETE /api/v1/admin/metodos-pago/:id',
    'GET /api/v1/admin/usuarios', 'POST /api/v1/admin/usuarios', 'PATCH /api/v1/admin/usuarios/:id', 'POST /api/v1/admin/usuarios/:id/reenviar-enlace',
    'GET /api/v1/admin/zonas', 'POST /api/v1/admin/zonas', 'PUT /api/v1/admin/zonas/:id', 'DELETE /api/v1/admin/zonas/:id',
    'GET /api/v1/admin/mesas', 'POST /api/v1/admin/mesas', 'PUT /api/v1/admin/mesas/:id', 'DELETE /api/v1/admin/mesas/:id',
    'GET /api/v1/admin/estaciones', 'POST /api/v1/admin/estaciones', 'PUT /api/v1/admin/estaciones/:id', 'DELETE /api/v1/admin/estaciones/:id',
    'GET /api/v1/admin/grupos-modificadores', 'POST /api/v1/admin/grupos-modificadores', 'PUT /api/v1/admin/grupos-modificadores/:id', 'DELETE /api/v1/admin/grupos-modificadores/:id',
    'GET /api/v1/admin/comentarios', 'PATCH /api/v1/admin/comentarios/:id/visibilidad', 'DELETE /api/v1/admin/comentarios/:id',
    'GET /api/v1/admin/horarios', 'PUT /api/v1/admin/horarios',
    // Públicas y de cliente
    // Autenticación (sin sesión: las más expuestas)
    'POST /api/v1/auth/registro', 'POST /api/v1/auth/login', 'POST /api/v1/auth/recuperar-contrasena',
    'POST /api/v1/auth/restablecer-contrasena', 'POST /api/v1/auth/logout', 'GET /api/v1/auth/me',
    'GET /api/v1/catalogo', 'GET /api/v1/horarios', 'GET /api/v1/comentarios', 'GET /api/v1/comentarios/calificaciones',
    'GET /api/productos/menu/imagenes/:id',
    'GET /api/v1/cliente/perfil', 'PATCH /api/v1/cliente/perfil', 'PUT /api/v1/cliente/perfil/contrasena',
    'GET /api/v1/cliente/reservas', 'POST /api/v1/cliente/reservas', 'PATCH /api/v1/cliente/reservas/:id', 'PATCH /api/v1/cliente/reservas/:id/cancelar',
    'GET /api/v1/cliente/pedidos', 'POST /api/v1/cliente/pedidos', 'GET /api/v1/cliente/pedidos/:id', 'PATCH /api/v1/cliente/pedidos/:id/cancelar',
    'GET /api/v1/cliente/metodos-pago', 'GET /api/v1/cliente/comentarios', 'POST /api/v1/cliente/comentarios', 'PATCH /api/v1/cliente/comentarios/:id',
]

const OID = () => String(new mongoose.Types.ObjectId())
// Valores raros para cualquier campo del cuerpo
const RARO = { $gt: '' }
const CUERPOS = [
    undefined,
    [],
    {},
    { nombre: RARO, items: 'x', pagos: 'x', propina: 'x', estado: RARO, versionEsperada: 'x', mesas: RARO, cantidad: RARO, fecha: RARO, hora: RARO, correo: RARO, contraseña: RARO, rol: 'abc', categoria: 'abc', zona: 'abc', estacion: 'abc', mesaId: 'abc', meseroId: 'abc', destinoId: 'abc', opciones: 'x', modificadores: 'x', productoId: 'abc', precio: 'x', motivo: RARO, permisos: 'x', disponible: 'x', visible: 'x', dias: 'x' },
    { items: [{ productoId: 'abc', cantidad: 'x', modificadores: [{ grupoId: 'abc', opcionId: 'abc' }] }], mesas: ['abc'], pagos: [{ metodo: RARO }], permisos: [RARO], opciones: [RARO], dias: [RARO] },
    // Bien formados pero inexistentes o fuera de rango
    { items: [{ productoId: OID(), cantidad: 1e20, modificadores: [{ grupoId: OID(), opcionId: OID() }], nota: 'x'.repeat(5000) }], mesas: [OID(), OID()], mesaId: OID(), destinoId: OID(), meseroId: OID(), rol: OID(), categoria: OID(), zona: OID(), estacion: OID(), productoId: OID(), propina: 1.5, versionEsperada: 1e20, pagos: [{ metodo: 'efectivo', monto: 1e20, recibido: -1 }], fecha: '2026-02-30', hora: '25:99', comensales: 1e9, numero: -3, capacidad: 1e20, precio: 1e20, nombre: 'x'.repeat(5000), correo: 'a@b.c', estado: 'inexistente', motivo: 'x'.repeat(5000), dias: [{ dia: 9, abre: '99:99', cierra: 'x' }] },
]
// Parámetros que las rutas leen de verdad (zona, tipo, limite, incluir, estado con coma) y otros de más
const CONSULTA3 = '?zona=abc&zona[$gt]=&tipo[$gt]=&limite=-1&incluir=x&estado=a,b&estacion[$ne]=x'
const CONSULTA2 = '?desde=2026-02-30&hasta=9999-99-99&fecha=2026-13-01&limit=1e20&pagina=1e20&estado=inexistente&estacion=' + 'f'.repeat(24)
const CONSULTA = '?estado=a&estado=b&desde=xx&hasta=yy&limit=-1&pagina=abc&fecha=zz&estacion=abc&q[$gt]=&canales=x'
// 'abcdefghijkl': 12 caracteres, isValidObjectId lo acepta y llega a la consulta
const IDS = ['abc', 'abcdefghijkl', '%E0%A4%A', String(new mongoose.Types.ObjectId())]

const SIN_SESION = ['/api/v1/auth/']
const DE_CLIENTE = ['/api/v1/cliente', '/api/v1/comentarios', '/api/v1/catalogo', '/api/v1/horarios', '/api/productos']

/**
 * Envía cada cuerpo (o consulta) y devuelve { fallos, estados }: fallo = 500 o error sin el formato
 * estándar. `estados` cuenta las respuestas por código, para comprobar que se llegó a la lógica.
 */
const barrer = async (hacer, linea, variantes) => {
    const fallos = []
    const estados = []
    for (const [cuerpo, consulta] of variantes) {
        let peticion = hacer(consulta).set('Idempotency-Key', OID())
        if (cuerpo !== undefined) peticion = peticion.send(cuerpo)
        const res = await peticion
        estados.push(res.status)
        const formatoMalo = res.status >= 400 && !(res.body?.error?.code && res.body?.error?.message)
        if (res.status >= 500 || formatoMalo) {
            fallos.push(`${linea}${consulta} ${JSON.stringify(cuerpo)?.slice(0, 80) ?? '(sin cuerpo)'} → ${res.status} ${JSON.stringify(res.body).slice(0, 160)}`)
        }
    }
    return { fallos, estados }
}
const variantesDe = (metodo) => (metodo === 'GET'
    ? [[undefined, CONSULTA], [undefined, CONSULTA2], [undefined, CONSULTA3]]
    : CUERPOS.map((c) => [c, '']))

describe('Barrido de entradas inválidas (3.5)', () => {
    it('ninguna ruta responde 500 y todos los errores usan el formato estándar', { timeout: 180_000 }, async () => {
        const { sesion: admin } = await crearConSesion('admin')
        const { sesion: cliente } = await crearConSesion('cliente')
        const fallos = []
        const conSesion = []
        for (const linea of RUTAS) {
            const [metodo, patron] = linea.split(' ')
            const anonima = SIN_SESION.some((p) => patron.startsWith(p))
            const sesion = anonima ? null : DE_CLIENTE.some((p) => patron.startsWith(p)) ? cliente : admin
            for (const id of IDS) {
                const ruta = patron.replace(/:id|:n/g, id)
                const hacer = (consulta) => (sesion ?? api())[metodo.toLowerCase()](ruta + consulta)
                const r = await barrer(hacer, `${metodo} ${ruta}`, variantesDe(metodo))
                fallos.push(...r.fallos)
                if (!anonima) conSesion.push(...r.estados)
            }
        }
        expect(fallos).toEqual([])
        // Las peticiones llegan a la lógica: ninguna se corta por sesión o permiso…
        expect(conSesion.filter((s) => s === 401 || s === 403)).toEqual([])
        // …y la mayoría las rechaza la validación o la búsqueda (400/404), no otra cosa
        expect(conSesion.filter((s) => s === 400 || s === 404).length).toBeGreaterThan(conSesion.length / 2)
    })
})

// Con entidades reales: así el cuerpo inválido llega a la lógica (no se corta en el 404)
describe('Barrido sobre datos reales (3.5)', () => {
    it('cuerpos inválidos contra mesas, cuentas, ítems, productos, pedidos y reservas existentes no dan 500', { timeout: 180_000 }, async () => {
        const { sesion: admin, usuario } = await crearConSesion('admin')
        const { sesion: cliente } = await crearConSesion('cliente')
        const sesionAdmin = { id: String(usuario._id), rol: 'admin', permisos: ['*'] }
        const { usuario: mesero } = await crearConSesion('mesero')
        const categoria = await categoriaDePrueba('Desayunos')
        const producto = await Producto.create({ codigo: 1, nombre: 'Huevos', precio: 15000, categoria: categoria._id })
        const zona = await Zona.create({ nombre: 'Interior' })
        const [mesa, libre, otra] = await Mesa.create([1, 2, 3].map((numero) => ({ numero, zona: zona._id, capacidad: 4 })))
        const conRonda = async (m) => {
            const cuenta = await abrirCuenta({ mesaId: String(m._id), comensales: 2, meseroId: String(mesero._id) }, sesionAdmin)
            await agregarItem(cuenta.id, { productoId: String(producto._id), cantidad: 1 }, sesionAdmin)
            await enviarRonda(cuenta.id, { numeroRonda: 1, versionEsperada: (await Cuenta.findById(cuenta.id).lean()).version }, sesionAdmin)
            return cuenta.id
        }
        const cuenta = await conRonda(mesa)
        // El cobro sobre una cuenta pedida: así los cuerpos válidos para Zod llegan a calcularPagos
        const pedida = await conRonda(otra)
        await solicitarCuenta(pedida, { versionEsperada: (await Cuenta.findById(pedida).lean()).version }, sesionAdmin)
        const comanda = await Comanda.findOne({ cuenta }).lean()
        const item = String(comanda.items[0]._id)
        const pedido = await crearPedido(cliente)
        const reserva = await crearReserva(cliente)
        const ids = {
            mesa: String(mesa._id), libre: String(libre._id), item, comanda: String(comanda._id),
            producto: String(producto._id), categoria: String(categoria._id), zona: String(zona._id),
        }
        const rutas = [
            [admin, `POST /api/v1/staff/caja/cuentas/${pedida}/cobrar`],
            [admin, `POST /api/v1/staff/agotados/productos/${ids.producto}`],
            [admin, `POST /api/v1/staff/items/${ids.item}/estado`], [admin, `POST /api/v1/staff/cocina/rondas/${ids.comanda}/todo-listo`],
            [admin, 'POST /api/v1/staff/salon/mesas/unir'], [admin, `POST /api/v1/staff/salon/mesas/${ids.libre}/abrir`],
            [admin, `POST /api/v1/staff/salon/mesas/${ids.mesa}/mover`], [admin, `POST /api/v1/staff/salon/mesas/${ids.mesa}/separar`],
            [admin, `POST /api/v1/staff/salon/mesas/${ids.libre}/estado`], [admin, `POST /api/v1/staff/salon/cuentas/${cuenta}/items`],
            [admin, `PATCH /api/v1/staff/salon/cuentas/${cuenta}/items/${ids.item}`], [admin, `DELETE /api/v1/staff/salon/cuentas/${cuenta}/items/${ids.item}`],
            [admin, `POST /api/v1/staff/salon/cuentas/${cuenta}/items/${ids.item}/anular`], [admin, `POST /api/v1/staff/salon/cuentas/${cuenta}/rondas/x/enviar`],
            [admin, `POST /api/v1/staff/salon/cuentas/${cuenta}/solicitar`], [admin, `POST /api/v1/staff/salon/cuentas/${cuenta}/transferir`],
            [admin, `POST /api/v1/staff/salon/cuentas/${cuenta}/cancelar`], [admin, `POST /api/v1/staff/salon/cuentas/${cuenta}/cerrar-sin-cobro`],
            [admin, `PATCH /api/v1/staff/pedidos/${pedido}/estado`], [admin, `PATCH /api/v1/staff/pedidos/${pedido}/cancelar`],
            [admin, `POST /api/v1/staff/cocina/pedidos/${pedido}/estacion`], [admin, `PATCH /api/v1/staff/reservas/${reserva}/estado`],
            [cliente, `PATCH /api/v1/cliente/reservas/${reserva}`], [cliente, `PATCH /api/v1/cliente/pedidos/${pedido}/cancelar`],
            [admin, `PUT /api/v1/admin/productos/${ids.producto}`], [admin, `PUT /api/v1/admin/categorias/${ids.categoria}`],
            [admin, `PUT /api/v1/admin/zonas/${ids.zona}`], [admin, `PUT /api/v1/admin/mesas/${ids.mesa}`],
        ]
        const fallos = []
        for (const [sesion, linea] of rutas) {
            const [metodo, ruta] = linea.split(' ')
            fallos.push(...(await barrer((consulta) => sesion[metodo.toLowerCase()](ruta + consulta), linea, variantesDe(metodo))).fallos)
        }
        expect(fallos).toEqual([])
    })
})

describe('Bordes fuera del cuerpo (3.5)', () => {
    it('canales en vivo inválidos, Idempotency-Key enorme y charset raro: 4xx con el formato estándar, nunca 500', async () => {
        const { sesion: admin } = await crearConSesion('admin')
        const casos = [
            await admin.get('/api/v1/staff/eventos?canales=nada&canales=otro'),
            await admin.get('/api/v1/staff/eventos?canales[$gt]='),
            await admin.get('/api/v1/staff/eventos'),
            await admin.post(`/api/v1/staff/caja/cuentas/${OID()}/cobrar`).set('Idempotency-Key', 'x'.repeat(10_000)).send({ propina: 0, pagos: [{ metodo: 'tarjeta', monto: 1 }] }),
            // Express 5 no rechaza el charset: llega sin cuerpo y responde la validación
            await admin.post('/api/v1/staff/salon/mesas/unir').set('Content-Type', 'application/json; charset=utf-7').send('{}'),
        ]
        for (const r of casos) {
            expect(r.status, JSON.stringify(r.body)).toBeGreaterThanOrEqual(400)
            expect(r.status, JSON.stringify(r.body)).toBeLessThan(500)
            expect(r.body.error.code).toBeTruthy()
        }
    })
})
