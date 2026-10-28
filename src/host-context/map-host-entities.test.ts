import { expect, it } from 'vitest';

import { mapHostEntities } from '@/host-context';

it('publishes only explicitly selected fields and isolates mutable summary metadata', () => {
  const item = {
    id: 'one',
    name: 'One',
    aliases: ['First'],
    attributes: { status: 'active', version: '3' },
    secret: 'PRIVATE',
    otherData: { token: 'PRIVATE' },
  };

  const mapped = mapHostEntities([item], {
    type: 'record',
    id: (row) => row.id,
    label: (row) => row.name,
    aliases: (row) => row.aliases,
    attributes: (row) => row.attributes,
  });

  expect(mapped).toEqual([
    {
      type: 'record',
      id: 'one',
      label: 'One',
      aliases: ['First'],
      attributes: { status: 'active', version: '3' },
    },
  ]);
  expect(JSON.stringify(mapped)).not.toContain('PRIVATE');
  mapped[0].aliases!.push('Changed');
  mapped[0].attributes!.status = 'pending';
  expect(item.aliases).toEqual(['First']);
  expect(item.attributes.status).toBe('active');
  item.attributes.version = '4';
  expect(mapped[0].attributes!.version).toBe('3');
});

it('supports minimal or optional summaries without inferring business fields', () => {
  const map = {
    type: 'custom',
    id: (row: { id: string }) => row.id,
    label: () => 'Custom',
    reference: () => undefined,
    aliases: () => undefined,
    attributes: () => undefined,
  };

  expect(mapHostEntities([{ id: 'one' }], map)).toEqual([
    { type: 'custom', id: 'one', label: 'Custom' },
  ]);
  expect(mapHostEntities([], map)).toEqual([]);
});
