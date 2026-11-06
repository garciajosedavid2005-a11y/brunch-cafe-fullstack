// Imágenes de productos: el admin las envía incrustadas (data URL) y aquí se guardan
// en MenuImage; el producto solo guarda la URL. Así el catálogo nunca lleva base64.
import { randomUUID } from 'node:crypto'
import MenuImage from './menuImage.model.js'

export const PREFIJO_URL = '/productos/menu/imagenes/'
// Las subidas desde el admin llevan este prefijo; las del seed no (no se borran)
const PREFIJO_SUBIDA = 'producto-'

export const DATA_URL = /^data:(image\/(png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/
const EXTENSION = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

export const MAX_BYTES_IMAGEN = 2 * 1024 * 1024

/** Bytes reales de una imagen incrustada (sin decodificarla). */
export const bytesDeDataUrl = (dataUrl) => {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    const relleno = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
    return (base64.length * 3) / 4 - relleno
}

export const esDataUrl = (valor) => typeof valor === 'string' && valor.startsWith('data:')
export const esUrlDelMenu = (valor) =>
    typeof valor === 'string' && valor.startsWith(PREFIJO_URL) && !valor.slice(PREFIJO_URL.length).includes('/')

/** Lo que el catálogo puede enviar: URL del menú o vacío (nunca base64). */
export const urlPublica = (imagen) => (imagen && !esDataUrl(imagen) ? imagen : '')

const nombreDeUrl = (url) => (esUrlDelMenu(url) ? decodeURIComponent(url.slice(PREFIJO_URL.length)) : null)

/** Guarda una imagen incrustada y devuelve su URL. */
export const guardarImagenSubida = async (dataUrl, codigo) => {
    const [, contentType, , base64] = dataUrl.match(DATA_URL)
    const nombre = `${PREFIJO_SUBIDA}${codigo}-${randomUUID().slice(0, 8)}.${EXTENSION[contentType]}`
    await MenuImage.create({ nombre, contentType, data: Buffer.from(base64, 'base64') })
    return `${PREFIJO_URL}${encodeURIComponent(nombre)}`
}

/** Borra una imagen subida desde el admin (las del seed se conservan). */
export const borrarImagenSubida = async (url) => {
    const nombre = nombreDeUrl(url)
    if (nombre?.startsWith(PREFIJO_SUBIDA)) await MenuImage.deleteOne({ nombre })
}
