const crypto = require('crypto');
const gw = require('../../services/paymentGateway');

const KEYS = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'PAYMENT_MODE', 'NODE_ENV'];
let saved;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS.slice(0, 4)) delete process.env[k];
  process.env.NODE_ENV = 'test';
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  jest.restoreAllMocks();
});

const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

describe('getMode', () => {
  test('mock without keys only in development/test or with PAYMENT_MODE=mock, razorpay with both keys', () => {
    expect(gw.getMode()).toBe('mock');
    process.env.NODE_ENV = 'development';
    expect(gw.getMode()).toBe('mock');
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
    expect(gw.getMode()).toBe('mock'); // only one key set
    process.env.NODE_ENV = 'production';
    expect(gw.getMode()).toBeNull();
    process.env.NODE_ENV = 'staging';
    expect(gw.getMode()).toBeNull();
    delete process.env.NODE_ENV;
    expect(gw.getMode()).toBeNull();
    process.env.PAYMENT_MODE = 'mock';
    expect(gw.getMode()).toBe('mock');
    process.env.RAZORPAY_KEY_SECRET = 's3cret';
    expect(gw.getMode()).toBe('razorpay');
  });
});

describe('checkout signature', () => {
  test('mock: sign/verify round trip, tampered and wrong-length rejected without throwing', () => {
    const sig = gw.signCheckout('order_1', 'pay_1');
    expect(sig).toBe(hmac('mock_secret_dev_only', 'order_1|pay_1'));
    expect(gw.verifyCheckoutSignature('order_1', 'pay_1', sig)).toBe(true);
    expect(gw.verifyCheckoutSignature('order_1', 'pay_2', sig)).toBe(false);
    expect(gw.verifyCheckoutSignature('order_1', 'pay_1', `${sig.slice(0, -1)}${sig.endsWith('0') ? '1' : '0'}`)).toBe(false);
    expect(gw.verifyCheckoutSignature('order_1', 'pay_1', 'abc')).toBe(false);
    expect(gw.verifyCheckoutSignature('order_1', 'pay_1', undefined)).toBe(false);
  });

  test('razorpay mode uses the key secret, and production without keys never verifies', () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAY_KEY_SECRET = 'real_secret';
    const sig = hmac('real_secret', 'o|p');
    expect(gw.verifyCheckoutSignature('o', 'p', sig)).toBe(true);
    expect(gw.verifyCheckoutSignature('o', 'p', hmac('mock_secret_dev_only', 'o|p'))).toBe(false);
    delete process.env.RAZORPAY_KEY_SECRET;
    process.env.NODE_ENV = 'production';
    expect(gw.verifyCheckoutSignature('o', 'p', hmac('mock_secret_dev_only', 'o|p'))).toBe(false);
    expect(() => gw.signCheckout('o', 'p')).toThrow(expect.objectContaining({ statusCode: 503 }));
  });
});

describe('webhook signature', () => {
  const body = Buffer.from('{"event":"payment.captured"}');
  test('valid HMAC of the raw body passes, tampered/short/missing secret fail', () => {
    expect(gw.verifyWebhookSignature(body, hmac('whsec', body))).toBe(false); // secret unset
    process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec';
    expect(gw.verifyWebhookSignature(body, hmac('whsec', body))).toBe(true);
    expect(gw.verifyWebhookSignature(Buffer.from('{"event":"x"}'), hmac('whsec', body))).toBe(false);
    expect(gw.verifyWebhookSignature(body, 'short')).toBe(false);
    expect(gw.verifyWebhookSignature(body, undefined)).toBe(false);
    expect(gw.verifyWebhookSignature({ event: 'parsed' }, hmac('whsec', body))).toBe(false);
  });
});

describe('createOrder', () => {
  test('mock returns order_mock_ + 24 hex without calling fetch', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const o = await gw.createOrder({ amountPaise: 50000, receipt: 'r' });
    expect(o.id).toMatch(/^order_mock_[0-9a-f]{24}$/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('razorpay posts Basic auth + body, non-2xx -> 502', async () => {
    process.env.RAZORPAY_KEY_ID = 'kid';
    process.env.RAZORPAY_KEY_SECRET = 'ksec';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'order_R1' }) });
    expect((await gw.createOrder({ amountPaise: 50000, receipt: 'appt_1', notes: { a: '1' } })).id).toBe('order_R1');
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.razorpay.com/v1/orders');
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    expect(opts.headers.Authorization).toBe(`Basic ${Buffer.from('kid:ksec').toString('base64')}`);
    expect(JSON.parse(opts.body)).toEqual({ amount: 50000, currency: 'INR', receipt: 'appt_1', notes: { a: '1' } });

    fetchSpy.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(gw.createOrder({ amountPaise: 1, receipt: 'r' })).rejects.toMatchObject({ statusCode: 502, code: 'PAYMENT_GATEWAY_ERROR' });
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ error: 'x' }) });
    await expect(gw.createOrder({ amountPaise: 1, receipt: 'r' })).rejects.toMatchObject({ statusCode: 502 });
    fetchSpy.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));
    await expect(gw.createOrder({ amountPaise: 1, receipt: 'r' })).rejects.toMatchObject({ statusCode: 502 });
  });

  test('not configured in production -> 503', async () => {
    process.env.NODE_ENV = 'production';
    await expect(gw.createOrder({ amountPaise: 1, receipt: 'r' })).rejects.toMatchObject({ statusCode: 503, code: 'PAYMENT_NOT_CONFIGURED' });
  });
});
