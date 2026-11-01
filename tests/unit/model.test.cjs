const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createNote,
  validateState,
  validateUpdate,
  validateInterval,
  validateColor,
  validateId,
  clampBounds,
} = require('../../electron/model.cjs');

test('new notes are independent empty documents with 30-minute intervals', () => {
  const first = createNote();
  const second = createNote();
  assert.notEqual(first.id, second.id);
  assert.equal(first.intervalMinutes, 30);
  assert.equal(first.color, 'lime');
  assert.equal(first.isOpen, true);
  first.content.content.push({ type: 'paragraph' });
  assert.equal(second.content.content.length, 1);
  validateState({ version: 1, notes: [first, second] });
});

test('validates all slider values and rejects strings, NaN, fractions and out-of-range input', () => {
  for (let minutes = 5; minutes <= 120; minutes += 5)
    assert.equal(validateInterval(minutes), minutes);
  for (const value of [0, -5, 3, 14, 125, NaN, Infinity, 15.5, '15', null])
    assert.throws(() => validateInterval(value));
});

test('the six palette colors and legacy cream are accepted; unspecified notes gain lime', () => {
  for (const color of [
    'lime',
    'cream',
    'sage',
    'blue',
    'rose',
    'lavender',
    'gray',
  ])
    assert.equal(validateColor(color), color);
  for (const color of ['red', 'CREAM', '', {}, null])
    assert.throws(() => validateColor(color));
  const note = createNote();
  delete note.color;
  validateState({ version: 1, notes: [note] });
  assert.equal(note.color, 'lime');
  note.color = 'cream';
  validateState({ version: 1, notes: [note] });
  assert.equal(note.color, 'cream');
});

test('Tiptap bold and list documents preserve Japanese text', () => {
  const content = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '日本語', marks: [{ type: 'bold' }] }],
      },
      {
        type: 'orderedList',
        attrs: { start: 1, type: null },
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: '一番目' }],
              },
            ],
          },
        ],
      },
    ],
  };
  assert.equal(
    validateUpdate({ content, text: '日本語\n一番目' }).content,
    content,
  );
});

test('document topology rejects unsupported formatting and children Tiptap would discard', () => {
  const invalid = [
    { type: 'doc', content: [] },
    { type: 'doc', content: [{ type: 'text', text: 'outside paragraph' }] },
    {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'paragraph' }] }],
    },
    {
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: 'unsupported' }] },
      ],
    },
    {
      type: 'doc',
      content: [{ type: 'bulletList', content: [{ type: 'paragraph' }] }],
    },
    {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'bulletList',
                  content: [
                    { type: 'listItem', content: [{ type: 'paragraph' }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'unsupported', marks: [{ type: 'italic' }] },
          ],
        },
      ],
    },
  ];
  for (const content of invalid)
    assert.throws(() => validateUpdate({ content, text: '' }));
});

test('invalid content, executable resource nodes and oversized input are rejected', () => {
  const payload = (content) => ({ content, text: '' });
  for (const content of [
    null,
    {},
    { type: 'doc' },
    {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'https://example.com' } }],
    },
    {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { onclick: 'bad' } }],
    },
  ]) {
    assert.throws(() => validateUpdate(payload(content)));
  }
  assert.throws(() =>
    validateUpdate({ ...payload(createNote().content), id: 'another-note' }),
  );
  assert.throws(() =>
    validateUpdate({
      content: createNote().content,
      text: 'x'.repeat(2 * 1024 * 1024 + 1),
    }),
  );
  assert.throws(() =>
    validateUpdate(
      payload({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'x',
                marks: [
                  { type: 'link', attrs: { href: 'https://example.com' } },
                ],
              },
            ],
          },
        ],
      }),
    ),
  );
});

test('saved data rejects duplicate IDs, unsupported versions and malformed metadata', () => {
  const note = createNote();
  assert.throws(() => validateState({ version: 2, notes: [note] }));
  assert.throws(() =>
    validateState({ version: 1, notes: [note, structuredClone(note)] }),
  );
  for (const [key, value] of [
    ['isOpen', 'yes'],
    ['createdAt', 'invalid'],
    ['bounds', { x: 0, y: 0, width: 10, height: 10 }],
    ['color', 'red'],
  ]) {
    assert.throws(() =>
      validateState({ version: 1, notes: [{ ...note, [key]: value }] }),
    );
  }
  assert.throws(() => validateId('../../outside'));
});

test('window bounds stay visible after removing a monitor', () => {
  assert.deepEqual(
    clampBounds({ x: 3000, y: 200, width: 420, height: 380 }, [
      { x: 0, y: 0, width: 1920, height: 1040 },
    ]),
    { x: 1500, y: 200, width: 420, height: 380 },
  );
  assert.deepEqual(
    clampBounds({ x: -10000, y: -10000, width: 3000, height: 2000 }, [
      { x: -1920, y: 0, width: 1920, height: 1040 },
    ]),
    { x: -1920, y: 0, width: 1920, height: 1040 },
  );
  assert.deepEqual(clampBounds(null, []), { width: 340, height: 240 });
});

test('the nearest active display is selected without moving windows on existing monitors', () => {
  const bounds = { x: -1500, y: 100, width: 420, height: 380 };
  const areas = [
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: -1920, y: 0, width: 1920, height: 1040 },
  ];
  assert.deepEqual(clampBounds(bounds, areas), bounds);
});
