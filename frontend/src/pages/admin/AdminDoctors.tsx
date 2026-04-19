import { useEffect, useState } from 'react';
import { Search, AlertCircle, Trash2, Edit3, X, Check, Stethoscope, Plus, ArrowLeft, Star, Calendar } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { format } from 'date-fns';
import SlotManagement from './SlotManagement';

interface Doctor {
  id: number; user_id: number; name: string; email: string; specialization: string;
  fees: number; rating: number; rating_count: number; phone: string; created_at: string;
}

const SPECIALIZATIONS = [
  'Cardiology', 'Dermatology', 'Neurology', 'Orthopedics', 'General Medicine',
];

export default function AdminDoctors() {
  const [doctors, setDoctors]           = useState<Doctor[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [successMsg, setSuccessMsg]     = useState('');
  const [search, setSearch]             = useState('');
  const [sortBy, setSortBy]             = useState<'name' | 'spec'>('name');
  const [selectedId, setSelectedId]     = useState<number | null>(null);
  const [view, setView]                 = useState<'list' | 'add' | 'slots'>('list');

  // Edit state
  const [editing, setEditing]       = useState(false);
  const [editForm, setEditForm]     = useState({ name: '', phone: '', specialization: '', fees: '' });
  const [saving, setSaving]         = useState(false);

  // Add doctor form
  const [addForm, setAddForm]    = useState({ name: '', email: '', password: '', specialization: '', fees: '', phone: '' });
  const [addError, setAddError]  = useState('');
  const [adding, setAdding]      = useState(false);

  const fetchDoctors = () => {
    setLoading(true);
    adminService.getDoctors()
      .then(res => setDoctors(res.data.data))
      .catch(() => setError('Failed to load doctors.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDoctors(); }, []);

  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // Filtered + sorted
  const filtered = doctors
    .filter(d => {
      const q = search.toLowerCase();
      return d.name.toLowerCase().includes(q) || d.specialization.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === 'spec') return a.specialization.localeCompare(b.specialization);
      return a.name.localeCompare(b.name);
    });

  const selected = doctors.find(d => d.id === selectedId) || null;

  // ── Delete ──
  const handleDelete = async (doc: Doctor) => {
    if (!confirm(`Delete Dr. ${doc.name}? This will remove their account and all associated data.`)) return;
    try {
      await adminService.deleteUser(doc.user_id);
      setDoctors(prev => prev.filter(d => d.id !== doc.id));
      if (selectedId === doc.id) setSelectedId(null);
    } catch {
      setError('Failed to delete doctor.');
    }
  };

  // ── Edit ──
  const startEdit = (doc: Doctor) => {
    setEditForm({ name: doc.name, phone: doc.phone || '', specialization: doc.specialization, fees: String(doc.fees) });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await adminService.updateDoctor(selected.id, {
        name: editForm.name,
        phone: editForm.phone,
        specialization: editForm.specialization,
        fees: Number(editForm.fees),
      });
      setDoctors(prev => prev.map(d => d.id === selected.id
        ? { ...d, name: editForm.name, phone: editForm.phone, specialization: editForm.specialization, fees: Number(editForm.fees) }
        : d
      ));
      setEditing(false);
      flash('Doctor updated successfully.');
    } catch {
      setError('Failed to update doctor.');
    } finally {
      setSaving(false);
    }
  };

  // ── Add Doctor ──
  const handleAddDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name || !addForm.email || !addForm.password || !addForm.specialization || !addForm.fees) {
      setAddError('All required fields must be filled.');
      return;
    }
    setAdding(true);
    setAddError('');
    try {
      await adminService.createDoctor({
        name: addForm.name,
        email: addForm.email,
        password: addForm.password,
        specialization: addForm.specialization,
        fees: Number(addForm.fees),
        phone: addForm.phone || undefined,
      });
      setAddForm({ name: '', email: '', password: '', specialization: '', fees: '', phone: '' });
      flash('Doctor added successfully!');
      fetchDoctors();
      setView('list');
    } catch (err: any) {
      setAddError(err?.response?.data?.message || 'Failed to add doctor.');
    } finally {
      setAdding(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div></div>;

  // ── Sub-view: Add Doctor ──
  if (view === 'add') {
    return (
      <div className="max-w-xl mx-auto py-4">
        <button onClick={() => setView('list')} className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 font-medium mb-5 transition">
          <ArrowLeft className="w-4 h-4" /> Back to Doctors
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-5 flex items-center gap-2">
            <Plus className="w-5 h-5 text-teal-600" /> Add New Doctor
          </h2>

          {addError && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg mb-4"><AlertCircle className="w-4 h-4" />{addError}</div>}

          <form onSubmit={handleAddDoctor} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
                <input type="text" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} required
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
                <input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} required
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Password *</label>
                <input type="password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} required
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Specialization *</label>
                <select value={addForm.specialization} onChange={e => setAddForm(f => ({ ...f, specialization: e.target.value }))} required
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
                  <option value="">Select…</option>
                  {SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Fee (₹) *</label>
                <input type="number" value={addForm.fees} onChange={e => setAddForm(f => ({ ...f, fees: e.target.value }))} required min="0"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                <input type="text" value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
            </div>
            <div className="pt-2">
              <button type="submit" disabled={adding} className="w-full flex items-center justify-center gap-2 bg-teal-600 text-white py-2.5 rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50 transition">
                <Plus className="w-4 h-4" /> {adding ? 'Adding…' : 'Add Doctor'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ── Sub-view: Slot Management ──
  if (view === 'slots') {
    return (
      <div>
        <button onClick={() => setView('list')} className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 font-medium mb-5 transition">
          <ArrowLeft className="w-4 h-4" /> Back to Doctors
        </button>
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-teal-600" /> Slot Management
        </h2>
        <SlotManagement doctors={doctors} />
      </div>
    );
  }

  // ── Sub-view: Doctor List (default) ──
  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0">
      {/* ── Side Panel ── */}
      <div className="w-[280px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col rounded-l-xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-teal-600" />
            Doctors
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">{filtered.length} doctor{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search name or specialty…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:bg-white transition"
            />
          </div>
        </div>

        {/* Sort */}
        <div className="px-4 py-2 border-b border-gray-100">
          <div className="flex gap-1.5">
            <button onClick={() => setSortBy('name')} className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition ${sortBy === 'name' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              By Name
            </button>
            <button onClick={() => setSortBy('spec')} className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition ${sortBy === 'spec' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              By Specialty
            </button>
          </div>
        </div>

        {/* Doctor List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-gray-400 text-sm">No doctors found.</div>
          )}
          {filtered.map(d => (
            <button
              key={d.id}
              onClick={() => { setSelectedId(d.id); setEditing(false); }}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-all flex items-center gap-3
                ${selectedId === d.id
                  ? 'bg-teal-50 border-l-4 border-l-teal-500'
                  : 'hover:bg-gray-50 border-l-4 border-l-transparent'}`}
            >
              <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                {d.name.replace(/^Dr\.\s*/, '').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{d.name}</p>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400 truncate">{d.specialization}</p>
                  {d.rating_count > 0 && (
                    <span className="text-xs text-amber-500 font-medium flex items-center gap-0.5 flex-shrink-0 ml-1">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {Number(d.rating).toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Bottom buttons */}
        <div className="p-3 border-t border-gray-100 space-y-2">
          <button onClick={() => setView('add')} className="w-full flex items-center justify-center gap-2 bg-teal-600 text-white py-2.5 text-sm font-medium rounded-lg hover:bg-teal-700 transition">
            <Plus className="w-4 h-4" /> Add Doctor
          </button>
          <button onClick={() => setView('slots')} className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-700 py-2.5 text-sm font-medium rounded-lg hover:bg-gray-50 transition">
            <Calendar className="w-4 h-4" /> Slot Management
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-6 rounded-r-xl">
        {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg mb-4"><AlertCircle className="w-4 h-4" />{error}</div>}
        {successMsg && <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-lg mb-4"><Check className="w-4 h-4" />{successMsg}</div>}

        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Stethoscope className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Select a doctor to view details</p>
            <p className="text-sm mt-1">Choose from the list on the left</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-5">
            {/* Detail Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold">
                    {selected.name.replace(/^Dr\.\s*/, '').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{selected.name}</h3>
                    <p className="text-sm text-gray-500">{selected.email}</p>
                  </div>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">{selected.specialization}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-400 text-xs uppercase tracking-wider">Phone</span><p className="font-medium text-gray-800 mt-0.5">{selected.phone || '—'}</p></div>
                <div><span className="text-gray-400 text-xs uppercase tracking-wider">Fee</span><p className="font-medium text-teal-700 mt-0.5">₹{selected.fees}</p></div>
                <div>
                  <span className="text-gray-400 text-xs uppercase tracking-wider">Rating</span>
                  <p className="font-medium text-gray-800 mt-0.5 flex items-center gap-1">
                    {selected.rating_count > 0 ? (
                      <>
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                        {Number(selected.rating).toFixed(1)}
                        <span className="text-gray-400 text-xs">({selected.rating_count} reviews)</span>
                      </>
                    ) : (
                      <span className="text-gray-400 italic">No ratings yet</span>
                    )}
                  </p>
                </div>
                <div><span className="text-gray-400 text-xs uppercase tracking-wider">Joined</span><p className="font-medium text-gray-800 mt-0.5">{format(new Date(selected.created_at), 'MMM dd, yyyy')}</p></div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 mt-6 pt-5 border-t border-gray-100">
                <button onClick={() => startEdit(selected)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition">
                  <Edit3 className="w-4 h-4" /> Edit Doctor
                </button>
                <button onClick={() => handleDelete(selected)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition">
                  <Trash2 className="w-4 h-4" /> Delete Doctor
                </button>
              </div>
            </div>

            {/* Edit Form */}
            {editing && (
              <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 space-y-4">
                <h4 className="text-sm font-semibold text-gray-700">Edit Doctor Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                    <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                    <input type="text" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Specialization</label>
                    <select value={editForm.specialization} onChange={e => setEditForm(f => ({ ...f, specialization: e.target.value }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
                      {SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Fee (₹)</label>
                    <input type="number" value={editForm.fees} onChange={e => setEditForm(f => ({ ...f, fees: e.target.value }))} min="0"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition">
                    <Check className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                  <button onClick={() => setEditing(false)} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition">
                    <X className="w-4 h-4" /> Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
