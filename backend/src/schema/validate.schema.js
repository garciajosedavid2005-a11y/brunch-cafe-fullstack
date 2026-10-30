import { validateSchema } from '../middlewares/validator.middleware.js'
import { crearComentarioSchema } from '../schema/comentario.schema.js'

router.post('/', validateToken, authorizeRole('cliente'), validateSchema(crearComentarioSchema), crearComentario)