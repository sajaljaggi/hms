import { useEffect, useState } from 'react';
import { Users, Stethoscope, Calendar, Trash2, AlertCircle } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { format } from 'date-fns';

interface User { id: number; name: string; email: string; role: string; phone: string; city: string; created_at: string; }
interface Appointment { id: number; patient_name: string; doctor_name: string; specialization: string; date: string; time: string; status: string; }
interface Doctor { id: number; name: string; specialization: string; fees: number; email: string; }

const statusColors: Record<string, string> = {
  pending:   'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function AdminDashboard() {
  const [users, setUsers]       = useState<User[]>([]);
  const [doctors, setDoctors]   = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [tab, setTab]           = useState<'users' | 'doctors' | 'appointments'>('users');

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
    { name: 'Total Patients', stat: users.filter(u => u.role === 'patient').length, icon: Users, color: 'text-teal-600', bg: 'bg-teal-100' },
    { name: 'Total Doctors', stat: doctors.length, icon: Stethoscope, color: 'text-blue-600', bg: 'bg-blue-100' },
    { name: 'Total Appointments', stat: appointments.length, icon: Calendar, color: 'text-orange-500', bg: 'bg-orange-100' },
  ];

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
        {(['users','doctors','appointments'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`pb-3 px-4 text-sm font-medium capitalize border-b-2 -mb-px transition-colors
              ${tab === t ? 'border-teal-500 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t}
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
                    <button onClick={() => handleDelete(u.id)}
                      className="text-red-400 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
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
                {['Name','Email','Specialization','Fee'].map(h => (
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
    </div>
  );
}
