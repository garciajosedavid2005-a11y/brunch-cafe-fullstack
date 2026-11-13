// 2.4 · Tiempo real con SSE (PLAN_FASE_2 §2.4): bus en memoria, eventos solo con ids y publicados
// DESPUÉS de confirmar la transacción, permiso por canal (mesero:<id> solo el propio usuario), latido,
// límite de conexiones por usuario y cierre del flujo si la sesión deja de valer.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import mongoose from 'mongoose'
import { app, api } from './helpers/app.js'
import { crearConSesion, CLAVE_PRUEBA } from './helpers/usuarios.js'
import { categoriaDePrueba, crearPedido } from './helpers/datos.js'
import Zona from '../src/modulos/salon/zona.model.js'
import Mesa from '../src/modulos/salon/mesa.model.js'
import Cuenta from '../src/modulos/salon/cuenta.model.js'
import Comanda from '../src/modulos/salon/comanda.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'
import Usuario from '../src/modulos/identidad/usuario.model.js'
import Rol from '../src/modulos/identidad/rol.model.js'
import { PERMISOS_SALON, PERMISOS_COCINA } from '../src/modulos/identidad/permisos.js'
import { abrirCuenta, agregarItem, enviarRonda } from '../src/modulos/salon/cuentas.service.js'
import { cambiarEstadoItem, todoListo, marcarPedidoEstacion } from '../src/modulos/cocina/cocina.service.js'
import { publicar, suscribir, totalSuscriptores, alRevocarSesion, totalRevocaciones } from '../src/modulos/tiempoReal/bus.js'
import { validarCanales, configurarLatido, configurarComprobacion, MAX_CONEXIONES_POR_USUARIO } from '../src/modulos/tiempoReal/eventos.routes.js'
import { limpiarCacheSesiones } from '../src/modulos/identidad/sesiones.js'

const { ObjectId } = mongoose.Types
const error = (fn) => {
    try {
        fn()
    } catch (e) {
        return e
    }
    throw new Error('Se esperaba un error')
}

describe('Bus en memoria (2.4)', () => {
    it('entrega cada aviso a quien escucha ese canal; «estaciones» llega a cualquier estación; la baja corta', () => {
        const kds = []
        const plano = []
        const bajaKds = suscribir(['estacion:cocina'], (a) => kds.push(a))
        const bajaPlano = suscribir(['plano'], (a) => plano.push(a))
        publicar(['estacion:cocina', 'plano', 'estacion:cocina'], { tipo: 'prueba', ids: { x: '1' } })
        publicar(['estaciones'], { tipo: 'pedido_estado', ids: { pedidoId: '2' } })
        publicar(['estacion:barra'], { tipo: 'otra' })
        expect(kds.map((a) => [a.canal, a.tipo])).toEqual([['estacion:cocina', 'prueba'], ['estaciones', 'pedido_estado']])
        expect(plano.map((a) => a.tipo)).toEqual(['prueba'])
        expect(Object.keys(kds[0]).sort()).toEqual(['canal', 'en', 'ids', 'tipo']) // solo ids, nunca datos
        bajaKds()
        bajaPlano()
        publicar(['plano'], { tipo: 'tarde' })
        expect(plano).toHaveLength(1)
    })

    it('un suscriptor que falla no corta el reparto a los demás', () => {
        const recibidos = []
        const b1 = suscribir(['plano'], () => { throw new Error('roto') })
        const b2 = suscribir(['plano'], (a) => recibidos.push(a))
        publicar(['plano'], { tipo: 'prueba' })
        expect(recibidos).toHaveLength(1)
        b1()
        b2()
    })
})

describe('Se publica solo después de confirmar (2.4)', () => {
    let mesero
    let cocinero
    let itemId
    let cuentaId
    beforeEach(async () => {
        await Promise.all([Cuenta.createIndexes(), Comanda.createIndexes(), Mesa.createIndexes()])
        mesero = { id: String(new ObjectId()), rol: 'mesero', permisos: [...PERMISOS_SALON.mesero, ...PERMISOS_COCINA.mesero] }
        cocinero = { id: String(new ObjectId()), rol: 'cocina', permisos: PERMISOS_COCINA.cocina }
        const zona = await Zona.create({ nombre: 'Interior' })
        const mesa = await Mesa.create({ numero: 1, zona: zona._id, capacidad: 4 })
        const platos = await categoriaDePrueba('Desayunos')
        const huevos = await Producto.create({ codigo: 8801, nombre: 'Huevos', precio: 15000, categoria: platos._id })
        const abierta = await abrirCuenta({ mesaId: String(mesa._id), comensales: 2 }, mesero)
        cuentaId = abierta.id
        await agregarItem(cuentaId, { productoId: String(huevos._id), cantidad: 1 }, mesero)
        const { version } = await Cuenta.findById(cuentaId).lean()
        await enviarRonda(cuentaId, { numeroRonda: 1, versionEsperada: version }, mesero)
        itemId = String((await Comanda.findOne({ cuenta: cuentaId }).lean()).items[0]._id)
    })

    it('marcar un ítem avisa a su estación, a su cuenta y al plano; «listo», además, al mesero de la cuenta', async () => {
        const avisos = []
        const baja = suscribir(['estacion:cocina', `cuenta:${cuentaId}`, 'plano', `mesero:${mesero.id}`], (a) => avisos.push(a))
        await cambiarEstadoItem(itemId, { a: 'en_preparacion', de: 'enviado' }, cocinero)
        expect(avisos.map((a) => a.canal).sort()).toEqual([`cuenta:${cuentaId}`, 'estacion:cocina', 'plano'].sort())
        expect(avisos[0].ids).toEqual({ cuentaId, comandaId: expect.any(String), itemId })
        avisos.length = 0
        await cambiarEstadoItem(itemId, { a: 'listo', de: 'en_preparacion' }, cocinero)
        expect(avisos.map((a) => a.canal)).toContain(`mesero:${mesero.id}`)
        baja()
    })

    it('si la operación falla (409), no se avisa a nadie', async () => {
        const avisos = []
        const baja = suscribir(['estacion:cocina', 'plano'], (a) => avisos.push(a))
        await expect(cambiarEstadoItem(itemId, { a: 'listo', de: 'en_preparacion' }, cocinero)).rejects.toMatchObject({ status: 409 })
        expect(avisos).toEqual([])
        baja()
    })

    it('«Todo listo» avisa a la estación, la cuenta, el plano y al mesero; sin nada pendiente (409), a nadie', async () => {
        const comandaId = String((await Comanda.findOne({ cuenta: cuentaId }).lean())._id)
        const avisos = []
        const baja = suscribir(['estacion:cocina', `cuenta:${cuentaId}`, 'plano', `mesero:${mesero.id}`], (a) => avisos.push(a))
        await todoListo(comandaId, { estacion: 'cocina' }, cocinero)
        expect(avisos.map((a) => a.canal).sort()).toEqual([`cuenta:${cuentaId}`, 'estacion:cocina', `mesero:${mesero.id}`, 'plano'].sort())
        expect(new Set(avisos.map((a) => a.tipo))).toEqual(new Set(['ronda_lista']))
        avisos.length = 0
        await expect(todoListo(comandaId, { estacion: 'cocina' }, cocinero)).rejects.toMatchObject({ status: 409 })
        expect(avisos).toEqual([])
        baja()
    })

    it('el domicilio por estación y los cambios de estado del pedido avisan a las estaciones; si fallan, no', async () => {
        const { sesion: cliente } = await crearConSesion('cliente')
        const { sesion: admin } = await crearConSesion('admin')
        const huevos = await Producto.findOne({ codigo: 8801 }).lean()
        const pedidoId = String(await crearPedido(cliente, { items: [{ productoRef: String(huevos._id), cantidad: 1 }] }))
        const avisos = []
        const baja = suscribir(['estacion:cocina'], (a) => avisos.push(a))
        // Un cambio de estado que falla (transición no válida) no avisa
        const malo = await admin.patch(`/api/v1/staff/pedidos/${pedidoId}/estado`).send({ codigo: 'entregado' })
        expect(malo.status).toBeGreaterThanOrEqual(400)
        expect(avisos).toEqual([])
        const res = await admin.patch(`/api/v1/staff/pedidos/${pedidoId}/estado`).send({ codigo: 'confirmado' })
        expect(res.status, JSON.stringify(res.body)).toBe(200)
        await new Promise((ok) => setImmediate(ok)) // el aviso sale en el «finish» de la respuesta
        expect(avisos.map((a) => [a.canal, a.tipo, a.ids])).toEqual([['estaciones', 'pedido_estado', { pedidoId }]])
        avisos.length = 0
        await marcarPedidoEstacion(pedidoId, { estacion: 'cocina', a: 'en_preparacion' }, cocinero)
        expect(avisos.map((a) => a.tipo)).toEqual(['pedido_estacion'])
        avisos.length = 0
        await expect(marcarPedidoEstacion(pedidoId, { estacion: 'barra', a: 'listo' }, cocinero)).rejects.toMatchObject({ status: 409, code: 'ESTACION_SIN_LINEAS' })
        expect(avisos).toEqual([])
        baja()
    })

    it('una operación del salón que falla por HTTP (409) no avisa', async () => {
        const { sesion: mesa } = await crearConSesion('mesero')
        const avisos = []
        const baja = suscribir(['plano', `cuenta:${cuentaId}`], (a) => avisos.push(a))
        const r = await mesa.post(`/api/v1/staff/salon/cuentas/${cuentaId}/solicitar`).send({ versionEsperada: 999 })
        expect(r.status).toBe(409)
        expect(avisos).toEqual([])
        baja()
    })

    it('las operaciones del salón por HTTP avisan al plano y a la cuenta', async () => {
        const { sesion: mesa } = await crearConSesion('mesero')
        const avisos = []
        const baja = suscribir(['plano', `cuenta:${cuentaId}`], (a) => avisos.push(a))
        const { version } = await Cuenta.findById(cuentaId).lean()
        const r = await mesa.post(`/api/v1/staff/salon/cuentas/${cuentaId}/solicitar`).send({ versionEsperada: version })
        expect(r.status, JSON.stringify(r.body)).toBe(200)
        expect(avisos.map((a) => a.canal).sort()).toEqual([`cuenta:${cuentaId}`, 'plano'])
        baja()
    })
})

describe('Permiso por canal (2.4)', () => {
    const sesion = (permisos, id = String(new ObjectId())) => ({ id, permisos })

    it('estación con kds:ver, cuenta con cuenta:ver, plano con mesa:ver y mesero solo el propio (y solo personal)', () => {
        const id = String(new ObjectId())
        expect(validarCanales('estacion:cocina,plano', sesion(['kds:ver', 'mesa:ver']))).toEqual(['estacion:cocina', 'plano'])
        expect(validarCanales(`mesero:${id}`, sesion(['item:servir'], id))).toEqual([`mesero:${id}`])
        expect(validarCanales(`cuenta:${id}`, sesion(['cuenta:ver']))).toEqual([`cuenta:${id}`])
        // Un cliente (sin permisos del salón) no escucha ni su propio canal de mesero
        expect(error(() => validarCanales(`mesero:${id}`, sesion([], id)))).toMatchObject({ status: 403 })
        expect(error(() => validarCanales(`mesero:${new ObjectId()}`, sesion(['*'])))).toMatchObject({ status: 403 })
        expect(error(() => validarCanales('estacion:cocina', sesion(['mesa:ver'])))).toMatchObject({ status: 403 })
        expect(error(() => validarCanales(`cuenta:${id}`, sesion(['kds:ver'])))).toMatchObject({ status: 403 })
        expect(error(() => validarCanales('plano', sesion(['kds:ver'])))).toMatchObject({ status: 403 })
    })

    it('canales mal formados, vacíos o demasiados → 400', () => {
        const todo = sesion(['*'])
        expect(error(() => validarCanales('', todo))).toMatchObject({ status: 400, code: 'CANALES_NO_VALIDOS' })
        expect(error(() => validarCanales('cuentas:x', todo))).toMatchObject({ status: 400 })
        expect(error(() => validarCanales('estacion:Cocina Grande', todo))).toMatchObject({ status: 400 })
        expect(error(() => validarCanales(Array.from({ length: 11 }, (_, i) => `estacion:e${i}x`).join(','), todo))).toMatchObject({ status: 400 })
    })
})

describe('Flujo SSE por HTTP (2.4)', () => {
    let servidor
    let puerto
    beforeEach(async () => {
        servidor = http.createServer(app)
        await new Promise((ok) => servidor.listen(0, ok))
        puerto = servidor.address().port
    })
    afterEach(async () => {
        configurarLatido()
        configurarComprobacion()
        servidor.closeAllConnections?.()
        await new Promise((ok) => servidor.close(ok))
    })

    const cookieDe = async (rol) => {
        const { usuario } = await crearConSesion(rol)
        const res = await api().post('/api/v1/auth/login').send({ correo: usuario.correo, contraseña: CLAVE_PRUEBA })
        return { usuario, cookie: res.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ') }
    }
    /** Abre el flujo y devuelve { estado, cabeceras, esperar(texto), cerrar }. */
    const abrir = (canales, cookie) => new Promise((ok, mal) => {
        const req = http.get({ port: puerto, path: `/api/v1/staff/eventos?canales=${canales}`, headers: { Cookie: cookie } }, (res) => {
            let texto = ''
            const esperas = []
            res.setEncoding('utf8')
            res.on('data', (d) => {
                texto += d
                for (const e of [...esperas]) if (texto.includes(e.buscado)) { esperas.splice(esperas.indexOf(e), 1); e.ok(texto) }
            })
            const fin = new Promise((alTerminar) => res.on('end', alTerminar))
            ok({
                estado: res.statusCode,
                cabeceras: res.headers,
                cuerpo: () => fin.then(() => JSON.parse(texto)),
                fin,
                esperar: (buscado, ms = 3000) => new Promise((ok2, mal2) => {
                    if (texto.includes(buscado)) return ok2(texto)
                    esperas.push({ buscado, ok: ok2 })
                    setTimeout(() => mal2(new Error(`No llegó «${buscado}»: ${texto}`)), ms)
                }),
                cerrar: () => req.destroy(),
            })
        })
        req.on('error', mal)
    })

    it('abre el flujo con cabeceras anti-buffer, recibe los avisos de su canal y al cerrarse se da de baja', async () => {
        const { cookie } = await cookieDe('cocina')
        const antes = totalSuscriptores()
        const flujo = await abrir('estacion:cocina', cookie)
        expect(flujo.estado).toBe(200)
        expect(flujo.cabeceras['content-type']).toMatch(/text\/event-stream/)
        expect(flujo.cabeceras['x-accel-buffering']).toBe('no')
        await flujo.esperar('event: conectado')
        publicar(['estacion:cocina'], { tipo: 'item_estado', ids: { itemId: 'abc' } })
        const texto = await flujo.esperar('"tipo":"item_estado"')
        expect(texto).toMatch(/data: {"canal":"estacion:cocina","tipo":"item_estado","ids":{"itemId":"abc"}/)
        flujo.cerrar()
        await new Promise((ok) => setTimeout(ok, 100))
        expect(totalSuscriptores()).toBe(antes)
    })

    it('sin permiso del canal → 403 (el canal del mesero de otro usuario también); sin sesión → 401', async () => {
        const { cookie } = await cookieDe('mesero')
        const sinPermiso = await abrir('estacion:cocina', cookie)
        expect(sinPermiso.estado).toBe(403)
        expect(await sinPermiso.cuerpo()).toMatchObject({ error: { code: 'FORBIDDEN', details: { canal: 'estacion:cocina' } } })
        expect((await abrir(`mesero:${new ObjectId()}`, cookie)).estado).toBe(403)
        const sinSesion = await abrir('plano', '')
        expect(sinSesion.estado).toBe(401)
        expect(await sinSesion.cuerpo()).toMatchObject({ error: { code: 'UNAUTHORIZED' } })
    })

    it(`más de ${MAX_CONEXIONES_POR_USUARIO} pantallas en vivo del mismo usuario → 429`, async () => {
        const { cookie } = await cookieDe('cocina')
        const abiertas = []
        for (let i = 0; i < MAX_CONEXIONES_POR_USUARIO; i += 1) {
            const f = await abrir('estacion:cocina', cookie)
            await f.esperar('event: conectado')
            abiertas.push(f)
        }
        const rechazada = await abrir('estacion:cocina', cookie)
        expect(rechazada.estado).toBe(429)
        expect(await rechazada.cuerpo()).toMatchObject({ error: { code: 'DEMASIADAS_CONEXIONES' } })
        // Al cerrar una pantalla, el hueco queda libre (reconexión)
        abiertas.pop().cerrar()
        await new Promise((ok) => setTimeout(ok, 100))
        const otra = await abrir('estacion:cocina', cookie)
        expect(otra.estado).toBe(200)
        abiertas.push(otra)
        for (const f of abiertas) f.cerrar()
    })

    it('las conexiones cortadas antes de recibir nada no ocupan hueco', async () => {
        const { cookie } = await cookieDe('cocina')
        for (let i = 0; i < MAX_CONEXIONES_POR_USUARIO + 2; i += 1) {
            limpiarCacheSesiones() // la autenticación espera a la BD: el corte llega durante esa espera
            const req = http.get({ port: puerto, path: '/api/v1/staff/eventos?canales=estacion:cocina', headers: { Cookie: cookie } })
            req.on('error', () => {})
            // Se corta en cuanto la petición sale, antes de que el servidor registre el «close»
            req.on('finish', () => setTimeout(() => req.destroy(), 2))
        }
        await new Promise((ok) => setTimeout(ok, 300))
        const flujo = await abrir('estacion:cocina', cookie)
        expect(flujo.estado).toBe(200)
        flujo.cerrar()
    })

    it('si la sesión se revoca (p. ej. «Cambiar de usuario» o contraseña), el flujo avisa y se cierra en el siguiente latido', async () => {
        configurarLatido(50)
        const { usuario, cookie } = await cookieDe('cocina')
        const flujo = await abrir('estacion:cocina', cookie)
        await flujo.esperar('event: conectado')
        await Usuario.updateOne({ _id: usuario._id }, { $inc: { tokenVersion: 1 } })
        limpiarCacheSesiones()
        const antes = totalSuscriptores()
        await flujo.esperar('event: sesion_cerrada')
        await flujo.fin // el servidor cierra el flujo
        expect(totalSuscriptores()).toBe(antes - 1)
        // y el hueco queda libre: con la sesión nueva se puede volver a abrir
        const { cookie: nueva } = await cookieDe('cocina')
        expect((await abrir('estacion:cocina', nueva)).estado).toBe(200)
    })

    it('al cerrar sesión o «Cambiar de usuario», sus flujos se cierran al momento, sin esperar al latido; los de otro usuario siguen', async () => {
        // Latido normal (25 s): si el cierre dependiera de él, el test no recibiría «sesion_cerrada» a tiempo
        const { usuario, cookie } = await cookieDe('cocina')
        const { usuario: otro, cookie: otraCookie } = await cookieDe('cocina')
        const revocacionesAntes = totalRevocaciones()
        const flujo = await abrir('estacion:cocina', cookie)
        const segundo = await abrir('estacion:barra', cookie) // otra pantalla del mismo usuario
        const ajeno = await abrir('estacion:cocina', otraCookie)
        await Promise.all([flujo, segundo, ajeno].map((f) => f.esperar('event: conectado')))
        const antes = totalSuscriptores()
        const avisosAlOtro = []
        const bajaEspia = alRevocarSesion(otro._id, () => avisosAlOtro.push(1))
        const avisosAlPropio = []
        const bajaPropio = alRevocarSesion(usuario._id, () => avisosAlPropio.push(1))

        const res = await api().post('/api/v1/auth/logout').set('Cookie', cookie)
        expect(res.status).toBe(200)

        await flujo.esperar('event: sesion_cerrada', 1500)
        await segundo.esperar('event: sesion_cerrada', 1500)
        await Promise.all([flujo.fin, segundo.fin])
        expect(totalSuscriptores()).toBe(antes - 2)
        // La revocación solo llega a ese usuario: al otro cocinero no se le avisa y sigue en vivo
        expect(avisosAlPropio).toHaveLength(1)
        expect(avisosAlOtro).toHaveLength(0)
        publicar(['estacion:cocina'], { tipo: 'item_estado', ids: {} })
        await ajeno.esperar('"tipo":"item_estado"')
        bajaEspia()
        bajaPropio()
        ajeno.cerrar()
        await new Promise((ok) => setTimeout(ok, 100))
        expect(totalRevocaciones()).toBe(revocacionesAntes) // ningún flujo cerrado deja su escucha colgada
    })

    it('una revocación que llega mientras se comprueba la sesión no se pierde (revisor-backend)', async () => {
        configurarLatido(1000)
        const { cookie } = await cookieDe('cocina')
        // El primer latido lee la sesión de antes y se queda retenido; el logout llega mientras tanto
        let soltar
        const retenida = new Promise((ok) => { soltar = ok })
        let avisarRetenida
        const enCurso = new Promise((ok) => { avisarRetenida = ok })
        let primera = true
        configurarComprobacion(async () => {
            if (!primera) return
            primera = false
            avisarRetenida()
            await retenida
        })
        const flujo = await abrir('estacion:cocina', cookie)
        await flujo.esperar('event: conectado')
        await enCurso
        await api().post('/api/v1/auth/logout').set('Cookie', cookie)
        soltar()
        // Sin repetir la comprobación, el flujo seguiría abierto hasta el siguiente latido (1 s después)
        await flujo.esperar('event: sesion_cerrada', 500)
    })

    it('un logout que no revoca nada (sin cookie, o un cliente) no avisa a nadie', async () => {
        const { usuario, cookie } = await cookieDe('cocina')
        const { usuario: cliente, cookie: cookieCliente } = await cookieDe('cliente')
        const avisos = []
        const bajas = [usuario, cliente].map((u) => alRevocarSesion(u._id, () => avisos.push(String(u._id))))
        const flujo = await abrir('estacion:cocina', cookie)
        await flujo.esperar('event: conectado')
        await api().post('/api/v1/auth/logout')
        await api().post('/api/v1/auth/logout').set('Cookie', cookieCliente)
        expect(avisos).toEqual([])
        publicar(['estacion:cocina'], { tipo: 'item_estado', ids: {} })
        const texto = await flujo.esperar('"tipo":"item_estado"')
        expect(texto).not.toContain('sesion_cerrada')
        for (const baja of bajas) baja()
        flujo.cerrar()
    })

    it('si el rol pierde el permiso del canal con el flujo abierto, se cierra en el siguiente latido (security-reviewer)', async () => {
        configurarLatido(50)
        const { usuario, cookie } = await cookieDe('cocina')
        const flujo = await abrir('estacion:cocina', cookie)
        await flujo.esperar('event: conectado')
        await Rol.updateOne({ _id: usuario.rol }, { $pull: { permisos: 'kds:ver' } })
        limpiarCacheSesiones()
        await flujo.esperar('event: sesion_cerrada')
    })
})
