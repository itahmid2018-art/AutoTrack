import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsvRows,
  parseMaintenanceCsv,
} from '../src/utils/maintenanceCsv';

describe('maintenanceCsv parser and validator', () => {
  it('tokenizes RFC 4180 CSV with BOM, embedded commas, and escaped double quotes', () => {
    const csv = '\uFEFF"Client Name","Model Number","Notes"\r\n"Apex, LLC","GBH ""2-26"" DFR","Line check, clean"';
    const rows = parseCsvRows(csv);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], ['Client Name', 'Model Number', 'Notes']);
    assert.deepEqual(rows[1], ['Apex, LLC', 'GBH "2-26" DFR', 'Line check, clean']);
  });

  it('separates valid rows from invalid rows and avoids ID collisions with existingIds', () => {
    const csv = [
      'customerName,toolBrand,toolCategory,modelNumber,serialNumber,intervalMonths,recommendedServiceScope',
      '"Apex Industrial","Bosch Professional","Rotary Hammer / SDS","GBH 2-28 F","SN-3611B67000",6,"Brush inspection"',
      '"","Bosch Professional","Angle Grinder","","SN-000",3,"Missing required fields"',
      '"Metro Electric","Makita","Angle Grinder","GA4530","SN-MK-772910",12,"Bearing check"',
    ].join('\n');

    const existingIds = new Set(['MAINT-2026-001', 'MAINT-2026-004']);
    const result = parseMaintenanceCsv(csv, 2, existingIds);

    assert.equal(result.totalRows, 3);
    assert.equal(result.validRows.length, 2);
    assert.equal(result.invalidRows.length, 1);
    assert.deepEqual(result.invalidRows[0].errors, ['Missing Client Name', 'Missing Tool Model Number']);

    const ids = result.allRows.map((row) => row.data.id);
    assert.equal(new Set(ids).size, 3);
    for (const id of ids) {
      assert.equal(existingIds.has(id), false);
    }
    assert.equal(ids[0], 'MAINT-2026-005');
  });
});
