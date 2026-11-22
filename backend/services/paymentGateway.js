const crypto = require('crypto');
const { AppError } = require('../utils/errors');

const MOCK_SECRET = 'mock_secret_dev_only';

// 'razorpay' when keys are set. Fails closed otherwise: 'mock' only in development/test or with an
// explicit PAYMENT_MODE=mock, else null (not configured), because mock signatures use a public secret.
function getMode() {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) return 'razorpay';
  const mockAllowed = process.env.PAYMENT_MODE === 'mock' || ['development', 'test'].includes(process.env.NODE_ENV);
  return mockAllowed ? 'mock' : null;
}

function notConfigured() {
  return new AppError('Online payment is not configured.', 503, 'PAYMENT_NOT_CONFIGURED');
}

// The mock secret is used only when getMode() is 'mock'. With mode null this returns null.
function keySecret() {
  const mode = getMode();
  if (mode === 'razorpay') return process.env.RAZORPAY_KEY_SECRET;
  return mode === 'mock' ? MOCK_SECRET : null;
}

const hmacHex = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

// Constant-time compare that never throws: timingSafeEqual requires equal lengths.
function safeEqual(expected, given) {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function createOrder({ amountPaise, receipt, notes }) {
  const mode = getMode();
  if (!mode) throw notConfigured();
  if (mode === 'mock') return { id: `order_mock_${crypto.randomBytes(12).toString('hex')}` };

  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  let res;
  let order;
  try {
    res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) order = await res.json();
  } catch {
    throw new AppError('Payment gateway is unreachable.', 502, 'PAYMENT_GATEWAY_ERROR');
  }
  if (!res.ok) throw new AppError(`Payment gateway error (${res.status}).`, 502, 'PAYMENT_GATEWAY_ERROR');
  if (typeof order?.id !== 'string') throw new AppError('Payment gateway returned no order id.', 502, 'PAYMENT_GATEWAY_ERROR');
  return order;
}

function signCheckout(orderId, paymentId) {
  const secret = keySecret();
  if (!secret) throw notConfigured();
  return hmacHex(secret, `${orderId}|${paymentId}`);
}

function verifyCheckoutSignature(orderId, paymentId, signature) {
  const secret = keySecret();
  if (!secret || typeof orderId !== 'string' || typeof paymentId !== 'string') return false;
  return safeEqual(hmacHex(secret, `${orderId}|${paymentId}`), signature);
}

function verifyWebhookSignature(rawBodyBuffer, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !Buffer.isBuffer(rawBodyBuffer)) return false;
  return safeEqual(hmacHex(secret, rawBodyBuffer), signature);
}

module.exports = { getMode, createOrder, signCheckout, verifyCheckoutSignature, verifyWebhookSignature };
