import { useEffect, useState } from 'react';
import { Calendar, Clock, Download, AlertCircle } from 'lucide-react';
import { patientService } from '../../services/patientService';
import { format } from 'date-fns';

interface Appointment {
  id: number; status: string; date: string; time: string;
  doctor_name: string; specialization: string; fees: number;
  prescription_notes?: string; prescription_file?: string;
}

const statusColors: Record<string, string> = {
  pending:   'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function History() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    patientService.getAppointments()
      .then(res => setAppointments(res.data.data))
      .catch(() => setError('Could not load appointment history.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Appointment History</h1>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading && <p className="text-gray-400 text-sm">Loading…</p>}

      {!loading && appointments.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          <Calendar className="mx-auto w-10 h-10 mb-2 opacity-40" />
          <p>No appointment history yet.</p>
        </div>
      )}

      <div className="space-y-4">
        {appointments.map(appt => (
          <div key={appt.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex flex-wrap justify-between items-start gap-4">
              <div>
                <p className="font-semibold text-gray-900 text-base">{appt.specialization}</p>
                <p className="text-sm text-gray-500">{appt.doctor_name}</p>
                <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {format(new Date(appt.date), 'MMM dd, yyyy')}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {appt.time}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColors[appt.status]}`}>
                  {appt.status}
                </span>
                <span className="text-sm font-bold text-teal-700">₹{appt.fees}</span>
                {appt.prescription_file && (
                  <a href={appt.prescription_file} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                    <Download className="w-3.5 h-3.5" /> Download Prescription
                  </a>
                )}
              </div>
            </div>
            {appt.prescription_notes && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100 text-sm text-gray-700">
                <p className="font-medium text-gray-600 mb-1">Doctor's Notes:</p>
                {appt.prescription_notes}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
