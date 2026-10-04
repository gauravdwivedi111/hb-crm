import { config } from '../config/env.js';
import { BadRequestError } from '../utils/errors.js';

export interface GstAddressDetails {
  buildingNumber?: string;
  buildingName?: string;
  street?: string;
  locality?: string;
  district?: string;
  state?: string;
  pincode?: string;
  fullAddress: string;
}

export interface GstLookupResponse {
  success: boolean;
  configured: boolean;
  gstin: string;
  legalName?: string;
  tradeName?: string;
  status?: string;
  constitution?: string;
  pan?: string;
  state?: string;
  address?: GstAddressDetails;
  fullAddress?: string;
  registrationDate?: string;
  message?: string;
}

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const GST_STATE_MAP: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

const PAN_ENTITY_MAP: Record<string, string> = {
  C: 'Company / Private Limited',
  P: 'Sole Proprietor / Individual',
  H: 'Hindu Undivided Family (HUF)',
  F: 'Partnership / LLP',
  A: 'Association of Persons (AOP)',
  T: 'Trust',
  B: 'Body of Individuals (BOI)',
  L: 'Local Authority',
  J: 'Artificial Juridical Person',
  G: 'Government Entity',
};

export class GstService {
  /**
   * Look up live GST taxpayer details from RapidAPI (or fall back gracefully).
   */
  public async lookup(gstinRaw: string): Promise<GstLookupResponse> {
    const cleanGst = (gstinRaw || '').trim().toUpperCase();

    if (!cleanGst || cleanGst.length !== 15 || !GSTIN_REGEX.test(cleanGst)) {
      throw new BadRequestError('Invalid GSTIN format. Must be a 15-character Indian GST number.');
    }

    const stateCode = cleanGst.substring(0, 2);
    const offlineState = GST_STATE_MAP[stateCode] || 'Unknown State';
    const pan = cleanGst.substring(2, 12);
    const entityCode = pan[3] || '';
    const offlineConstitution = PAN_ENTITY_MAP[entityCode] || 'Other Entity';

    // Check if RapidAPI is configured
    if (!config.gst.rapidApiKey) {
      console.info(`[GST] RAPIDAPI_KEY is not configured. Returning offline structural details for ${cleanGst}.`);
      return {
        success: true,
        configured: false,
        gstin: cleanGst,
        pan,
        state: offlineState,
        constitution: offlineConstitution,
        message: 'RAPIDAPI_KEY is not configured in server environment. Add RAPIDAPI_KEY in Render to enable live auto-fill of Legal Name and Principal Address.',
      };
    }

    try {
      // Primary URL for gst-return-status is /free/gstin/{gstin}
      const primaryUrl = `https://${config.gst.rapidApiHost}/free/gstin/${cleanGst}`;
      console.info(`[GST] Querying live GST data from ${primaryUrl}...`);

      let res = await fetch(primaryUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-key': config.gst.rapidApiKey,
          'x-rapidapi-host': config.gst.rapidApiHost,
        },
      });

      if (res.status === 404) {
        const fallbackUrl = `https://${config.gst.rapidApiHost}/gstin/${cleanGst}`;
        console.info(`[GST] Primary path returned 404, attempting fallback path: ${fallbackUrl}...`);
        res = await fetch(fallbackUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-rapidapi-key': config.gst.rapidApiKey,
            'x-rapidapi-host': config.gst.rapidApiHost,
          },
        });
      }

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[GST] RapidAPI returned status ${res.status}: ${errorText}`);
        return {
          success: false,
          configured: true,
          gstin: cleanGst,
          pan,
          state: offlineState,
          constitution: offlineConstitution,
          message: `RapidAPI returned status ${res.status}. Please check your RapidAPI key or plan limits.`,
        };
      }

      const json = (await res.json()) as any;
      const payload = (json?.data || json?.result || json?.data?.gstin || json || {}) as any;

      // Extract Legal Name and Trade Name (handle various API schemas)
      const legalName = (
        payload.lgnm ||
        payload.legalName ||
        payload.legal_name ||
        payload.tradeName ||
        payload.trade_name ||
        ''
      ).trim();

      const tradeName = (
        payload.tradeName ||
        payload.trade_name ||
        payload.trade_nam ||
        payload.lgnm ||
        payload.legalName ||
        ''
      ).trim();

      const status = (payload.sts || payload.status || payload.current_status || 'Active').trim();
      const constitution = (
        payload.ctb ||
        payload.constitution ||
        payload.entity_type ||
        offlineConstitution
      ).trim();
      const registrationDate = payload.rgdt || payload.registrationDate || payload.registration_date;

      // Extract & Format Principal Place of Business Address
      const rawAddr =
        payload.adr ||
        payload.pradr?.addr ||
        payload.principal_address ||
        payload.principalPlaceOfBusiness ||
        payload.address ||
        {};

      let fullAddress = '';
      let buildingNumber: string | undefined;
      let buildingName: string | undefined;
      let street: string | undefined;
      let locality: string | undefined;
      let district: string | undefined;
      let state: string | undefined;
      let pincode: string | undefined;

      if (typeof rawAddr === 'string' && rawAddr.trim()) {
        fullAddress = rawAddr.trim();
      } else if (typeof rawAddr === 'object' && rawAddr !== null) {
        buildingNumber = (rawAddr.bno || rawAddr.buildingNumber || '').trim();
        buildingName = (rawAddr.bnm || rawAddr.buildingName || '').trim();
        street = (rawAddr.st || rawAddr.street || '').trim();
        locality = (rawAddr.loc || rawAddr.locality || rawAddr.city || '').trim();
        district = (rawAddr.dst || rawAddr.district || '').trim();
        state = (rawAddr.stcd || rawAddr.state || offlineState).trim();
        pincode = (rawAddr.pncd || rawAddr.pincode || rawAddr.postalCode || '').trim();

        const addressComponents = [
          buildingNumber ? `${buildingNumber}` : '',
          buildingName,
          street,
          locality,
          district,
          state,
          pincode ? `PIN: ${pincode}` : '',
        ].filter(Boolean);

        fullAddress = addressComponents.join(', ');
      }

      if (!fullAddress) {
        fullAddress = offlineState;
      }

      return {
        success: true,
        configured: true,
        gstin: cleanGst,
        legalName: legalName || undefined,
        tradeName: tradeName || undefined,
        status,
        constitution,
        pan,
        state,
        registrationDate,
        address: {
          buildingNumber: buildingNumber || undefined,
          buildingName: buildingName || undefined,
          street: street || undefined,
          locality: locality || undefined,
          district: district || undefined,
          state: state || undefined,
          pincode: pincode || undefined,
          fullAddress,
        },
        fullAddress,
      };
    } catch (err) {
      console.error(`[GST] Exception during RapidAPI request for ${cleanGst}:`, err);
      return {
        success: false,
        configured: true,
        gstin: cleanGst,
        pan,
        state: offlineState,
        constitution: offlineConstitution,
        message: err instanceof Error ? err.message : 'Unable to connect to GST lookup provider.',
      };
    }
  }
}

export const gstService = new GstService();
