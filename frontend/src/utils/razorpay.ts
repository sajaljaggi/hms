import { loadScript } from './scriptLoader';

export interface RazorpayOptions {
  key: string; amount: number; currency: string; order_id: string; name: string;
  handler: (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal: { ondismiss: () => void };
}
export interface RazorpayInstance {
  open: () => void;
  on: (event: string, cb: () => void) => void;
}
type RazorpayCtor = new (opts: RazorpayOptions) => RazorpayInstance;

export const loadRazorpay = async (): Promise<RazorpayCtor> => {
  await loadScript('https://checkout.razorpay.com/v1/checkout.js');
  const ctor = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
  if (!ctor) throw new Error('Razorpay checkout is unavailable.');
  return ctor;
};
