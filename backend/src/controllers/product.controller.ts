import { Request, Response, NextFunction } from 'express';
import { productService } from '../services/product.service.js';
import { BadRequestError } from '../utils/errors.js';

export class ProductController {
  public async listProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const search = req.query.search as string | undefined;
      const brand = req.query.brand as string | undefined;
      const category = req.query.category as string | undefined;
      const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

      const result = await productService.listProducts({
        page,
        limit,
        search,
        brand,
        category,
        isActive,
      });

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public async searchProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = (req.query.q as string) || '';
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 15;

      const products = await productService.searchProducts(q, limit);

      res.status(200).json({
        status: 'success',
        data: products,
      });
    } catch (err) {
      next(err);
    }
  }

  public async getProductById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const product = await productService.getProductById(id);

      res.status(200).json({
        status: 'success',
        data: product,
      });
    } catch (err) {
      next(err);
    }
  }

  public async createProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const product = await productService.createProduct(req.body);

      res.status(201).json({
        status: 'success',
        data: product,
      });
    } catch (err) {
      next(err);
    }
  }

  public async updateProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const product = await productService.updateProduct(id, req.body);

      res.status(200).json({
        status: 'success',
        data: product,
      });
    } catch (err) {
      next(err);
    }
  }

  public async bulkUpsertCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file || !req.file.buffer) {
        throw new BadRequestError('No CSV file uploaded. Please upload a .csv file.');
      }

      const result = await productService.bulkUpsertCsv(req.file.buffer);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public async exportCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const brand = req.query.brand as string | undefined;
      const csvData = await productService.exportProductsCsv(brand);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="products-catalog.csv"');
      res.status(200).send(csvData);
    } catch (err) {
      next(err);
    }
  }

  public async downloadTemplate(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const template = productService.getTemplateCsv();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="price-list-template.csv"');
      res.status(200).send(template);
    } catch (err) {
      next(err);
    }
  }
}

export const productController = new ProductController();
