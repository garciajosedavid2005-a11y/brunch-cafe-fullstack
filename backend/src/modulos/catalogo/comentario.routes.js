import { Router } from 'express';
import { validateToken } from '../../middlewares/validateToken.js';
import {
  crearComentario,
  listarComentariosPublicos,
  listarMisComentarios,
  obtenerCalificacionesProductos,
  listarComentariosAdmin,
  cambiarVisibilidadComentario,
  eliminarComentario,
} from './comentario.controller.js';
import { requirePermission } from '../../middlewares/requirePermission.js';
import { validateSchema } from '../compartido/validator.middleware.js';
import { visibilidadComentarioSchema } from './comentario.schema.js';
import { deprecado } from '../compartido/deprecado.js';

// /api/comentarios y /api/reviews: alias deprecados (se retiran en 0.12)
const router = Router();
const publico = deprecado('/api/v1/comentarios');
const moderacion = deprecado('/api/v1/admin/comentarios');
const propios = deprecado('/api/v1/cliente/comentarios');

router.get('/product-ratings', deprecado('/api/v1/comentarios/calificaciones'), obtenerCalificacionesProductos);
router.get('/mios', validateToken, propios, listarMisComentarios);
router.get('/admin', validateToken, moderacion, requirePermission('resena:moderar'), listarComentariosAdmin);
router.patch('/:id/visibility', validateToken, moderacion, requirePermission('resena:moderar'), validateSchema(visibilidadComentarioSchema), cambiarVisibilidadComentario);
router.delete('/:id', validateToken, moderacion, requirePermission('resena:moderar'), eliminarComentario);
router.get('/', publico, listarComentariosPublicos);
router.post('/', validateToken, propios, crearComentario);

export default router;
