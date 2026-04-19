import { useEffect, useState } from 'react';
import { Search, AlertCircle, Trash2, Edit3, X, Check, Users } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { format } from 'date-fns';

interface User {
  id: number; name: string; email: string; role: string; phone: string;
  city: string; age: number | null; gender: string | null; address: string | null;
  guardian_name: string | null; medical_history: string | null; created_at: string;
}

export default function AdminPatients() {
  const [users, setUsers]           = useState<User[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [sortBy, setSortBy]         = useState<'name-asc' | 'name-desc' | 'date-new' | 'date-old'>('name-asc');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing]       = useState(false);
  const [editForm, setEditForm]     = useState({ name: '', phone: '', city: '', address: '' });
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    adminService.getUsers()
      .then(res => {
        const patients = res.data.data.filter((u: User) => u.role === 'patient');
        setUsers(patients);
      })
      .catch(() => setError('Failed to load patients.'))
      .finally(() => setLoading(false));
  }, []);

  // Filtered + sorted
  const filtered = users
    .filter(u => {
      const q = search.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':  return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        case 'date-new':  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'date-old':  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        default: return 0;
      }
    });

  const selected = users.find(u => u.id === selectedId) || null;

  const handleDelete = async (user: User) => {
    if (!confirm(`Delete ${user.name}? This will cancel all their appointments.`)) return;
    try {
      await adminService.deleteUser(user.id);
      setUsers(prev => prev.filter(u => u.id !== user.id));
      if (selectedId === user.id) setSelectedId(null);
    } catch {
      setError('Failed to delete patient.');
    }
  };

  const startEdit = (user: User) => {
    setEditForm({ name: user.name, phone: user.phone || '', city: user.city || '', address: user.address || '' });
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); };

  const saveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await adminService.updateUser(selected.id, editForm);
      setUsers(prev => prev.map(u => u.id === selected.id ? { ...u, ...editForm } : u));
      setEditing(false);
    } catch {
      setError('Failed to update patient.');
    } finally {
      setSaving(false);
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
            <Users className="w-5 h-5 text-teal-600" />
            Patients
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">{filtered.length} patient{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:bg-white transition"
            />
          </div>
        </div>

        {/* Sort */}
        <div className="px-4 py-2 border-b border-gray-100">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            <option value="name-asc">Name A → Z</option>
            <option value="name-desc">Name Z → A</option>
            <option value="date-new">Newest First</option>
            <option value="date-old">Oldest First</option>
          </select>
        </div>

        {/* Patient List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-gray-400 text-sm">No patients found.</div>
          )}
          {filtered.map(u => (
            <button
              key={u.id}
              onClick={() => { setSelectedId(u.id); setEditing(false); }}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-all flex items-center gap-3
                ${selectedId === u.id
                  ? 'bg-teal-50 border-l-4 border-l-teal-500'
                  : 'hover:bg-gray-50 border-l-4 border-l-transparent'}`}
            >
              <div className="w-9 h-9 rounded-full bg-teal-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{u.name}</p>
                <p className="text-xs text-gray-400 truncate">{u.email}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-6 rounded-r-xl">
        {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg mb-4"><AlertCircle className="w-4 h-4" />{error}</div>}

        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Users className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Select a patient to view details</p>
            <p className="text-sm mt-1">Choose from the list on the left</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-5">
            {/* Detail Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-teal-600 text-white flex items-center justify-center text-xl font-bold">
                    {selected.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{selected.name}</h3>
                    <p className="text-sm text-gray-500">{selected.email}</p>
                  </div>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-teal-100 text-teal-700 capitalize">{selected.role}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-400 text-xs uppercase tracking-wider">Phone</span><p className="font-medium text-gray-800 mt-0.5">{selected.phone || '—'}</p></div>
                <div><span className="text-gray-400 text-xs uppercase tracking-wider">City</span><p className="font-medium text-gray-800 mt-0.5">{selected.city || '—'}</p></div>
                <div><span className="text-gray-400 text-xs uppercase tracking-wider">Age</span><p className="font-medium text-gray-800 mt-0.5">{selected.age ?? '—'}</p></div>
                <div><span className="text-gray-400 text-xs uppercase tracking-wider">Gender</span><p className="font-medium text-gray-800 mt-0.5 capitalize">{selected.gender || '—'}</p></div>
                <div className="col-span-2"><span className="text-gray-400 text-xs uppercase tracking-wider">Address</span><p className="font-medium text-gray-800 mt-0.5">{selected.address || '—'}</p></div>
                <div><span className="text-gray-400 text-xs uppercase tracking-wider">Guardian Name</span><p className="font-medium text-gray-800 mt-0.5">{selected.guardian_name || '—'}</p></div>
                <div><span className="text-gray-400 text-xs uppercase tracking-wider">Joined</span><p className="font-medium text-gray-800 mt-0.5">{format(new Date(selected.created_at), 'MMM dd, yyyy')}</p></div>
                {selected.medical_history && (
                  <div className="col-span-2"><span className="text-gray-400 text-xs uppercase tracking-wider">Medical History</span><p className="font-medium text-gray-800 mt-0.5 whitespace-pre-wrap">{selected.medical_history}</p></div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 mt-6 pt-5 border-t border-gray-100">
                <button onClick={() => startEdit(selected)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition">
                  <Edit3 className="w-4 h-4" /> Edit Patient
                </button>
                <button onClick={() => handleDelete(selected)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition">
                  <Trash2 className="w-4 h-4" /> Delete Patient
                </button>
              </div>
            </div>

            {/* Edit Form */}
            {editing && (
              <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 space-y-4">
                <h4 className="text-sm font-semibold text-gray-700">Edit Patient Details</h4>
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
                    <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                    <input type="text" value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                    <input type="text" value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition">
                    <Check className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                  <button onClick={cancelEdit} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition">
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
