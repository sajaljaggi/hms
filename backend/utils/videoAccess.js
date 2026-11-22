const jwt = require('jsonwebtoken');

// JaaS (8x8.vc) when all three keys are set: rooms need a signed token, so only users we
// let in can join, and the doctor joins as moderator. Otherwise the plain JITSI_DOMAIN room.
function jaasConfig(env = process.env) {
  const { JAAS_APP_ID: appId, JAAS_KID: kid, JAAS_PRIVATE_KEY: key } = env;
  if (!appId || !kid || !key) return null;
  return { appId, kid, privateKey: key.replace(/\\n/g, '\n') }; // .env files hold the PEM on one line
}

function videoAccess(room, user, isModerator, env = process.env) {
  const jaas = jaasConfig(env);
  if (!jaas) return { domain: env.JITSI_DOMAIN || 'meet.jit.si', roomName: room };

  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign({
    aud: 'jitsi', iss: 'chat', sub: jaas.appId, room, nbf: now - 10,
    context: {
      user: { id: String(user.id), name: user.name, email: user.email, moderator: isModerator ? 'true' : 'false' },
      // Format per developer.8x8.com/jaas/docs/api-keys-jwt: moderator is a string, features are booleans.
      features: { livestreaming: false, recording: false, transcription: false, 'outbound-call': false },
    },
  }, jaas.privateKey, { algorithm: 'RS256', keyid: jaas.kid, expiresIn: '2h' });

  return { domain: '8x8.vc', tenant: jaas.appId, roomName: `${jaas.appId}/${room}`, jwt: token };
}

module.exports = { videoAccess };
