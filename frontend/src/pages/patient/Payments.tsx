import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { paymentService } from '../../services/paymentService';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { formatDbDate } from '../../utils/dates';
import { statusBadge } from '../../utils/paymentBadge';
import type { MyPaymentRow } from '../../types/modules';

export default function Payments() {
  const [rows, setRows] = useState<MyPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    paymentService.getMyPayments()
      .then(res => setRows(res.data.data))
      .catch(err => setError(getErrorMessage(err, 'Could not load payments.')))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My Payments</h1>
      {error && <div role="alert" className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3"><AlertCircle className="w-4 h-4" /> {error}</div>}
      {loading && <p className="text-gray-400 text-sm">Loading…</p>}
      {!loading && !error && rows.length === 0 && <p className="text-gray-400 text-sm">No payments yet.</p>}
      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr><th className="p-3">Date</th><th className="p-3">Doctor</th><th className="p-3">Amount</th><th className="p-3">Status</th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{formatDbDate(r.date)} {r.time}</td>
                  <td className="p-3">{r.doctor_name}<span className="block text-xs text-gray-400">{r.specialization}</span></td>
                  <td className="p-3">₹{(r.amount_paise / 100).toFixed(2)}</td>
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
