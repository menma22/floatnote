const { randomUUID } = require('node:crypto');

const DEFAULT_INTERVAL = 30;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 180;
const MAX_CONTENT_BYTES = 2 * 1024 * 1024;
const NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'text',
  'bulletList',
  'orderedList',
  'listItem',
]);
const MARK_TYPES = new Set(['bold']);
const NOTE_COLORS = new Set([
  'lime',
  'cream',
  'sage',
  'blue',
  'rose',
  'lavender',
  'gray',
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function validateContent(content) {
  assert(
    isRecord(content) &&
      content.type === 'doc' &&
      Array.isArray(content.content),
    'Invalid note document.',
  );
  const serialized = JSON.stringify(content);
  assert(
    Buffer.byteLength(serialized, 'utf8') <= MAX_CONTENT_BYTES,
    'Note document is too large.',
  );
  let count = 0;
  const visit = (node, depth, parent) => {
    assert(
      depth <= 40 &&
        ++count <= 100000 &&
        isRecord(node) &&
        NODE_TYPES.has(node.type),
      'Invalid note document node.',
    );
    if (parent === 'doc' || parent === 'listItem')
      assert(
        ['paragraph', 'bulletList', 'orderedList'].includes(node.type),
        'Invalid block document node.',
      );
    if (parent === 'paragraph')
      assert(node.type === 'text', 'Invalid paragraph content.');
    if (parent === 'bulletList' || parent === 'orderedList')
      assert(node.type === 'listItem', 'Invalid list content.');
    assert(
      Object.keys(node).every((key) =>
        ['type', 'text', 'attrs', 'marks', 'content'].includes(key),
      ),
      'Invalid note document property.',
    );
    if (node.type === 'text')
      assert(
        typeof node.text === 'string' && node.text.length > 0,
        'Invalid text node.',
      );
    else assert(node.text === undefined, 'Invalid document text.');
    if (node.attrs !== undefined) {
      assert(
        isRecord(node.attrs) && Object.keys(node.attrs).length <= 8,
        'Invalid document attributes.',
      );
      for (const [key, value] of Object.entries(node.attrs)) {
        const validStart =
          key === 'start' &&
          Number.isInteger(value) &&
          value >= 0 &&
          value <= 2147483647;
        const validType =
          key === 'type' &&
          (value === null || ['1', 'a', 'A', 'i', 'I'].includes(value));
        assert(
          node.type === 'orderedList' && (validStart || validType),
          'Unsupported document attribute.',
        );
      }
    }
    if (node.marks !== undefined) {
      assert(
        node.type === 'text' &&
          Array.isArray(node.marks) &&
          node.marks.length <= MARK_TYPES.size,
        'Invalid document marks.',
      );
      for (const mark of node.marks)
        assert(
          isRecord(mark) &&
            MARK_TYPES.has(mark.type) &&
            Object.keys(mark).every((key) => key === 'type'),
          'Unsupported document mark.',
        );
    }
    if (node.content !== undefined) {
      assert(
        Array.isArray(node.content) && node.type !== 'text',
        'Invalid document children.',
      );
      if (['doc', 'listItem', 'bulletList', 'orderedList'].includes(node.type))
        assert(node.content.length > 0, 'Empty document block.');
      if (node.type === 'listItem')
        assert(
          node.content[0].type === 'paragraph',
          'List item must start with a paragraph.',
        );
      for (const child of node.content) visit(child, depth + 1, node.type);
    }
    if (['doc', 'listItem', 'bulletList', 'orderedList'].includes(node.type))
      assert(Array.isArray(node.content), 'Missing document children.');
  };
  visit(content, 0);
  return content;
}

function validateUpdate(payload) {
  assert(
    isRecord(payload) &&
      Object.keys(payload).length === 2 &&
      Object.hasOwn(payload, 'content') &&
      Object.hasOwn(payload, 'text'),
    'Invalid note update.',
  );
  validateContent(payload.content);
  assert(
    typeof payload.text === 'string' &&
      Buffer.byteLength(payload.text, 'utf8') <= MAX_CONTENT_BYTES,
    'Invalid note text.',
  );
  return payload;
}

function validateInterval(value) {
  assert(
    Number.isInteger(value) && value >= 5 && value <= 120 && value % 5 === 0,
    'Interval must be 5–120 minutes in 5-minute steps.',
  );
  return value;
}

function validateId(value) {
  assert(
    typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value),
    'Invalid note ID.',
  );
  return value;
}

function validateColor(value) {
  assert(NOTE_COLORS.has(value), 'Invalid note color.');
  return value;
}

function validateBounds(bounds) {
  assert(
    isRecord(bounds) &&
      ['x', 'y', 'width', 'height'].every((key) =>
        Number.isInteger(bounds[key]),
      ),
    'Invalid window bounds.',
  );
  assert(
    Math.abs(bounds.x) <= 100000 &&
      Math.abs(bounds.y) <= 100000 &&
      bounds.width >= MIN_WIDTH &&
      bounds.width <= 20000 &&
      bounds.height >= MIN_HEIGHT &&
      bounds.height <= 20000,
    'Invalid window size.',
  );
  return bounds;
}

function validateState(state) {
  assert(
    isRecord(state) &&
      state.version === 1 &&
      Array.isArray(state.notes) &&
      state.notes.length <= 10000,
    'Unsupported or invalid saved data.',
  );
  const ids = new Set();
  for (const note of state.notes) {
    assert(isRecord(note), 'Invalid saved note.');
    validateId(note.id);
    assert(!ids.has(note.id), 'Duplicate saved note ID.');
    ids.add(note.id);
    validateUpdate({ content: note.content, text: note.text });
    validateInterval(note.intervalMinutes);
    if (note.color === undefined) note.color = 'lime';
    validateColor(note.color);
    assert(typeof note.isOpen === 'boolean', 'Invalid saved note status.');
    if (note.bounds !== null) validateBounds(note.bounds);
    for (const key of ['createdAt', 'updatedAt'])
      assert(
        typeof note[key] === 'string' && Number.isFinite(Date.parse(note[key])),
        'Invalid saved timestamp.',
      );
  }
  return state;
}

function createNote({
  now = new Date().toISOString(),
  id = randomUUID(),
} = {}) {
  return {
    id,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    text: '',
    intervalMinutes: DEFAULT_INTERVAL,
    color: 'lime',
    isOpen: true,
    bounds: null,
    createdAt: now,
    updatedAt: now,
  };
}

function clampBounds(bounds, workAreas) {
  if (!bounds || workAreas.length === 0) return { width: 340, height: 240 };
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const distance = (area) =>
    Math.max(area.x - center.x, 0, center.x - area.x - area.width) ** 2 +
    Math.max(area.y - center.y, 0, center.y - area.y - area.height) ** 2;
  const area = [...workAreas].sort((a, b) => distance(a) - distance(b))[0];
  const width = Math.max(MIN_WIDTH, Math.min(bounds.width, area.width));
  const height = Math.max(MIN_HEIGHT, Math.min(bounds.height, area.height));
  return {
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    width,
    height,
  };
}

module.exports = {
  createNote,
  validateContent,
  validateUpdate,
  validateInterval,
  validateColor,
  validateId,
  validateState,
  validateBounds,
  clampBounds,
  MIN_WIDTH,
  MIN_HEIGHT,
};
