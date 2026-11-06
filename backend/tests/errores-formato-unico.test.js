// 0.11: se retira normalizarErroresLegados. Todos los errores salen con el formato único
// { error: { code, message, details } } desde el propio controlador o el manejador central.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import mongoose from 'mongoose'
import { crearConSesion } from './helpers/usuarios.js'
import * as manejador from '../src/modulos/compartido/errorHandler.js'

const SRC = join(import.meta.dirname, '..', 'src')
// Sin uso desde 0.8; se borran en 0.12 (aprobado)
const SIN_USO = ['controllers/usuario.controller.js', 'middlewares/authorizeRole.js', 'schema/reserva.schema.js']
const fuentes = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? fuentes(p) : n.endsWith('.js') ? [p] : []
})

describe('Formato único de errores sin normalizador (0.11)', () => {
    it('ningún controlador responde un error con { message } suelto', () => {
        const ERROR_LEGADO = /\.status\(\s*[45]\d\d\s*\)\s*\.json\(\s*\{/g
        const hallazgos = fuentes(SRC)
            .map((archivo) => relative(SRC, archivo).split(sep).join('/'))
            .filter((ruta) => !SIN_USO.includes(ruta))
            .flatMap((ruta) => (readFileSync(join(SRC, ruta), 'utf8').match(ERROR_LEGADO) || []).map(() => ruta))
        expect(hallazgos).toEqual([])
    })

    it('el normalizador transitorio ya no existe', () => {
        expect(manejador.normalizarErroresLegados).toBeUndefined()
        expect(readFileSync(join(SRC, 'app.js'), 'utf8')).not.toMatch(/normalizarErroresLegados/)
    })

    it('los errores que antes pasaban por el normalizador conservan código y mensaje', async () => {
        const { sesion: admin } = await crearConSesion('admin')
        const { sesion: cliente } = await crearConSesion('cliente')
        const id = new mongoose.Types.ObjectId()

        const producto = await admin.delete(`/api/v1/admin/productos/${id}`)
        expect(producto.status).toBe(404)
        expect(producto.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Producto no encontrado' } })

        const pedido = await cliente.get(`/api/v1/cliente/pedidos/${id}`)
        expect(pedido.body).toEqual({ error: { code: 'NOT_FOUND', message: 'No se encontró el pedido.' } })

        const invalido = await cliente.post('/api/v1/cliente/pedidos').send({ items: [] })
        expect(invalido.status).toBe(400)
        expect(invalido.body.error).toMatchObject({ code: 'BAD_REQUEST', message: 'Revisa los productos y datos de entrega.' })
        expect(invalido.body.error.details.fieldErrors).toHaveProperty('items')

        const metodo = await admin.delete(`/api/v1/admin/metodos-pago/${id}`)
        expect(metodo.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Método de pago no encontrado' } })
    })
})
