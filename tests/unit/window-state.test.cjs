const test = require('node:test');
const assert = require('node:assert/strict');
const { readNormalBounds } = require('../../electron/window-state.cjs');

function fixture(state = {}) {
  return {
    isDestroyed: () => false,
    isMaximized: () => false,
    isMinimized: () => false,
    getNormalBounds: () => ({ x: 120, y: 120, width: 321, height: 241 }),
    getContentSize: () => [320, 240],
    ...state,
  };
}

test('normal bounds preserve position while saving content dimensions instead of fractional-DPI frame growth', () => {
  assert.deepEqual(readNormalBounds(fixture(), null), {
    x: 120,
    y: 120,
    width: 320,
    height: 240,
  });
});

test('maximized, minimized and destroyed windows preserve the preceding normal bounds', () => {
  const previous = { x: -800, y: 100, width: 340, height: 240 };
  for (const flag of ['isMaximized', 'isMinimized', 'isDestroyed']) {
    const window = fixture({
      [flag]: () => true,
      getNormalBounds: () =>
        assert.fail('non-normal state must not replace saved bounds'),
      getContentSize: () =>
        assert.fail('non-normal state must not replace saved bounds'),
    });
    assert.equal(readNormalBounds(window, previous), previous);
  }
});

test('returning to normal state captures actual user resizing without a fixed DPI adjustment', () => {
  const window = fixture({
    getNormalBounds: () => ({ x: -1500, y: 80, width: 502, height: 302 }),
    getContentSize: () => [500, 300],
  });
  assert.deepEqual(
    readNormalBounds(window, { x: 120, y: 120, width: 320, height: 240 }),
    { x: -1500, y: 80, width: 500, height: 300 },
  );
});
