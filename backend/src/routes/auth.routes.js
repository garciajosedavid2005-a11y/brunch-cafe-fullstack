import { Router } from 'express'
import { register, login, logout } from '../controllers/auth.controller.js'
import { validateSchema } from '../middlewares/validator.middleware.js'
import { registroSchema, loginSchema } from '../schema/auth.schema.js'

const router = Router()

router.post('/registro', validateSchema(registroSchema), register)
router.post('/login', validateSchema(loginSchema), login)
router.post('/logout', logout)

export default router