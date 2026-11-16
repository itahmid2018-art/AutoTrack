import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  adjudicateWarranty,
  decodeSerialManufactureDate,
} from '../src/utils/warrantyAdjudicator';

describe('warrantyAdjudicator utilities', () => {
  it('decodes known factory lookup serials, Bosch FD codes, and flags invalid serials', () => {
    const lookup = decodeSerialManufactureDate('SN-3611B54300');
    assert.equal(lookup.serialNumberValid, true);
    assert.equal(lookup.manufactureDate, '2024-06');

    const fdCode = decodeSerialManufactureDate('FD-504');
    assert.equal(fdCode.serialNumberValid, true);
    assert.equal(fdCode.manufactureDate, '2025-04');

    const invalid = decodeSerialManufactureDate('NA');
    assert.equal(invalid.serialNumberValid, false);
    assert.equal(invalid.manufactureDate, null);
  });

  it('adjudicates In-Warranty vs Out-of-Warranty deterministically with referenceDate', () => {
    const inWarranty = adjudicateWarranty(
      {
        brand: 'Bosch Professional',
        serialNumber: '3611B54300', // 2024-06, 36-month term -> valid through 2027-06
        warrantyStatus: 'Bosch Heavy Duty 3-Year Extended',
        physicalCondition: 'Normal wear',
      },
      { referenceDate: new Date('2026-06-01T00:00:00.000Z') }
    );
    assert.equal(inWarranty.flag, 'In-Warranty');
    assert.equal(inWarranty.termMonths, 36);
    assert.equal(inWarranty.expirationDate, '2027-06');

    const outOfWarranty = adjudicateWarranty(
      {
        brand: 'Milwaukee',
        serialNumber: 'MIL-440192', // 2020-11, 36-month term -> expired 2023-11
        warrantyStatus: 'Standard 1-Year',
        physicalCondition: 'Heavily worn',
      },
      { referenceDate: new Date('2026-06-01T00:00:00.000Z') }
    );
    assert.equal(outOfWarranty.flag, 'Out-of-Warranty');
    assert.equal(outOfWarranty.recommendedWarrantyStatus, 'Out of Warranty');
  });

  it('attaches cable cut exclusion advisory when physical condition or complaint mentions cable cut', () => {
    const result = adjudicateWarranty(
      {
        brand: 'Bosch Professional',
        serialNumber: '3611B54300',
        warrantyStatus: 'Bosch Heavy Duty 3-Year Extended',
        physicalCondition: 'Power cord cable cut near strain relief',
      },
      {
        referenceDate: new Date('2026-06-01T00:00:00.000Z'),
        grievanceCategory: 'Cable Cut / Strain Relief Damaged',
      }
    );
    assert.ok(result.exclusionAdvisory);
    assert.match(result.exclusionAdvisory, /cable cut/i);
  });
});
