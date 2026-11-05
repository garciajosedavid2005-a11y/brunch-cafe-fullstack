import { Router } from 'express';
import { validateToken } from '../middlewares/validateToken.js';
import {
  crearComentario,
  listarComentariosPublicos,
  listarMisComentarios,
  obtenerCalificacionesProductos,
  listarComentariosAdmin,
  cambiarVisibilidadComentario,
  eliminarComentario,
} from '../controllers/comentario.controller.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { validateSchema } from '../middlewares/validator.middleware.js';
import { visibilidadComentarioSchema } from '../schema/comentario.schema.js';

const router = Router();

router.get('/product-ratings', obtenerCalificacionesProductos);
router.get('/mios', validateToken, listarMisComentarios);
router.get('/admin', validateToken, requirePermission('resena:moderar'), listarComentariosAdmin);
router.patch('/:id/visibility', validateToken, requirePermission('resena:moderar'), validateSchema(visibilidadComentarioSchema), cambiarVisibilidadComentario);
router.delete('/:id', validateToken, requirePermission('resena:moderar'), eliminarComentario);
router.get('/', listarComentariosPublicos);
router.post('/', validateToken, crearComentario);

export default router;
