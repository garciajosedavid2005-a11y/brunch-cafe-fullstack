// 1.11 · Direcciones colombianas con una validación flexible, la MISMA en frontend y backend
// (frontend/src/utils/direccion.js es una copia exacta; su test lo comprueba).
import { describe, it, expect, vi } from 'vitest'
import { DIRECCION_REGEX, esDireccionValida, MENSAJE_DIRECCION } from '../src/modulos/compartido/direccion.js'
import { crearConSesion } from './helpers/usuarios.js'
import { crearPedido } from './helpers/datos.js'
import Pedido from '../src/modulos/pedidos/pedido.model.js'
import Producto from '../src/modulos/catalogo/producto.model.js'

const VALIDAS = [
    'Cra 36b Oriente #30-06',
    'Carrera 36B #30-06',
    'Calle 10 Sur # 43A-12',
    'Cl 72 No. 10-34',
    'Cll 45 N° 13-21',
    'Kr 15 # 88-64 apto 301',
    'Cr 7 #45-10',
    'Av. 68 # 22-31',
    'Avenida 30 # 64-20',
    'Ak 7 No. 32-16',
    'Ac 26 # 69D-91',
    'Dg 25 Bis A # 30-15',
    'Diagonal 40 Bis # 10-21',
    'Tv 93 # 51-98 Sur',
    'Transversal 5 Este # 12 - 40',
    'Calle 100 # 19A-15 Occidente',
    'Carrera 50 N 12-30',
    'Av. Calle 80 # 69-70',
    'Avenida Carrera 68 # 22-31',
    'Calle 6AB # 12-30',
    'Cra 7 # 45–10', // guion largo (autocorrector)
]

// Además del formato, la longitud: 'Cl1#1-1' cumple el patrón pero tiene 7 caracteres (mínimo 8) y la última
// pasa de 60 tras quitar los espacios de más
const INVALIDAS = ['', '   ', 'Mi casa', 'Barrio Centro', 'Cra', 'Calle 10', 'Cra 7 #', '#30-06', '12345 67', 'Cra 36b #30',
    'Cl1#1-1', `Cra 7 # 45-10 ${'x'.repeat(47)}`]

// 1.14 · Avenidas con nombre y manzana-casa (con o sin barrio)
const VALIDAS_1_14 = [
    'Av. El Dorado # 68-51',
    'Av. Boyacá # 12-30',
    'Avenida Boyacá No. 12-30',
    'Av Primero de Mayo # 10-20 Sur',
    'Av. Ciudad de Cali # 6-50 apto 202',
    'Mz 5 Cs 3',
    'Manzana 5 Casa 3',
    'Mz. 12B Casa 4',
    'Mz 5 Lote 3',
    'Barrio Las Palmas Mz 5 Cs 3',
    'Mz 5 Cs 3 Barrio Las Palmas',
    'Mz 5 Cs 3, Villa del Sol',
    'Urb. Los Almendros Manzana 2 Casa 14',
]
// Todas con 8 caracteres o más: se rechazan por el formato, no por la longitud
const INVALIDAS_1_14 = ['Av. El Dorado', 'Av. Boyacá #', 'Av. # 12-30', 'Avenida # 12-30', 'Manzana 5', 'Mz 5 apto 2', 'Casa 3 Barrio Centro',
    'Manzana Casa', 'Mz Casa 3', 'Barrio Las Palmas',
    // Texto que no es una dirección (revisores): «Av» pegado a otra palabra, «n» robado al final del
    // nombre como separador o un tipo de vía usado como nombre de la avenida (le falta el número)
    'Avanzan 5 10', 'Avísame en 5 10', 'Avenida no 1 2', 'Avión número 3 4', 'Av Juan 12 30', 'Av Colón 12-30',
    'Av. Calle # 80-10', 'Avenida Carrera # 68-51']

describe('Validación de direcciones: avenidas con nombre y manzana-casa (1.14)', () => {
    it.each(VALIDAS_1_14)('acepta «%s»', (direccion) => {
        expect(esDireccionValida(direccion)).toBe(true)
    })

    it.each(INVALIDAS_1_14)('rechaza «%s»', (direccion) => {
        expect(esDireccionValida(direccion)).toBe(false)
    })

    it('la longitud se comprueba antes que la regex: entradas adversarias de 200 caracteres se rechazan al instante', () => {
        const regex = vi.spyOn(DIRECCION_REGEX, 'test')
        const inicio = performance.now()
        for (const texto of [`Av ${'a '.repeat(98)}`, `Mz 5 Cs 3${' ,'.repeat(95)}x`, `Cra 7 # 45-10${' 1'.repeat(93)}`]) {
            expect(esDireccionValida(texto)).toBe(false)
        }
        expect(performance.now() - inicio).toBeLessThan(50)
        expect(regex).not.toHaveBeenCalled()
    })

    it('el pedido acepta «Mz 5 Cs 3» y «Av. El Dorado # 68-51»', async () => {
        const { sesion: cliente } = await crearConSesion('cliente')
        for (const direccion of ['Mz 5 Cs 3', 'Av. El Dorado # 68-51']) {
            const id = await crearPedido(cliente, { direccion })
            expect((await Pedido.findById(id).lean()).direccion).toBe(direccion)
        }
    })
})

describe('Validación de direcciones (1.11)', () => {
    it.each(VALIDAS)('acepta «%s»', (direccion) => {
        expect(esDireccionValida(direccion)).toBe(true)
    })

    it.each(INVALIDAS)('rechaza «%s»', (direccion) => {
        expect(esDireccionValida(direccion)).toBe(false)
    })

    it('el mensaje da un ejemplo con abreviatura, letra y punto cardinal', () => {
        expect(MENSAJE_DIRECCION).toMatch(/Cra 36B Oriente #30-06/)
    })

    it('los límites: 8 caracteres sí, 7 no; 60 sí, 61 no', () => {
        expect(esDireccionValida('Cl1#1-12')).toBe(true)
        expect(esDireccionValida('Cl1#1-1')).toBe(false)
        const base = 'Cra 7 # 45-10 '
        expect(esDireccionValida(base + 'x'.repeat(60 - base.length))).toBe(true)
        expect(esDireccionValida(base + 'x'.repeat(61 - base.length))).toBe(false)
    })

    it('el pedido guarda «Cra 36b Oriente #30-06» sin espacios de más y rechaza una sin número con 400 en el campo', async () => {
        const { sesion: cliente } = await crearConSesion('cliente')
        const id = await crearPedido(cliente, { direccion: '  Cra  36b   Oriente #30-06 ' })
        expect((await Pedido.findById(id).lean()).direccion).toBe('Cra 36b Oriente #30-06')
        const metodos = await cliente.get('/api/v1/cliente/metodos-pago')
        const res = await cliente.post('/api/v1/cliente/pedidos').send({
            items: [{ productoRef: String((await Producto.findOne().lean())._id), cantidad: 1 }],
            nombre: 'Ana Pérez', telefono: '3001234567', direccion: 'Barrio Centro', hora: '10:00', barrio: 'Centro',
            metodoPagoId: metodos.body[0].id,
        })
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('BAD_REQUEST')
        expect(res.body.error.details.fieldErrors.direccion).toEqual([MENSAJE_DIRECCION])
    })
})
