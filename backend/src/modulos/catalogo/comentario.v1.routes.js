import { Router } from 'express'
import { listarComentariosPublicos, obtenerCalificacionesProductos } from './comentario.controller.js'

// /api/v1/comentarios: lectura pública (publicar es /api/v1/cliente/comentarios)
const router = Router()
router.get('/', listarComentariosPublicos)
router.get('/calificaciones', obtenerCalificacionesProductos)

export default router
