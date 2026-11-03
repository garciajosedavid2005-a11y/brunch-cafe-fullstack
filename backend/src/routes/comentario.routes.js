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
import { authorizeRole } from '../middlewares/authorizeRole.js';
import { validateSchema } from '../middlewares/validator.middleware.js';
import { visibilidadComentarioSchema } from '../schema/comentario.schema.js';

const router = Router();

router.get('/product-ratings', obtenerCalificacionesProductos);
router.get('/mios', validateToken, listarMisComentarios);
router.get('/admin', validateToken, authorizeRole('admin'), listarComentariosAdmin);
router.patch('/:id/visibility', validateToken, authorizeRole('admin'), validateSchema(visibilidadComentarioSchema), cambiarVisibilidadComentario);
router.delete('/:id', validateToken, authorizeRole('admin'), eliminarComentario);
router.get('/', listarComentariosPublicos);
router.post('/', validateToken, crearComentario);

export default router;
