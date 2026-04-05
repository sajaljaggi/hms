import { useEffect, useState } from 'react';
import { Save, User, AlertCircle, CheckCircle } from 'lucide-react';
import { patientService } from '../../services/patientService';

interface ProfileData {
  name: string; email: string; phone: string; gender: string;
  age: string; weight: string; address: string; city: string; medical_history: string;
  guardian_name: string;
}

export default function Profile() {
  const [form, setForm] = useState<ProfileData>({ name:'', email:'', phone:'', gender:'', age:'', weight:'', address:'', city:'', medical_history:'', guardian_name:'' });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    patientService.getProfile().then(res => {
      const d = res.data.data;
      setForm({
        name: d.name || '', email: d.email || '', phone: d.phone || '',
        gender: d.gender || '', age: d.age?.toString() || '', weight: d.weight?.toString() || '',
        address: d.address || '', city: d.city || '', medical_history: d.medical_history || '',
        guardian_name: d.guardian_name || '',
      });
    }).catch(() => setError('Failed to load profile.')).finally(() => setLoading(false));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setSuccess(false); setError('');
    try {
      await patientService.updateProfile(form);
      setSuccess(true);
    } catch {
      setError('Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-gray-400 text-sm p-8">Loading profile…</p>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>

      {error   && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg"><AlertCircle className="w-4 h-4"/>{error}</div>}
      {success && <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-lg"><CheckCircle className="w-4 h-4"/>Profile updated successfully.</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
        <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center">
            <User className="w-8 h-8 text-teal-600" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-lg">{form.name || 'Patient'}</p>
            <p className="text-sm text-gray-500">{form.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {([
            { label: 'Full Name', name: 'name', type: 'text', placeholder: 'John Doe' },
            { label: 'Father/Spouse Name', name: 'guardian_name', type: 'text', placeholder: 'Name' },
            { label: 'Phone', name: 'phone', type: 'tel', placeholder: '+91 98765 43210' },
            { label: 'City', name: 'city', type: 'text', placeholder: 'Mumbai' },
            { label: 'Age', name: 'age', type: 'number', placeholder: '30' },
            { label: 'Weight (kg)', name: 'weight', type: 'number', placeholder: '70' },
          ] as const).map(field => (
            <div key={field.name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
              <input name={field.name} type={field.type} value={(form as any)[field.name]}
                onChange={handleChange} placeholder={field.placeholder}
                className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-teal-500 focus:border-teal-500" />
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
            <select name="gender" value={form.gender} onChange={handleChange}
              className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-teal-500 focus:border-teal-500">
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input name="address" value={form.address} onChange={handleChange} placeholder="123, Street Name"
            className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-teal-500 focus:border-teal-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Medical History / Existing Conditions</label>
          <textarea name="medical_history" value={form.medical_history} onChange={handleChange}
            rows={4} placeholder="e.g. Diabetes, Hypertension…"
            className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-teal-500 focus:border-teal-500" />
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 bg-teal-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 transition disabled:opacity-60">
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
