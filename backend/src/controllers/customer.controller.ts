import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { customerService } from '../services/customer.service.js';
import { UnauthorizedError, BadRequestError } from '../utils/errors.js';

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  companyName: z.string().trim().optional().nullable(),
  phone: z.string().trim().min(5, 'Valid phone number is required').max(25),
  email: z.string().trim().email('Invalid email address').optional().nullable(),
  location: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  assignedToId: z.string().trim().min(1).optional().nullable(),
});

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(1).optional(),
  companyName: z.string().trim().optional().nullable(),
  phone: z.string().trim().min(5).max(25).optional(),
  email: z.string().trim().email('Invalid email address').optional().nullable(),
  location: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  assignedToId: z.string().trim().optional().nullable(),
});

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  assignedToId: z.string().trim().optional(),
});

export class CustomerController {
  private getId(req: Request): string {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new BadRequestError('Valid Customer ID is required');
    }
    return id.trim();
  }

  /**
   * POST /customers
   */
  public async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const validated = createCustomerSchema.parse(req.body);
      const customer = await customerService.createCustomer(req.user, validated);

      res.status(201).json({
        status: 'success',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /customers
   */
  public async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const query = listCustomersQuerySchema.parse(req.query);
      const result = await customerService.listCustomers(req.user, query);

      res.status(200).json({
        status: 'success',
        data: result.customers,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /customers/:id
   */
  public async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const customerId = this.getId(req);
      const customer = await customerService.getCustomerById(req.user, customerId);

      res.status(200).json({
        status: 'success',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /customers/:id
   */
  public async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const customerId = this.getId(req);
      const validated = updateCustomerSchema.parse(req.body);
      const updated = await customerService.updateCustomer(req.user, customerId, validated);

      res.status(200).json({
        status: 'success',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const customerController = new CustomerController();
