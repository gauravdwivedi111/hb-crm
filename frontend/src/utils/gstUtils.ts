/**
 * Indian GSTIN (Goods and Services Tax Identification Number) Utility
 * 
 * Provides offline mathematical validation (Luhn mod-36 algorithm),
 * state resolution, PAN extraction, entity constitution decoding,
 * and seamless 1-click verification link generation.
 */

// All 36 characters permitted in Indian GSTIN
const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Standard 15-character GSTIN regular expression
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// Official Indian State/UT GST Code Mapping
export const GST_STATE_MAP: Record<string, string> = {
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

// 4th Character of PAN indicates Business Entity Type
export const PAN_ENTITY_MAP: Record<string, string> = {
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

export interface ParsedGSTResult {
  raw: string;
  normalized: string;
  isValidFormat: boolean;
  isChecksumValid: boolean;
  isValid: boolean;
  stateCode: string | null;
  stateName: string | null;
  pan: string | null;
  entityCode: string | null;
  entityType: string | null;
  errorMessage?: string;
}

/**
 * Calculates the official Indian GSTIN Luhn Mod-36 Checksum
 * and verifies whether the 15th character matches the mathematical check.
 */
export function verifyGstChecksum(gstin: string): boolean {
  if (gstin.length !== 15) return false;

  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const char = gstin[i];
    const charIndex = GST_CHARS.indexOf(char);
    if (charIndex === -1) return false;

    // Alternate weights: 1 for even index, 2 for odd index
    const factor = i % 2 === 0 ? 1 : 2;
    const product = charIndex * factor;
    const quotient = Math.floor(product / 36);
    const remainder = product % 36;
    sum += quotient + remainder;
  }

  const remainderTotal = sum % 36;
  const checkCode = (36 - remainderTotal) % 36;
  const expectedChar = GST_CHARS[checkCode];

  return gstin[14] === expectedChar;
}

/**
 * Parses and validates an input string as an Indian GST number.
 */
export function parseGSTIN(input: string): ParsedGSTResult {
  const raw = input || '';
  const normalized = raw.trim().toUpperCase();

  if (!normalized) {
    return {
      raw,
      normalized: '',
      isValidFormat: false,
      isChecksumValid: false,
      isValid: false,
      stateCode: null,
      stateName: null,
      pan: null,
      entityCode: null,
      entityType: null,
    };
  }

  const isValidFormat = GSTIN_REGEX.test(normalized);

  if (!isValidFormat) {
    let errorMessage = 'Invalid GST format (must be 15 characters, e.g. 27AAACA1234A1Z5)';
    if (normalized.length < 15) {
      errorMessage = `Incomplete GST (${normalized.length}/15 characters)`;
    } else if (normalized.length > 15) {
      errorMessage = `Exceeds 15 characters (${normalized.length}/15)`;
    }

    return {
      raw,
      normalized,
      isValidFormat: false,
      isChecksumValid: false,
      isValid: false,
      stateCode: null,
      stateName: null,
      pan: null,
      entityCode: null,
      entityType: null,
      errorMessage,
    };
  }

  const isChecksumValid = verifyGstChecksum(normalized);
  const stateCode = normalized.substring(0, 2);
  const stateName = GST_STATE_MAP[stateCode] || 'Unknown State';
  const pan = normalized.substring(2, 12);
  const entityCode = pan[3];
  const entityType = PAN_ENTITY_MAP[entityCode] || 'Other Entity';

  return {
    raw,
    normalized,
    isValidFormat: true,
    isChecksumValid,
    isValid: isChecksumValid,
    stateCode,
    stateName,
    pan,
    entityCode,
    entityType,
    errorMessage: isChecksumValid
      ? undefined
      : 'Typo detected in GST checksum digit. Please verify characters.',
  };
}

/**
 * Copies the GST number to clipboard and opens the official
 * Government of India GST Search portal in a new browser tab.
 */
export async function openGstPortal(gstin: string): Promise<boolean> {
  const clean = gstin?.trim().toUpperCase();
  if (clean && navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(clean);
    } catch {
      // Non-blocking clipboard error
    }
  }

  // Open official government GST portal
  window.open(
    'https://services.gst.gov.in/services/searchtp',
    '_blank',
    'noopener,noreferrer',
  );

  return true;
}
