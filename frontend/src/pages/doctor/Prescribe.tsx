import { useEffect, useState } from 'react';
import { FileText, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { doctorService } from '../../services/doctorService';

interface Appointment { id: number; patient_name: string; patient_id: number; date: string; time: string; status: string; }

export default function Prescribe() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [apptId, setApptId]   = useState('');
  const [patientId, setPatientId] = useState('');
  const [notes, setNotes]     = useState('');
  const [file, setFile]       = useState<File | null>(null);
  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    doctorService.getAppointments({ })
      .then(res => setAppointments(res.data.data.filter((a: Appointment) => a.status !== 'cancelled')))
      .catch(() => {});
  }, []);

  // Auto-fill patient id when appointment selected
  const handleApptChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setApptId(id);
    const appt = appointments.find(a => a.id === parseInt(id));
    setPatientId(appt ? String((appt as any).patient_id) : '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apptId || !patientId) { setError('Please select an appointment.'); return; }
    setSaving(true); setError(''); setSuccess(false);
    const formData = new FormData();
    formData.append('appointmentId', apptId);
    formData.append('patientId', patientId);
    formData.append('notes', notes);
    if (file) formData.append('file', file);
    try {
      await doctorService.createPrescription(formData);
      setSuccess(true);
      setNotes(''); setFile(null); setApptId(''); setPatientId('');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save prescription.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Write Prescription</h1>

      {error   && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg"><AlertCircle className="w-4 h-4"/>{error}</div>}
      {success && <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-lg"><CheckCircle className="w-4 h-4"/>Prescription saved and appointment marked completed!</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Appointment</label>
          <select value={apptId} onChange={handleApptChange} required
            className="block w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-teal-500 focus:border-teal-500">
            <option value="">-- Choose appointment --</option>
            {appointments.map(a => (
              <option key={a.id} value={a.id}>
                {a.patient_name} — {a.date} {a.time}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Clinical Notes / Prescription</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={6} required
            placeholder="Enter diagnosis, medications, instructions…"
            className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-teal-500 focus:border-teal-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Attach File (optional — PDF/image)</label>
          <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition">
            <Upload className="w-6 h-6 text-gray-400 mb-1" />
            <span className="text-sm text-gray-500">{file ? file.name : 'Click to upload'}</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
          </label>
        </div>

        <button type="submit" disabled={saving}
          className="flex items-center gap-2 bg-teal-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 transition w-full justify-center disabled:opacity-60">
          <FileText className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save Prescription'}
        </button>
      </form>
    </div>
  );
}
