// supertest normally starts a server per request with listen(0) on all interfaces. On macOS that can pick a
// port another app already holds on 127.0.0.1, so a request reaches that app instead (stray 404s). Here each
// test file gets one server bound to 127.0.0.1, started before any test, and supertest is pointed at it.
const http = require('http');

const mockServer = http.createServer();
mockServer.unref(); // never keeps Jest alive

beforeAll(() => new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve)));

jest.mock('supertest', () => {
  const real = jest.requireActual('supertest');
  return (app, ...rest) => {
    if (typeof app !== 'function') return real(app, ...rest);
    if (mockServer.listenerCount('request') === 0) mockServer.on('request', app);
    return real(mockServer, ...rest);
  };
});
