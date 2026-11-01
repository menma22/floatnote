function readNormalBounds(window, previousBounds) {
  if (window.isDestroyed() || window.isMaximized() || window.isMinimized())
    return previousBounds;
  const { x, y } = window.getNormalBounds();
  const [width, height] = window.getContentSize();
  // Windows fractional DPI adds frame pixels to outer sizes; content dimensions round-trip through setBounds.
  return { x, y, width, height };
}

module.exports = { readNormalBounds };
