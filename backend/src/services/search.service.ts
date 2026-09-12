import { prisma } from '../prisma/client.js';
import { AuthUserPayload } from '../types/auth.types.js';
import {
  buildCustomerAccessFilter,
  buildEnquiryAccessFilter,
} from './enquiry.access.js';

export interface SearchResultItem {
  id: string;
  type: 'CUSTOMER' | 'ENQUIRY';
  title: string;
  subtitle: string | null;
  phone: string;
  email: string | null;
  score: number;
  createdAt: Date;
  metadata: Record<string, unknown>;
}

export class SearchService {
  /**
   * GET /search?q=...
   * Unified search across Customers and Enquiries, strictly scoped to caller's visibility.
   * Returns ranked and merged results capped at 20.
   */
  public async globalSearch(
    user: AuthUserPayload,
    rawQuery?: string,
  ): Promise<SearchResultItem[]> {
    if (!rawQuery || rawQuery.trim() === '') {
      return [];
    }

    const q = rawQuery.trim();
    const qLower = q.toLowerCase();

    const [customerFilter, enquiryFilter] = await Promise.all([
      buildCustomerAccessFilter(user),
      buildEnquiryAccessFilter(user),
    ]);

    // Search customers
    const customersPromise = prisma.customer.findMany({
      where: {
        AND: [
          customerFilter,
          {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { companyName: { contains: q, mode: 'insensitive' } },
            ],
          },
        ],
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        companyName: true,
        location: true,
        createdAt: true,
      },
    });

    // Search enquiries
    const enquiriesPromise = prisma.enquiry.findMany({
      where: {
        AND: [
          enquiryFilter,
          {
            OR: [
              { companyName: { contains: q, mode: 'insensitive' } },
              { product: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          },
        ],
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        companyName: true,
        product: true,
        phone: true,
        email: true,
        status: true,
        priority: true,
        createdAt: true,
        customer: {
          select: { id: true, name: true },
        },
      },
    });

    const [customers, enquiries] = await Promise.all([
      customersPromise,
      enquiriesPromise,
    ]);

    const results: SearchResultItem[] = [];

    // Helper for relevance scoring
    const computeScore = (fields: Array<string | null | undefined>): number => {
      let maxScore = 10;
      const qClean = qLower.replace(/^\+/, '').trim();
      const qDigits = qLower.replace(/\D/g, '');

      for (const f of fields) {
        if (!f) continue;
        const lower = f.toLowerCase();
        const fClean = lower.replace(/^\+/, '').trim();
        const fDigits = lower.replace(/\D/g, '');

        if (lower === qLower || fClean === qClean || (qDigits.length >= 7 && fDigits === qDigits)) {
          return 100; // Exact match
        }
        if (lower.startsWith(qLower) || fClean.startsWith(qClean) || (qDigits.length >= 4 && fDigits.startsWith(qDigits))) {
          maxScore = Math.max(maxScore, 50); // Prefix match
        } else if (lower.includes(qLower) || fClean.includes(qClean) || (qDigits.length >= 4 && fDigits.includes(qDigits))) {
          maxScore = Math.max(maxScore, 20); // Substring match
        }
      }
      return maxScore;
    };

    // Format customer results
    for (const c of customers) {
      const score = computeScore([c.phone, c.email, c.name, c.companyName]);
      results.push({
        id: c.id,
        type: 'CUSTOMER',
        title: c.name,
        subtitle: c.companyName || c.location || null,
        phone: c.phone,
        email: c.email,
        score,
        createdAt: c.createdAt,
        metadata: {
          companyName: c.companyName,
          location: c.location,
        },
      });
    }

    // Format enquiry results
    for (const e of enquiries) {
      const score = computeScore([e.phone, e.email, e.companyName, e.product]);
      results.push({
        id: e.id,
        type: 'ENQUIRY',
        title: e.companyName || e.customer?.name || e.product || 'Enquiry',
        subtitle: e.product ? `Product: ${e.product} (${e.status})` : `Status: ${e.status}`,
        phone: e.phone,
        email: e.email,
        score,
        createdAt: e.createdAt,
        metadata: {
          status: e.status,
          priority: e.priority,
          product: e.product,
          customerId: e.customer?.id,
        },
      });
    }

    // Sort by score DESC, then createdAt DESC, capped at 20
    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return results.slice(0, 20);
  }
}

export const searchService = new SearchService();
