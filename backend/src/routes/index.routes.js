import { Router } from 'express'
import { obtenerImagenMenu } from '../modulos/catalogo/producto.controller.js'

// /api sin versión (0.12): los alias deprecados se retiraron; cualquier otra ruta responde
// 404 con el formato estándar. Solo quedan las imágenes del menú, porque sus URL están
// guardadas en los productos (moverlas a /api/v1 queda pendiente, con su migración).
const router = Router()

router.get('/productos/menu/imagenes/:nombre', obtenerImagenMenu)

export default router
