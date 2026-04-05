import { useEffect, useState } from 'react';
import { Calendar, Clock, Activity, FileText, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { patientService } from '../../services/patientService';
import { format } from 'date-fns';

interface Appointment {
  id: number; status: string; date: string; time: string;
  doctor_name: string; specialization: string; fees: number;
}

const statusColors: Record<string, string> = {
  pending:   'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function Dashboard() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    patientService.getAppointments()
      .then(res => setAppointments(res.data.data))
      .catch(() => setError('Could not load appointments.'))
      .finally(() => setLoading(false));
  }, []);

  const upcoming = appointments.filter(a => a.status === 'pending');

  const stats = [
    { name: 'Upcoming Appointments', stat: upcoming.length, icon: Clock,     color: 'text-orange-500', bg: 'bg-orange-100' },
    { name: 'Total Appointments',    stat: appointments.length, icon: Activity, color: 'text-teal-600',   bg: 'bg-teal-100'   },
    { name: 'Completed',             stat: appointments.filter(a => a.status === 'completed').length, icon: FileText, color: 'text-blue-500', bg: 'bg-blue-100' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back, {user?.name}</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((item) => (
          <div key={item.name} className="relative bg-white pt-5 px-4 pb-4 sm:pt-6 sm:px-6 shadow-sm rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            <dt>
              <div className={`absolute rounded-md p-3 ${item.bg}`}>
                <item.icon className={`h-6 w-6 ${item.color}`} />
              </div>
              <p className="ml-16 text-sm font-medium text-gray-500 truncate">{item.name}</p>
            </dt>
            <dd className="ml-16 pb-2 flex items-baseline sm:pb-3">
              <p className="text-2xl font-semibold text-gray-900">
                {loading ? '…' : item.stat}
              </p>
            </dd>
          </div>
        ))}
      </div>

      {/* Upcoming Appointments */}
      <div className="bg-white shadow-sm rounded-xl border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Upcoming Appointments</h2>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-4">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {loading && <p className="text-gray-400 text-sm">Loading…</p>}

        {!loading && upcoming.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <Calendar className="mx-auto w-10 h-10 mb-2 opacity-40" />
            <p>No upcoming appointments. Book one now!</p>
          </div>
        )}

        <div className="divide-y divide-gray-50">
          {upcoming.slice(0, 5).map(a => (
            <div key={a.id} className="flex items-center py-4 gap-4 hover:bg-gray-50 rounded-lg px-2 transition">
              <div className="h-12 w-12 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                <Calendar className="h-6 w-6 text-teal-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{a.specialization}</p>
                <p className="text-sm text-gray-500">{a.doctor_name}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-gray-900">{format(new Date(a.date), 'MMM dd, yyyy')}</p>
                <p className="text-xs text-gray-500">{a.time}</p>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColors[a.status]}`}>
                {a.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
