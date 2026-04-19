import { useEffect, useState } from 'react';
import { Users, Stethoscope, Calendar, Trash2, AlertCircle, Clock, RefreshCw, Ban, Zap } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { format, addDays } from 'date-fns';

interface User { id: number; name: string; email: string; role: string; phone: string; city: string; created_at: string; }
interface Appointment { id: number; patient_name: string; doctor_name: string; specialization: string; date: string; time: string; status: string; }
interface Doctor { id: number; name: string; specialization: string; fees: number; email: string; rating: number; rating_count: number; }
interface Slot { id: number; date: string; time: string; is_booked: number; is_available: number; }

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

// ── Slot Management Tab ───────────────────────────────────────────────────────
function SlotManagement({ doctors }: { doctors: Doctor[] }) {
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [selectedDate, setSelectedDate]     = useState(format(new Date(), 'yyyy-MM-dd'));
  const [slots, setSlots]                   = useState<Slot[]>([]);
  const [loadingSlots,  setLoadingSlots]    = useState(false);
  const [togglingId,    setTogglingId]      = useState<number | null>(null);
  const [actionMsg,     setActionMsg]       = useState('');
  const [actionError,   setActionError]     = useState('');

  const today    = format(new Date(), 'yyyy-MM-dd');
  const maxDate  = format(addDays(new Date(), 14), 'yyyy-MM-dd');

  const flash = (msg: string, isError = false) => {
    if (isError) { setActionError(msg); setActionMsg(''); }
    else         { setActionMsg(msg);   setActionError(''); }
    setTimeout(() => { setActionMsg(''); setActionError(''); }, 3000);
  };

  const loadSlots = async () => {
    if (!selectedDoctor || !selectedDate) return;
    setLoadingSlots(true);
    try {
      const res = await adminService.getSlots(Number(selectedDoctor), selectedDate);
      setSlots(res.data.data);
    } catch {
      flash('Failed to load slots.', true);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleToggle = async (slotId: number) => {
    setTogglingId(slotId);
    try {
      const res = await adminService.toggleSlot(slotId);
      const newAvail = res.data.is_available;
      setSlots(prev => prev.map(s => s.id === slotId ? { ...s, is_available: newAvail } : s));
      flash(newAvail ? 'Slot unblocked.' : 'Slot blocked.');
    } catch (err: any) {
      flash(err?.response?.data?.message || 'Could not toggle slot.', true);
    } finally {
      setTogglingId(null);
    }
  };

  const handleBlockDay = async () => {
    if (!selectedDoctor || !selectedDate) return;
    if (!confirm(`Block all available slots for ${selectedDate}? Booked slots will be unaffected.`)) return;
    try {
      const res = await adminService.blockDay(Number(selectedDoctor), selectedDate);
      flash(`Deleted ${res.data.deleted} slot(s). Reload to refresh grid.`);
      setSlots([]);
    } catch (err: any) {
      flash(err?.response?.data?.message || 'Failed to block day.', true);
    }
  };

  const handleGenerate = async () => {
    if (!selectedDoctor || !selectedDate) return;
    try {
      await adminService.generateSlots(Number(selectedDoctor), selectedDate);
      flash('Slots generated!');
      await loadSlots();
    } catch {
      flash('Failed to generate slots.', true);
    }
  };

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Doctor picker */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Doctor</label>
            <select
              value={selectedDoctor}
              onChange={e => { setSelectedDoctor(e.target.value); setSlots([]); }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              <option value="">Select a doctor…</option>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({d.specialization})</option>
              ))}
            </select>
          </div>

          {/* Date picker */}
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date</label>
            <input
              type="date"
              value={selectedDate}
              min={today}
              max={maxDate}
              onChange={e => { setSelectedDate(e.target.value); setSlots([]); }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={loadSlots}
              disabled={!selectedDoctor || !selectedDate || loadingSlots}
              className="flex items-center gap-1.5 bg-teal-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-teal-700 disabled:opacity-50 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loadingSlots ? 'animate-spin' : ''}`} />
              Load Slots
            </button>
            <button
              onClick={handleGenerate}
              disabled={!selectedDoctor || !selectedDate}
              className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              <Zap className="w-4 h-4" />
              Generate
            </button>
            <button
              onClick={handleBlockDay}
              disabled={!selectedDoctor || !selectedDate}
              className="flex items-center gap-1.5 bg-red-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-red-600 disabled:opacity-50 transition"
            >
              <Ban className="w-4 h-4" />
              Block Day
            </button>
          </div>
        </div>

        {/* Feedback messages */}
        {actionMsg   && <p className="mt-3 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{actionMsg}</p>}
        {actionError && <p className="mt-3 text-sm text-red-600   bg-red-50   rounded-lg px-3 py-2">{actionError}</p>}
      </div>

      {/* Legend */}
      {slots.length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-teal-500 inline-block"></span> Available (click to block)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-300 inline-block"></span> Blocked (click to unblock)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-300 inline-block"></span> Booked by patient</span>
        </div>
      )}

      {/* Slot Grid */}
      {slots.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-600" />
              {slots.length} slots — {selectedDate}
            </h3>
            <span className="text-xs text-gray-400">
              {slots.filter(s => s.is_booked).length} booked &nbsp;·&nbsp;
              {slots.filter(s => !s.is_booked && !s.is_available).length} blocked &nbsp;·&nbsp;
              {slots.filter(s => !s.is_booked && s.is_available).length} available
            </span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
            {slots.map(s => {
              const isBooked   = s.is_booked === 1;
              const isBlocked  = !s.is_booked && !s.is_available;
              const isToggling = togglingId === s.id;

              let cls = '';
              let label = '';
              if (isBooked) {
                cls   = 'bg-red-100 border-red-200 text-red-500 cursor-not-allowed';
                label = 'Booked';
              } else if (isBlocked) {
                cls   = 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200 cursor-pointer';
                label = 'Blocked';
              } else {
                cls   = 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100 cursor-pointer';
                label = 'Open';
              }

              return (
                <button
                  key={s.id}
                  onClick={() => !isBooked && handleToggle(s.id)}
                  disabled={isBooked || isToggling}
                  title={label}
                  className={`relative text-xs font-medium rounded-lg border px-1 py-2 text-center transition-all ${cls} ${isToggling ? 'opacity-50' : ''}`}
                >
                  {formatTime(s.time)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loadingSlots && slots.length === 0 && selectedDoctor && selectedDate && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center text-gray-400">
          <Clock className="mx-auto w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm">Select a doctor and date, then click <strong>Load Slots</strong>.</p>
        </div>
      )}
    </div>
  );
}

// ── Main Admin Dashboard ──────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [users, setUsers]               = useState<User[]>([]);
  const [doctors, setDoctors]           = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [tab, setTab]                   = useState<'users' | 'doctors' | 'appointments' | 'slots'>('users');

  useEffect(() => {
    Promise.all([
      adminService.getUsers(),
      adminService.getDoctors(),
      adminService.getAppointments(),
    ]).then(([u, d, a]) => {
      setUsers(u.data.data);
      setDoctors(d.data.data);
      setAppointments(a.data.data);
    }).catch(() => setError('Failed to load admin data.'))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this user?')) return;
    try {
      await adminService.deleteUser(id);
      setUsers(prev => prev.filter(u => u.id !== id));
    } catch {
      setError('Failed to delete user.');
    }
  };

  const stats = [
    { name: 'Total Patients',      stat: users.filter(u => u.role === 'patient').length, icon: Users,      color: 'text-teal-600',   bg: 'bg-teal-100' },
    { name: 'Total Doctors',       stat: doctors.length,                                  icon: Stethoscope, color: 'text-blue-600',   bg: 'bg-blue-100' },
    { name: 'Total Appointments',  stat: appointments.length,                             icon: Calendar,    color: 'text-orange-500', bg: 'bg-orange-100' },
  ];

  const TABS = [
    { key: 'users',        label: 'Users' },
    { key: 'doctors',      label: 'Doctors' },
    { key: 'appointments', label: 'Appointments' },
    { key: 'slots',        label: 'Slot Management' },
  ] as const;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>

      {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg"><AlertCircle className="w-4 h-4"/>{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {stats.map(item => (
          <div key={item.name} className="relative bg-white pt-5 px-4 pb-4 sm:pt-6 sm:px-6 shadow-sm rounded-xl border border-gray-100 overflow-hidden">
            <dt>
              <div className={`absolute rounded-md p-3 ${item.bg}`}>
                <item.icon className={`h-6 w-6 ${item.color}`} />
              </div>
              <p className="ml-16 text-sm font-medium text-gray-500 truncate">{item.name}</p>
            </dt>
            <dd className="ml-16 pb-2">
              <p className="text-2xl font-semibold text-gray-900">{loading ? '…' : item.stat}</p>
            </dd>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`pb-3 px-4 text-sm font-medium border-b-2 -mb-px transition-colors
              ${tab === t.key ? 'border-teal-500 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-gray-400 text-sm">Loading…</p>}

      {/* Users Table */}
      {!loading && tab === 'users' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Name','Email','Role','City','Joined','Action'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                  <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-1 rounded-full capitalize
                    ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : u.role === 'doctor' ? 'bg-blue-100 text-blue-700' : 'bg-teal-100 text-teal-700'}`}>{u.role}</span></td>
                  <td className="px-4 py-3 text-sm text-gray-500">{u.city || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{format(new Date(u.created_at), 'MMM dd, yyyy')}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(u.id)} className="text-red-400 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Doctors Table */}
      {!loading && tab === 'doctors' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Name','Email','Specialization','Fee','Rating'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {doctors.map(d => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{d.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{d.specialization}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-teal-700">₹{d.fees}</td>
                  <td className="px-4 py-3">
                    {d.rating_count > 0 ? (
                      <span className="text-xs text-amber-500 flex items-center gap-1 font-medium bg-amber-50 px-2 py-1 rounded-md w-fit">
                        ★ {Number(d.rating).toFixed(1)} <span className="text-gray-400">({d.rating_count})</span>
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 italic">No ratings</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Appointments Table */}
      {!loading && tab === 'appointments' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Patient','Doctor','Specialization','Date','Time','Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {appointments.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{a.patient_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{a.doctor_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{a.specialization}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{format(new Date(a.date), 'MMM dd, yyyy')}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{a.time}</td>
                  <td className="px-4 py-3"><span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColors[a.status]}`}>{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Slot Management Tab */}
      {tab === 'slots' && <SlotManagement doctors={doctors} />}
    </div>
  );
}
