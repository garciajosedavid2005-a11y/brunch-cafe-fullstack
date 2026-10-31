import { Router } from 'express';
import { validateToken } from '../middlewares/validateToken.js';
import {
  crearComentario,
  listarComentariosPublicos,
  listarMisComentarios,
  obtenerCalificacionesProductos,
} from '../controllers/comentario.controller.js';

const router = Router();

router.get('/product-ratings', obtenerCalificacionesProductos);
router.get('/mios', validateToken, listarMisComentarios);
router.get('/', listarComentariosPublicos);
router.post('/', validateToken, crearComentario);

export default router;
