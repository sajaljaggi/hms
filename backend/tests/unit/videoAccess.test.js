const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { videoAccess } = require('../../utils/videoAccess');

describe('videoAccess', () => {
  const user = { id: 9, name: 'Dr Who', email: 'dr@example.com' };

  test('without JaaS keys: plain Jitsi room, no token', () => {
    expect(videoAccess('hms-abc', user, true, {})).toEqual({ domain: 'meet.jit.si', roomName: 'hms-abc' });
    expect(videoAccess('hms-abc', user, true, { JITSI_DOMAIN: 'meet.example.org' }).domain).toBe('meet.example.org');
  });

  test('with JaaS keys: signed RS256 token scoped to the room, moderator only for the doctor', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n'); // as stored in .env
    const env = { JAAS_APP_ID: 'vpaas-magic-cookie-abc123', JAAS_KID: 'vpaas-magic-cookie-abc123/k1', JAAS_PRIVATE_KEY: pem };

    const doc = videoAccess('hms-abc', user, true, env);
    expect(doc).toMatchObject({ domain: '8x8.vc', tenant: env.JAAS_APP_ID, roomName: 'vpaas-magic-cookie-abc123/hms-abc' });
    const { header, payload } = jwt.verify(doc.jwt, publicKey, { algorithms: ['RS256'], complete: true });
    expect(header.kid).toBe(env.JAAS_KID);
    expect(payload).toMatchObject({ aud: 'jitsi', iss: 'chat', sub: env.JAAS_APP_ID, room: 'hms-abc' });
    expect(payload.context.user).toMatchObject({ id: '9', name: 'Dr Who', moderator: 'true' });
    expect(payload.exp - payload.nbf).toBeLessThanOrEqual(2 * 3600 + 10);

    const pat = jwt.decode(videoAccess('hms-abc', user, false, env).jwt);
    expect(pat.context.user.moderator).toBe('false');
  });
});
