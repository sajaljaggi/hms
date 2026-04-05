import { useEffect, useState } from 'react';
import { Search, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { doctorService } from '../../services/doctorService';
import { format } from 'date-fns';

interface Appointment {
  id: number; status: string; date: string; time: string;
  patient_name: string; patient_email: string; patient_phone: string; age: number; gender: string;
}

const statusColors: Record<string, string> = {
  pending:   'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function DoctorAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter]       = useState('');
  const [patientFilter, setPatientFilter] = useState('');
  const [error, setError] = useState('');

  const fetchData = () => {
    setLoading(true);
    doctorService.getAppointments({ date: dateFilter || undefined, patient: patientFilter || undefined })
      .then(res => setAppointments(res.data.data))
      .catch(() => setError('Failed to load appointments.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const updateStatus = async (id: number, status: string) => {
    try {
      await doctorService.updateStatus(id, status);
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    } catch {
      setError('Failed to update status.');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My Appointments</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-teal-500 focus:border-teal-500" />
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input placeholder="Search patient…" value={patientFilter} onChange={e => setPatientFilter(e.target.value)}
            className="pl-9 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-teal-500 focus:border-teal-500" />
        </div>
        <button onClick={fetchData} className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition">
          Filter
        </button>
      </div>

      {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg"><AlertCircle className="w-4 h-4"/> {error}</div>}
      {loading && <p className="text-gray-400 text-sm">Loading…</p>}

      {!loading && appointments.length === 0 && (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          <Clock className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>No appointments found.</p>
        </div>
      )}

      <div className="space-y-4">
        {appointments.map(appt => (
          <div key={appt.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex flex-wrap justify-between items-start gap-4">
              <div>
                <p className="font-bold text-gray-900">{appt.patient_name}</p>
                <p className="text-sm text-gray-500">{appt.patient_email} • {appt.patient_phone}</p>
                <p className="text-sm text-gray-500">{appt.age ? `${appt.age} yrs` : ''}{appt.gender ? ` • ${appt.gender}` : ''}</p>
                <p className="text-sm text-teal-700 font-medium mt-1">
                  {format(new Date(appt.date), 'MMM dd, yyyy')} at {appt.time}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColors[appt.status]}`}>
                  {appt.status}
                </span>
                {appt.status === 'pending' && (
                  <div className="flex gap-2">
                    <button onClick={() => updateStatus(appt.id, 'completed')}
                      className="flex items-center gap-1 text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 transition">
                      <CheckCircle className="w-3.5 h-3.5" /> Complete
                    </button>
                    <button onClick={() => updateStatus(appt.id, 'cancelled')}
                      className="flex items-center gap-1 text-xs font-medium bg-red-100 text-red-700 px-3 py-1.5 rounded-md hover:bg-red-200 transition">
                      <XCircle className="w-3.5 h-3.5" /> Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
