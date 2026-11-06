// 0.12 · Grupo 2 (aprobado): las rutas /api sin versión se retiraron. Responden 404 con el
// formato de error estándar. Se conservan /api/health y las imágenes del menú, cuyas URL
// están guardadas en los productos (moverlas a /api/v1 queda pendiente, con su migración).
import { describe, it, expect } from 'vitest'
import { agente } from './helpers/app.js'
import { crearConSesion } from './helpers/usuarios.js'
import MenuImage from '../src/modulos/catalogo/menuImage.model.js'

const RETIRADAS = [
    ['post', '/api/auth/login'],
    ['get', '/api/auth/me'],
    ['get', '/api/usuarios/perfil'],
    ['get', '/api/customer/profile'],
    ['get', '/api/customer/orders'],
    ['post', '/api/customer/orders'],
    ['get', '/api/customer/payment-methods'],
    ['get', '/api/customer/reservations'],
    ['get', '/api/customer/reviews'],
    ['post', '/api/reservas'],
    ['get', '/api/reservas/mias'],
    ['get', '/api/reservas'],
    ['get', '/api/comentarios'],
    ['get', '/api/reviews'],
    ['get', '/api/comentarios/product-ratings'],
    ['get', '/api/productos/menu'],
    ['get', '/api/productos'],
    ['get', '/api/categorias'],
    ['get', '/api/metodos-pago'],
    ['get', '/api/estados'],
    ['get', '/api/roles'],
    ['get', '/api/permisos'],
    ['get', '/api/pedidos'],
    ['get', '/api/admin/usuarios'],
]

describe('Rutas /api sin versión retiradas (0.12)', () => {
    it.each(RETIRADAS)('%s %s → 404 con el formato estándar', async (metodo, ruta) => {
        // Con sesión de admin: el 404 no depende de permisos ni de autenticación
        const { sesion } = await crearConSesion('admin')
        const res = await sesion[metodo](ruta).send(metodo === 'get' ? undefined : {})
        expect(res.status).toBe(404)
        expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: `No existe la ruta ${metodo.toUpperCase()} ${ruta}.` } })
        expect(res.headers.deprecation).toBeUndefined()
    })

    it('se conservan /api/health y las imágenes del menú', async () => {
        expect((await agente().get('/api/health')).status).toBe(200)
        await MenuImage.create({ nombre: 'latte-prueba.png', contentType: 'image/png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) })
        const imagen = await agente().get('/api/productos/menu/imagenes/latte-prueba.png')
        expect(imagen.status).toBe(200)
        expect(imagen.headers['content-type']).toMatch(/image\/png/)
        expect(imagen.headers.deprecation).toBeUndefined()
    })
})
