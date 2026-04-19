import { useEffect, useState } from 'react';
import { Search, AlertCircle, Trash2, Calendar, Check, X } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { format } from 'date-fns';

interface Appointment {
  id: number; patient_name: string; patient_email: string; doctor_name: string;
  specialization: string; date: string; time: string; status: string;
  fees: number; reason?: string; created_at: string;
}

const statusColors: Record<string, string> = {
  pending:   'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const formatTime = (timeStr: string) => {
  try {
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${m} ${ampm}`;
  } catch { return timeStr; }
};

const STATUS_FILTERS = ['all', 'pending', 'completed', 'cancelled'] as const;

export default function AdminAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedId, setSelectedId]     = useState<number | null>(null);
  const [newStatus, setNewStatus]       = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    adminService.getAppointments()
      .then(res => setAppointments(res.data.data))
      .catch(() => setError('Failed to load appointments.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = appointments
    .filter(a => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      const q = search.toLowerCase();
      return a.patient_name.toLowerCase().includes(q) || a.doctor_name.toLowerCase().includes(q);
    });

  const selected = appointments.find(a => a.id === selectedId) || null;

  const handleDelete = async (appt: Appointment) => {
    if (!confirm('Delete this appointment? This cannot be undone.')) return;
    try {
      await adminService.deleteAppointment(appt.id);
      setAppointments(prev => prev.filter(a => a.id !== appt.id));
      if (selectedId === appt.id) setSelectedId(null);
    } catch {
      setError('Failed to delete appointment.');
    }
  };

  const handleStatusUpdate = async () => {
    if (!selected || !newStatus) return;
    setUpdatingStatus(true);
    try {
      await adminService.updateAppointment(selected.id, { status: newStatus });
      setAppointments(prev => prev.map(a => a.id === selected.id ? { ...a, status: newStatus } : a));
      setNewStatus('');
    } catch {
      setError('Failed to update appointment status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div></div>;

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0">
      {/* ── Side Panel ── */}
      <div className="w-[280px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col rounded-l-xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-teal-600" />
            Appointments
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">{filtered.length} appointment{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Status Filter Pills */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 text-xs font-medium rounded-full capitalize transition
                  ${statusFilter === s
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search patient or doctor…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:bg-white transition"
            />
          </div>
        </div>

        {/* Appointment List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-gray-400 text-sm">No appointments found.</div>
          )}
          {filtered.map(a => (
            <button
              key={a.id}
              onClick={() => { setSelectedId(a.id); setNewStatus(''); }}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-all
                ${selectedId === a.id
                  ? 'bg-teal-50 border-l-4 border-l-teal-500'
                  : 'hover:bg-gray-50 border-l-4 border-l-transparent'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${statusColors[a.status]}`}>{a.status}</span>
                <span className="text-[10px] text-gray-400">{format(new Date(a.date), 'MMM dd')}</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 truncate">{a.patient_name}</p>
              <p className="text-xs text-gray-400 truncate">{a.doctor_name} · {formatTime(a.time)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-6 rounded-r-xl">
        {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg mb-4"><AlertCircle className="w-4 h-4" />{error}</div>}

        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Calendar className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Select an appointment to view details</p>
            <p className="text-sm mt-1">Choose from the list on the left</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-5">
            {/* Detail Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-start justify-between mb-5">
                <h3 className="text-xl font-bold text-gray-900">Appointment Details</h3>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${statusColors[selected.status]}`}>{selected.status}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-400 text-xs uppercase tracking-wider">Patient</span><p className="font-medium text-gray-800 mt-0.5">{selected.patient_name}</p></div>
                <div><span className="text-gray-400 text-xs uppercase tracking-wider">Patient Email</span><p className="font-medium text-gray-800 mt-0.5">{selected.patient_email}</p></div>
                <div><span className="text-gray-400 text-xs uppercase tracking-wider">Doctor</span><p className="font-medium text-gray-800 mt-0.5">{selected.doctor_name}</p></div>
                <div><span className="text-gray-400 text-xs uppercase tracking-wider">Specialization</span><p className="font-medium text-gray-800 mt-0.5">{selected.specialization}</p></div>
                <div><span className="text-gray-400 text-xs uppercase tracking-wider">Date</span><p className="font-medium text-gray-800 mt-0.5">{format(new Date(selected.date), 'MMM dd, yyyy')}</p></div>
                <div><span className="text-gray-400 text-xs uppercase tracking-wider">Time</span><p className="font-medium text-gray-800 mt-0.5">{formatTime(selected.time)}</p></div>
                <div><span className="text-gray-400 text-xs uppercase tracking-wider">Fee</span><p className="font-medium text-teal-700 mt-0.5">₹{selected.fees}</p></div>
                <div><span className="text-gray-400 text-xs uppercase tracking-wider">Created</span><p className="font-medium text-gray-800 mt-0.5">{format(new Date(selected.created_at), 'MMM dd, yyyy')}</p></div>
                {selected.reason && (
                  <div className="col-span-2"><span className="text-gray-400 text-xs uppercase tracking-wider">Reason</span><p className="font-medium text-gray-800 mt-0.5">{selected.reason}</p></div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-6 pt-5 border-t border-gray-100 space-y-4">
                {/* Update Status */}
                <div className="flex items-center gap-3">
                  <select
                    value={newStatus || selected.status}
                    onChange={e => setNewStatus(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <button
                    onClick={handleStatusUpdate}
                    disabled={!newStatus || newStatus === selected.status || updatingStatus}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition"
                  >
                    <Check className="w-4 h-4" /> {updatingStatus ? 'Saving…' : 'Update Status'}
                  </button>
                </div>

                {/* Delete */}
                <button onClick={() => handleDelete(selected)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition">
                  <Trash2 className="w-4 h-4" /> Delete Appointment
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
