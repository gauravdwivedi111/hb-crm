import { Router } from 'express';
import { Role } from '@prisma/client';
import { productController } from '../controllers/product.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { uploadSingleAttachment } from '../middleware/upload.middleware.js';

export const productRouter = Router();

productRouter.use(requireAuth);

/**
 * Public to all authenticated CRM users (Executives, Managers, Admins)
 */
productRouter.get('/', (req, res, next) => productController.listProducts(req, res, next));
productRouter.get('/search', (req, res, next) => productController.searchProducts(req, res, next));
productRouter.get('/template', (req, res, next) => productController.downloadTemplate(req, res, next));
productRouter.get('/export', (req, res, next) => productController.exportCsv(req, res, next));
productRouter.get('/:id', (req, res, next) => productController.getProductById(req, res, next));

/**
 * Management Routes: Manager+ (ADMIN, DGM, AGM, MANAGER)
 */
const MANAGER_ROLES = [Role.ADMIN, Role.DGM, Role.AGM, Role.MANAGER];

productRouter.post(
  '/',
  requireRole(...MANAGER_ROLES),
  (req, res, next) => productController.createProduct(req, res, next),
);

productRouter.patch(
  '/:id',
  requireRole(...MANAGER_ROLES),
  (req, res, next) => productController.updateProduct(req, res, next),
);

productRouter.post(
  '/bulk-csv',
  requireRole(...MANAGER_ROLES),
  uploadSingleAttachment,
  (req, res, next) => productController.bulkUpsertCsv(req, res, next),
);
