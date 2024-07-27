import { DocumentNumber } from '../../src/core/identifier.js';
import { date } from '../../src/core/plainDate.js';
import { inches } from '../../src/core/units.js';
import type { WeldLogEntry } from '../../src/fabrication/weldLog.js';

export function sampleEntry(overrides: Partial<WeldLogEntry> = {}): WeldLogEntry {
  return {
    id: 'L-1001',
    joint: 'J-14',
    stencil: 'W-118',
    process: 'SMAW',
    procedure: DocumentNumber.parse('WPS-0110 Rev 0'),
    weldedOn: date('2024-07-02'),
    role: 'fill',
    consumable: 'E7018-1/8',
    consumableLot: 'LOT-88214',
    depositThickness: inches('1/4'),
    foreman: 'F-2',
    ...overrides,
  };
}
