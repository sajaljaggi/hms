import { useEffect, useState } from 'react';
import { FileText, Calendar, Clock } from 'lucide-react';
import { patientService } from '../../services/patientService';
import { format } from 'date-fns';

interface Record {
  id: number; notes: string; file_url?: string; created_at: string;
  doctor_name: string; specialization: string; date: string; time: string; status: string;
}

export default function MedicalHistory() {
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    patientService.getMedicalHistory()
      .then(res => setRecords(res.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Medical History</h1>

      {loading && <p className="text-gray-400 text-sm">Loading…</p>}

      {!loading && records.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          <FileText className="mx-auto w-10 h-10 mb-2 opacity-40" />
          <p>No medical records found. Completed appointments will appear here.</p>
        </div>
      )}

      <div className="grid gap-5 grid-cols-1 md:grid-cols-2">
        {records.map(r => (
          <div key={r.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="font-bold text-gray-900">{r.specialization}</p>
                <p className="text-sm text-gray-500">{r.doctor_name}</p>
              </div>
              <FileText className="w-5 h-5 text-teal-400 shrink-0 mt-1" />
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {format(new Date(r.date), 'MMM dd, yyyy')}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {r.time}
              </span>
            </div>
            {r.notes && (
              <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700 border border-gray-100 mb-3">
                {r.notes}
              </div>
            )}
            {r.file_url && (
              <a href={r.file_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                <FileText className="w-3.5 h-3.5" /> View Attached File
              </a>
            )}
            {!r.notes && !r.file_url && (
              <p className="text-xs text-gray-400 italic">No notes or files attached.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
