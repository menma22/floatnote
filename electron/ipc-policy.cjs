function authorizeSender(event, roles, rendererUrl, allowedKinds) {
  const role = roles.get(event.sender.id);
  const frame = event.senderFrame;
  if (
    !role ||
    !frame ||
    frame !== event.sender.mainFrame ||
    frame.url.split('?')[0] !== rendererUrl
  ) {
    throw new Error('この操作は許可されていません。');
  }
  if (allowedKinds && !allowedKinds.includes(role.kind))
    throw new Error('この画面からは操作できません。');
  return role;
}

module.exports = { authorizeSender };
