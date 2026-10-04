import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { parseRawCsv } from '../utils/csv.parser.js';

export interface ListProductsQuery {
  page?: number;
  limit?: number;
  search?: string;
  brand?: string;
  category?: string;
  isActive?: boolean;
}

export interface CreateProductInput {
  code: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  subCategory?: string | null;
  department?: string | null;
  description?: string | null;
  packSize?: string | null;
  unit?: string;
  hsnCode?: string | null;
  taxRate?: number;
  unitPrice: number;
  mrp?: number | null;
  purchasePrice?: number | null;
  isActive?: boolean;
}

export interface UpdateProductInput {
  name?: string;
  brand?: string | null;
  category?: string | null;
  subCategory?: string | null;
  department?: string | null;
  description?: string | null;
  packSize?: string | null;
  unit?: string;
  hsnCode?: string | null;
  taxRate?: number;
  unitPrice?: number;
  mrp?: number | null;
  purchasePrice?: number | null;
  isActive?: boolean;
}

export interface BulkUpsertResult {
  totalProcessed: number;
  created: number;
  updated: number;
  errors: { row: number; reason: string }[];
}

export class ProductService {
  /**
   * Paginated list with filtering and brand aggregations.
   */
  public async listProducts(query: ListProductsQuery) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.brand && query.brand.trim() && query.brand !== 'ALL') {
      where.brand = query.brand.trim();
    }

    if (query.category && query.category.trim() && query.category !== 'ALL') {
      where.category = query.category.trim();
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { code: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
        { brand: { contains: term, mode: 'insensitive' } },
        { category: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [products, total, brandGroups, categoryGroups] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: [{ brand: 'asc' }, { name: 'asc' }],
        skip,
        take: limit,
      }),
      prisma.product.count({ where }),
      prisma.product.groupBy({
        by: ['brand'],
        _count: { id: true },
        where: { brand: { not: null } },
      }),
      prisma.product.groupBy({
        by: ['category'],
        _count: { id: true },
        where: { category: { not: null } },
      }),
    ]);

    const brands = brandGroups
      .filter((b) => b.brand)
      .map((b) => ({ name: b.brand as string, count: b._count.id }))
      .sort((a, b) => b.count - a.count);

    const categories = categoryGroups
      .filter((c) => c.category)
      .map((c) => ({ name: c.category as string, count: c._count.id }))
      .sort((a, b) => b.count - a.count);

    return {
      products,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      brands,
      categories,
    };
  }

  /**
   * Ultra-fast prefix/trigram search for Quotation Builder Autocomplete.
   */
  public async searchProducts(searchTerm: string, limit: number = 15) {
    if (!searchTerm || !searchTerm.trim()) {
      return prisma.product.findMany({
        where: { isActive: true },
        take: limit,
        orderBy: [{ brand: 'asc' }, { name: 'asc' }],
      });
    }

    const term = searchTerm.trim();
    return prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { code: { contains: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
          { brand: { contains: term, mode: 'insensitive' } },
          { category: { contains: term, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: [{ brand: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Retrieve single product by ID.
   */
  public async getProductById(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
    });
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    return product;
  }

  /**
   * Create a single product.
   */
  public async createProduct(input: CreateProductInput) {
    if (!input.code || !input.code.trim()) {
      throw new BadRequestError('Product code is required');
    }
    if (!input.name || !input.name.trim()) {
      throw new BadRequestError('Product name is required');
    }
    if (input.unitPrice === undefined || input.unitPrice === null || input.unitPrice < 0) {
      throw new BadRequestError('Valid unit price is required');
    }

    const existing = await prisma.product.findUnique({
      where: { code: input.code.trim() },
    });
    if (existing) {
      throw new BadRequestError(`Product code "${input.code}" already exists`);
    }

    return prisma.product.create({
      data: {
        code: input.code.trim(),
        name: input.name.trim(),
        brand: input.brand?.trim() || null,
        category: input.category?.trim() || null,
        subCategory: input.subCategory?.trim() || null,
        department: input.department?.trim() || null,
        description: input.description?.trim() || null,
        packSize: input.packSize?.trim() || null,
        unit: input.unit?.trim() || 'Pcs',
        hsnCode: input.hsnCode?.trim() || null,
        taxRate: input.taxRate !== undefined ? new Prisma.Decimal(input.taxRate) : new Prisma.Decimal(18.0),
        unitPrice: new Prisma.Decimal(input.unitPrice),
        mrp: input.mrp !== undefined && input.mrp !== null ? new Prisma.Decimal(input.mrp) : null,
        purchasePrice: input.purchasePrice !== undefined && input.purchasePrice !== null ? new Prisma.Decimal(input.purchasePrice) : null,
        isActive: input.isActive !== undefined ? input.isActive : true,
      },
    });
  }

  /**
   * Update product prices, tax, or details directly from the CRM UI.
   */
  public async updateProduct(id: string, input: UpdateProductInput) {
    const existing = await prisma.product.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundError('Product not found');
    }

    const data: Prisma.ProductUpdateInput = {};

    if (input.name !== undefined) data.name = input.name.trim();
    if (input.brand !== undefined) data.brand = input.brand?.trim() || null;
    if (input.category !== undefined) data.category = input.category?.trim() || null;
    if (input.subCategory !== undefined) data.subCategory = input.subCategory?.trim() || null;
    if (input.department !== undefined) data.department = input.department?.trim() || null;
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    if (input.packSize !== undefined) data.packSize = input.packSize?.trim() || null;
    if (input.unit !== undefined) data.unit = input.unit.trim();
    if (input.hsnCode !== undefined) data.hsnCode = input.hsnCode?.trim() || null;
    if (input.taxRate !== undefined) data.taxRate = new Prisma.Decimal(input.taxRate);
    if (input.unitPrice !== undefined) data.unitPrice = new Prisma.Decimal(input.unitPrice);
    if (input.mrp !== undefined) data.mrp = input.mrp !== null ? new Prisma.Decimal(input.mrp) : null;
    if (input.purchasePrice !== undefined) data.purchasePrice = input.purchasePrice !== null ? new Prisma.Decimal(input.purchasePrice) : null;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    return prisma.product.update({
      where: { id },
      data,
    });
  }

  /**
   * Bulk Upsert CSV Price List (Supports up to 20,000+ items).
   * Smart Upsert: Updates existing products by code, creates new ones if code not found.
   */
  public async bulkUpsertCsv(csvBuffer: Buffer): Promise<BulkUpsertResult> {
    const csvContent = csvBuffer.toString('utf-8');
    const rawRows = parseRawCsv(csvContent);

    if (rawRows.length < 2) {
      throw new BadRequestError('CSV file is empty or does not contain data rows');
    }

    const header = rawRows[0]!.map((h) => h.toLowerCase().trim());

    // Map column indexes flexibly
    const getCol = (aliases: string[]): number => {
      for (let i = 0; i < header.length; i++) {
        const h = header[i]!;
        if (aliases.some((alias) => h === alias || h.includes(alias))) {
          return i;
        }
      }
      return -1;
    };

    const codeIdx = getCol(['code', 'sku', 'part no', 'item code', 'sap item']);
    const nameIdx = getCol(['name', 'product name', 'item name', 'product']);
    const priceIdx = getCol(['price', 'unit price', 'unitprice', 'sale rate', 'rate', 'saleprice']);
    const mrpIdx = getCol(['mrp']);
    const purchaseIdx = getCol(['purchase', 'cost', 'purchase price']);
    const brandIdx = getCol(['brand']);
    const categoryIdx = getCol(['category']);
    const subCatIdx = getCol(['sub category', 'subcategory']);
    const unitIdx = getCol(['unit', 'uom', 'measurement']);
    const taxIdx = getCol(['tax', 'gst', 'gst rate', 'tax rate']);
    const hsnIdx = getCol(['hsn', 'hsn code']);
    const descIdx = getCol(['description', 'short description', 'print name']);

    if (codeIdx === -1) {
      throw new BadRequestError('Could not find a "Code" or "Item Code" column in the uploaded CSV header.');
    }
    if (nameIdx === -1 && priceIdx === -1) {
      throw new BadRequestError('CSV must include at least a "Name" or "Price" column to update.');
    }

    const errors: { row: number; reason: string }[] = [];
    const validItems: {
      code: string;
      name: string;
      brand?: string | null;
      category?: string | null;
      subCategory?: string | null;
      description?: string | null;
      unit: string;
      hsnCode?: string | null;
      taxRate: number;
      unitPrice: number;
      mrp?: number | null;
      purchasePrice?: number | null;
    }[] = [];

    const parseNum = (val: string | undefined, def: number = 0): number => {
      if (!val) return def;
      const clean = val.replace(/[^\d.-]/g, '');
      const n = parseFloat(clean);
      return isNaN(n) ? def : n;
    };

    for (let r = 1; r < rawRows.length; r++) {
      const row = rawRows[r]!;
      const code = (row[codeIdx] || '').trim();
      if (!code) {
        errors.push({ row: r + 1, reason: 'Empty product code' });
        continue;
      }

      const name = nameIdx !== -1 && row[nameIdx] ? row[nameIdx]!.trim() : code;
      const priceVal = priceIdx !== -1 ? parseNum(row[priceIdx]) : 0;
      const mrpVal = mrpIdx !== -1 ? parseNum(row[mrpIdx]) : (priceVal > 0 ? priceVal : 0);
      const purchaseVal = purchaseIdx !== -1 ? parseNum(row[purchaseIdx]) : 0;
      const finalPrice = priceVal > 0 ? priceVal : mrpVal;

      validItems.push({
        code,
        name: name || code,
        brand: brandIdx !== -1 ? (row[brandIdx] || '').trim() || null : null,
        category: categoryIdx !== -1 ? (row[categoryIdx] || '').trim() || null : null,
        subCategory: subCatIdx !== -1 ? (row[subCatIdx] || '').trim() || null : null,
        description: descIdx !== -1 ? (row[descIdx] || '').trim() || null : null,
        unit: unitIdx !== -1 ? (row[unitIdx] || '').trim() || 'Pcs' : 'Pcs',
        hsnCode: hsnIdx !== -1 ? (row[hsnIdx] || '').trim() || null : null,
        taxRate: taxIdx !== -1 ? parseNum(row[taxIdx], 18) : 18,
        unitPrice: finalPrice,
        mrp: mrpVal > 0 ? mrpVal : null,
        purchasePrice: purchaseVal > 0 ? purchaseVal : null,
      });
    }

    // High performance bulk processing in batches of 500
    let createdCount = 0;
    let updatedCount = 0;
    const BATCH_SIZE = 500;

    for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
      const batch = validItems.slice(i, i + BATCH_SIZE);
      const codes = batch.map((b) => b.code);

      // Find existing products in this batch
      const existing = await prisma.product.findMany({
        where: { code: { in: codes } },
        select: { id: true, code: true },
      });
      const existingSet = new Set(existing.map((e) => e.code));

      // Separate into creates and updates
      const toCreate = batch.filter((b) => !existingSet.has(b.code));
      const toUpdate = batch.filter((b) => existingSet.has(b.code));

      if (toCreate.length > 0) {
        await prisma.product.createMany({
          data: toCreate.map((p) => ({
            code: p.code,
            name: p.name,
            brand: p.brand,
            category: p.category,
            subCategory: p.subCategory,
            description: p.description,
            unit: p.unit,
            hsnCode: p.hsnCode,
            taxRate: new Prisma.Decimal(p.taxRate),
            unitPrice: new Prisma.Decimal(p.unitPrice),
            mrp: p.mrp ? new Prisma.Decimal(p.mrp) : null,
            purchasePrice: p.purchasePrice ? new Prisma.Decimal(p.purchasePrice) : null,
            isActive: true,
          })),
          skipDuplicates: true,
        });
        createdCount += toCreate.length;
      }

      // Update existing products in transaction
      if (toUpdate.length > 0) {
        await prisma.$transaction(
          toUpdate.map((p) =>
            prisma.product.update({
              where: { code: p.code },
              data: {
                name: p.name,
                brand: p.brand !== null ? p.brand : undefined,
                category: p.category !== null ? p.category : undefined,
                unit: p.unit,
                hsnCode: p.hsnCode !== null ? p.hsnCode : undefined,
                taxRate: new Prisma.Decimal(p.taxRate),
                unitPrice: new Prisma.Decimal(p.unitPrice),
                mrp: p.mrp ? new Prisma.Decimal(p.mrp) : undefined,
                purchasePrice: p.purchasePrice ? new Prisma.Decimal(p.purchasePrice) : undefined,
              },
            }),
          ),
        );
        updatedCount += toUpdate.length;
      }
    }

    return {
      totalProcessed: validItems.length,
      created: createdCount,
      updated: updatedCount,
      errors,
    };
  }

  /**
   * Export all products to CSV.
   */
  public async exportProductsCsv(brand?: string) {
    const where: Prisma.ProductWhereInput = {};
    if (brand && brand !== 'ALL') {
      where.brand = brand;
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: [{ brand: 'asc' }, { code: 'asc' }],
    });

    const headers = [
      'Item Code',
      'Brand',
      'Product Name',
      'Category',
      'Sub Category',
      'Unit',
      'Selling Price (INR)',
      'MRP (INR)',
      'Purchase Price (INR)',
      'GST Rate (%)',
      'HSN Code',
      'Description',
      'Status',
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const lines = [headers.join(',')];
    for (const p of products) {
      lines.push(
        [
          escapeCsv(p.code),
          escapeCsv(p.brand || ''),
          escapeCsv(p.name),
          escapeCsv(p.category || ''),
          escapeCsv(p.subCategory || ''),
          escapeCsv(p.unit),
          p.unitPrice.toString(),
          p.mrp ? p.mrp.toString() : '',
          p.purchasePrice ? p.purchasePrice.toString() : '',
          p.taxRate.toString(),
          escapeCsv(p.hsnCode || ''),
          escapeCsv(p.description || ''),
          p.isActive ? 'Active' : 'Inactive',
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  /**
   * Generate standard CSV template for bulk price upload.
   */
  public getTemplateCsv(): string {
    const headers = [
      'Item Code',
      'Brand',
      'Product Name',
      'Category',
      'Unit',
      'Selling Price',
      'MRP',
      'Purchase Price',
      'GST Rate',
      'HSN Code',
    ];
    const sampleRows = [
      ['KOH-7400', 'KOHLER', 'MODERN LIFE WITH SEAT HONED PEACOCK', 'KITCHEN SINK', 'Pcs', '1300', '1300', '910', '18', '7419999'].join(','),
      ['DR-FIXIT001', 'DR. FIXIT', 'DR. FIXIT PREBOND E[ROLLS 2.4M X 20 MTRS', 'Below Ground', 'ROLL', '22848', '22848', '16320', '18', '38245090'].join(','),
    ];
    return [headers.join(','), ...sampleRows].join('\n');
  }
}

export const productService = new ProductService();
