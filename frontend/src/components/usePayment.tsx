import { useRef, useState, type ReactNode } from 'react';
import { paymentService } from '../services/paymentService';
import { loadRazorpay } from '../utils/razorpay';
import { getErrorMessage } from '../utils/getErrorMessage';
import type { CreateOrderData } from '../types/modules';

export interface PayNotice { type: 'success' | 'error'; text: string }

const errText = (err: unknown, fallback: string) =>
  (err as { response?: { status?: number } })?.response?.status === 503
    ? 'Online payments are currently unavailable. Please try again later.'
    : getErrorMessage(err, fallback);

// Pay flow for one appointment at a time. `element` renders the mock-mode confirm modal.
export function usePayment(onSettled: () => void) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<PayNotice | null>(null);
  const [mockOrder, setMockOrder] = useState<CreateOrderData | null>(null);
  const [modalError, setModalError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const busy = useRef(false);

  const finish = (n: PayNotice) => { busy.current = false; setBusyId(null); setMockOrder(null); setNotice(n); onSettled(); };

  const verify = async (orderId: string, paymentId: string, signature: string) => {
    try {
      await paymentService.verify({ orderId, paymentId, signature });
      finish({ type: 'success', text: 'Payment successful.' });
    } catch (err) {
      finish({ type: 'error', text: errText(err, 'Payment verification failed.') });
    }
  };

  const fail = async (orderId: string, text: string) => {
    await paymentService.failOrder(orderId).catch(() => undefined);
    finish({ type: 'error', text });
  };

  const pay = async (appointmentId: number) => {
    if (busy.current) return;
    busy.current = true; setBusyId(appointmentId); setNotice(null); setModalError('');
    try {
      const order = (await paymentService.createOrder(appointmentId)).data.data;
      if (order.mode === 'mock') { setMockOrder(order); return; }
      if (!order.keyId) throw new Error('Payment gateway is misconfigured.');
      const Razorpay = await loadRazorpay();
      let settled = false;
      const rzp = new Razorpay({
        key: order.keyId, amount: order.amount, currency: order.currency, order_id: order.orderId, name: 'HMS',
        handler: r => { settled = true; void verify(r.razorpay_order_id, r.razorpay_payment_id, r.razorpay_signature); },
        modal: { ondismiss: () => { if (!settled) { settled = true; void fail(order.orderId, 'Payment was cancelled.'); } } },
      });
      rzp.on('payment.failed', () => { if (!settled) { settled = true; void fail(order.orderId, 'Payment failed.'); } });
      rzp.open();
    } catch (err) {
      finish({ type: 'error', text: errText(err, 'Could not start payment.') });
    }
  };

  const confirmMock = async () => {
    if (!mockOrder?.mock || confirming) return;
    setConfirming(true); setModalError('');
    try {
      await paymentService.verify({ orderId: mockOrder.orderId, ...mockOrder.mock });
      finish({ type: 'success', text: 'Test payment successful.' });
    } catch (err) {
      setModalError(errText(err, 'Payment verification failed.'));
    } finally {
      setConfirming(false);
    }
  };

  const cancelMock = async () => {
    if (!mockOrder || confirming) return;
    await fail(mockOrder.orderId, 'Payment was cancelled.');
  };

  const element: ReactNode = mockOrder && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Test payment">
      <div className="bg-white rounded-xl p-6 max-w-sm w-full space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Test payment</h2>
        <p className="text-sm text-gray-600">Test payment, no money moves. Amount: ₹{(mockOrder.amount / 100).toFixed(2)}</p>
        {modalError && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded p-2">{modalError}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={cancelMock} disabled={confirming} className="px-4 py-2 text-sm border rounded-lg disabled:opacity-60">Cancel</button>
          <button onClick={confirmMock} disabled={confirming} className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-60">
            {confirming ? 'Confirming…' : 'Confirm payment'}
          </button>
        </div>
      </div>
    </div>
  );

  return { pay, busyId, notice, clearNotice: () => setNotice(null), element };
}
