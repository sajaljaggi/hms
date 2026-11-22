import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { paymentService } from '../../services/paymentService';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { formatDbDate } from '../../utils/dates';
import type { AdminPaymentRow, PaymentSummary } from '../../types/modules';
import { statusBadge } from '../../utils/paymentBadge';

const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

export default function AdminPayments() {
  const [rows, setRows] = useState<AdminPaymentRow[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    paymentService.getAllPayments()
      .then(res => { setRows(res.data.data); setSummary(res.data.summary); })
      .catch(err => setError(getErrorMessage(err, 'Could not load payments.')))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
      {error && <div role="alert" className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3"><AlertCircle className="w-4 h-4" /> {error}</div>}
      {loading && <p className="text-gray-400 text-sm">Loading…</p>}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[['Total collected', rupees(summary.totalPaidPaise)], ['Paid', summary.paidCount], ['Pending', summary.pendingCount]].map(([l, v]) => (
            <div key={l} className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs uppercase text-gray-500">{l}</p>
              <p className="text-2xl font-bold text-teal-700">{v}</p>
            </div>
          ))}
        </div>
      )}
      {!loading && !error && rows.length === 0 && <p className="text-gray-400 text-sm">No payments yet.</p>}
      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr><th className="p-3">Patient</th><th className="p-3">Doctor</th><th className="p-3">Appointment</th><th className="p-3">Amount</th><th className="p-3">Status</th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{r.patient_name}</td>
                  <td className="p-3">{r.doctor_name}</td>
                  <td className="p-3">{formatDbDate(r.date)} {r.time}</td>
                  <td className="p-3">{rupees(r.amount_paise)}</td>
                  <td className="p-3"><span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${statusBadge[r.status] ?? ''}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
