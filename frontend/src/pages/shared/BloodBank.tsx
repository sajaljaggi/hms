import { useCallback, useEffect, useState } from 'react';
import { Droplet } from 'lucide-react';
import { bloodBankService } from '../../services/bloodBankService';
import { useAuth } from '../../context/useAuth';
import PatientPicker from '../../components/PatientPicker';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { formatDbDate, localDateInput } from '../../utils/dates';
import type {
  BloodComponent, BloodDonor, BloodGroup, BloodInventoryRow, BloodRequest, BloodUnit, BloodUnitStatus, BloodUrgency,
  PatientSearchResult,
} from '../../types/modules';

const GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COMPONENTS: BloodComponent[] = ['whole_blood', 'packed_rbc', 'plasma', 'platelets'];
const LOW_STOCK = 5;
const label = (c: string) => c.replace('_', ' ');

const input = 'border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
const btn = 'px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50';
const Alert = ({ msg }: { msg: string }) => (msg ? <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-2">{msg}</div> : null);

type Tab = 'inventory' | 'requests' | 'donors' | 'units';

export default function BloodBank() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState<Tab>('inventory');
  const tabs: Tab[] = isAdmin ? ['inventory', 'requests', 'donors', 'units'] : ['inventory', 'requests'];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Droplet className="h-6 w-6 text-red-600" /> Blood Bank</h1>
      <div role="tablist" className="flex gap-2 border-b border-gray-200">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px ${tab === t ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'inventory' && <InventoryTab />}
      {tab === 'requests' && <RequestsTab isAdmin={isAdmin} userId={user?.id} />}
      {tab === 'donors' && isAdmin && <DonorsTab />}
      {tab === 'units' && isAdmin && <UnitsTab />}
    </div>
  );
}

function InventoryTab() {
  const [rows, setRows] = useState<BloodInventoryRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    bloodBankService.getInventory()
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(getErrorMessage(err, 'Failed to load inventory')))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500">Loading inventory...</p>;
  const cell = (g: BloodGroup, c: BloodComponent) => rows.find((r) => r.blood_group === g && r.component === c);

  return (
    <div className="space-y-3">
      <Alert msg={error} />
      <p className="text-xs text-gray-500">Cells show available units. Below {LOW_STOCK} is highlighted. Expiring soon in brackets.</p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm bg-white border border-gray-200 rounded-lg">
          <thead><tr className="bg-gray-50 text-left">
            <th className="px-3 py-2">Group</th>
            {COMPONENTS.map((c) => <th key={c} className="px-3 py-2 capitalize">{label(c)}</th>)}
          </tr></thead>
          <tbody>
            {GROUPS.map((g) => (
              <tr key={g} className="border-t border-gray-100">
                <th scope="row" className="px-3 py-2 text-left font-semibold">{g}</th>
                {COMPONENTS.map((c) => {
                  const r = cell(g, c);
                  const available = r?.available ?? 0;
                  const expiring = r?.expiring_soon ?? 0;
                  const low = available < LOW_STOCK;
                  return (
                    <td key={c} data-testid={`inv-${g}-${c}`} data-low={low} className={`px-3 py-2 ${low ? 'bg-red-50 text-red-700 font-semibold' : ''}`}>
                      {available}{expiring > 0 && <span className="text-amber-600 text-xs ml-1">({expiring} expiring)</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RequestsTab({ isAdmin, userId }: { isAdmin: boolean; userId?: number }) {
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rowError, setRowError] = useState<{ id: number; msg: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [patient, setPatient] = useState<PatientSearchResult | null>(null);
  const [form, setForm] = useState({ bloodGroup: 'O+' as BloodGroup, component: 'packed_rbc' as BloodComponent, units: '1', urgency: 'routine' as BloodUrgency });

  const load = useCallback(async () => {
    try {
      const res = await bloodBankService.getRequests();
      setRequests(res.data.data);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load requests'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rowAction = async (r: BloodRequest, kind: 'fulfill' | 'reject' | 'cancel') => {
    setPending(`${kind}-${r.id}`);
    setRowError(null);
    try {
      if (kind === 'fulfill') await bloodBankService.fulfillRequest(r.id);
      else if (kind === 'reject') await bloodBankService.rejectRequest(r.id);
      else await bloodBankService.cancelRequest(r.id);
      await load();
    } catch (err) {
      // e.g. 409 insufficient stock, shown inline on the row
      setRowError({ id: r.id, msg: getErrorMessage(err, `Failed to ${kind} request`) });
    } finally {
      setPending(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return;
    setPending('create');
    setError('');
    try {
      await bloodBankService.createRequest({
        patientId: patient.id, bloodGroup: form.bloodGroup, component: form.component,
        unitsRequested: Number(form.units), urgency: form.urgency,
      });
      setShowForm(false);
      setPatient(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create request'));
    } finally {
      setPending(null);
    }
  };

  if (loading) return <p className="text-gray-500">Loading requests...</p>;

  return (
    <div className="space-y-4">
      <Alert msg={error} />
      <button type="button" className={`${btn} bg-teal-600 text-white`} onClick={() => setShowForm((s) => !s)}>New request</button>
      {showForm && (
        <form onSubmit={submit} aria-label="New blood request" className="bg-white border border-gray-200 rounded-lg p-4 grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2"><PatientPicker value={patient} onChange={setPatient} /></div>
          <label className="text-sm">Blood group
            <select className={`${input} w-full mt-1`} value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value as BloodGroup })}>
              {GROUPS.map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
          <label className="text-sm">Component
            <select className={`${input} w-full mt-1`} value={form.component} onChange={(e) => setForm({ ...form, component: e.target.value as BloodComponent })}>
              {COMPONENTS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
          </label>
          <label className="text-sm">Units
            <input type="number" min={1} max={10} className={`${input} w-full mt-1`} value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} />
          </label>
          <label className="text-sm">Urgency
            <select className={`${input} w-full mt-1`} value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value as BloodUrgency })}>
              {(['routine', 'urgent', 'emergency'] as BloodUrgency[]).map((u) => <option key={u}>{u}</option>)}
            </select>
          </label>
          <div className="md:col-span-2">
            <button type="submit" disabled={!patient || pending === 'create'} className={`${btn} bg-teal-600 text-white`}>{pending === 'create' ? 'Submitting...' : 'Submit request'}</button>
          </div>
        </form>
      )}
      {requests.length === 0 && <p className="text-sm text-gray-500">No requests.</p>}
      <ul className="space-y-2">
        {requests.map((r) => (
          <li key={r.id} className="bg-white border border-gray-200 rounded-lg p-3 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                <strong>{r.patient_name}</strong>: {r.units_requested} x {r.blood_group} {label(r.component)} ({r.urgency}) - <span className="capitalize">{r.status}</span>
              </span>
              {r.status === 'pending' && (
                <span className="flex gap-2">
                  {isAdmin && <>
                    <button type="button" className={`${btn} bg-teal-600 text-white`} disabled={pending !== null} onClick={() => rowAction(r, 'fulfill')}>Fulfill</button>
                    <button type="button" className={`${btn} border border-red-300 text-red-700`} disabled={pending !== null} onClick={() => rowAction(r, 'reject')}>Reject</button>
                  </>}
                  {r.requested_by === userId && (
                    <button type="button" className={`${btn} border border-gray-300`} disabled={pending !== null} onClick={() => rowAction(r, 'cancel')}>Cancel</button>
                  )}
                </span>
              )}
            </div>
            {rowError?.id === r.id && <p role="alert" className="text-sm text-red-700">{rowError.msg}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DonorsTab() {
  const [donors, setDonors] = useState<BloodDonor[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [donorForm, setDonorForm] = useState<{ name: string; bloodGroup: BloodGroup; phone: string; email: string } | null>(null);
  const [donation, setDonation] = useState<{ donorId: number; component: BloodComponent; volumeMl: string; collectedOn: string } | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await bloodBankService.getDonors({ q: q.trim() || undefined });
      setDonors(res.data.data);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load donors'));
    } finally {
      setLoading(false);
    }
  }, [q]);
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const submitDonor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!donorForm) return;
    setPending('donor');
    setError('');
    try {
      await bloodBankService.createDonor({
        name: donorForm.name.trim(), bloodGroup: donorForm.bloodGroup, phone: donorForm.phone.trim(), email: donorForm.email.trim() || undefined,
      });
      setDonorForm(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to add donor'));
    } finally {
      setPending(null);
    }
  };

  const submitDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!donation) return;
    setPending('donation');
    setError('');
    try {
      const res = await bloodBankService.recordDonation({
        donorId: donation.donorId, component: donation.component, volumeMl: Number(donation.volumeMl), collectedOn: donation.collectedOn,
      });
      setNotice(`Donation recorded, expires ${formatDbDate(res.data.data.expiresOn)}`);
      setDonation(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to record donation'));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-4">
      <Alert msg={error} />
      {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
      <div className="flex gap-3">
        <input type="search" aria-label="Search donors" placeholder="Search donors" className={input} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className={`${btn} bg-teal-600 text-white`} onClick={() => setDonorForm({ name: '', bloodGroup: 'O+', phone: '', email: '' })}>Add donor</button>
      </div>
      {donorForm && (
        <form onSubmit={submitDonor} aria-label="Add donor" className="bg-white border border-gray-200 rounded-lg p-4 grid md:grid-cols-2 gap-3">
          <label className="text-sm">Name<input required className={`${input} w-full mt-1`} value={donorForm.name} onChange={(e) => setDonorForm({ ...donorForm, name: e.target.value })} /></label>
          <label className="text-sm">Blood group
            <select className={`${input} w-full mt-1`} value={donorForm.bloodGroup} onChange={(e) => setDonorForm({ ...donorForm, bloodGroup: e.target.value as BloodGroup })}>
              {GROUPS.map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
          <label className="text-sm">Phone<input required className={`${input} w-full mt-1`} value={donorForm.phone} onChange={(e) => setDonorForm({ ...donorForm, phone: e.target.value })} /></label>
          <label className="text-sm">Email<input type="email" className={`${input} w-full mt-1`} value={donorForm.email} onChange={(e) => setDonorForm({ ...donorForm, email: e.target.value })} /></label>
          <div className="md:col-span-2 flex gap-2">
            <button type="submit" disabled={pending === 'donor'} className={`${btn} bg-teal-600 text-white`}>{pending === 'donor' ? 'Saving...' : 'Save donor'}</button>
            <button type="button" className={`${btn} border border-gray-300`} onClick={() => setDonorForm(null)}>Cancel</button>
          </div>
        </form>
      )}
      {donation && (
        <form onSubmit={submitDonation} aria-label="Record donation" className="bg-white border border-gray-200 rounded-lg p-4 grid md:grid-cols-3 gap-3">
          <label className="text-sm">Component
            <select className={`${input} w-full mt-1`} value={donation.component} onChange={(e) => setDonation({ ...donation, component: e.target.value as BloodComponent })}>
              {COMPONENTS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
          </label>
          <label className="text-sm">Volume (ml)<input type="number" min={100} max={600} required className={`${input} w-full mt-1`} value={donation.volumeMl} onChange={(e) => setDonation({ ...donation, volumeMl: e.target.value })} /></label>
          <label className="text-sm">Collected on<input type="date" required max={localDateInput()} className={`${input} w-full mt-1`} value={donation.collectedOn} onChange={(e) => setDonation({ ...donation, collectedOn: e.target.value })} /></label>
          <div className="md:col-span-3 flex gap-2">
            <button type="submit" disabled={pending === 'donation'} className={`${btn} bg-teal-600 text-white`}>{pending === 'donation' ? 'Saving...' : 'Save donation'}</button>
            <button type="button" className={`${btn} border border-gray-300`} onClick={() => setDonation(null)}>Cancel</button>
          </div>
        </form>
      )}
      {loading ? <p className="text-gray-500">Loading donors...</p> : donors.length === 0 ? <p className="text-sm text-gray-500">No donors.</p> : (
        <table className="min-w-full text-sm bg-white border border-gray-200 rounded-lg">
          <thead><tr className="bg-gray-50 text-left"><th className="px-3 py-2">Name</th><th className="px-3 py-2">Group</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Last donation</th><th /></tr></thead>
          <tbody>
            {donors.map((d) => (
              <tr key={d.id} className="border-t border-gray-100">
                <td className="px-3 py-2">{d.name}</td><td className="px-3 py-2">{d.blood_group}</td><td className="px-3 py-2">{d.phone}</td>
                <td className="px-3 py-2">{formatDbDate(d.last_donation_date)}</td>
                <td className="px-3 py-2"><button type="button" className="text-teal-700 hover:underline" onClick={() => setDonation({ donorId: d.id, component: 'whole_blood', volumeMl: '450', collectedOn: localDateInput() })}>Record donation</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function UnitsTab() {
  const [units, setUnits] = useState<BloodUnit[]>([]);
  const [filters, setFilters] = useState<{ bloodGroup: '' | BloodGroup; component: '' | BloodComponent; status: '' | BloodUnitStatus }>({ bloodGroup: '', component: '', status: 'available' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await bloodBankService.getUnits({
        bloodGroup: filters.bloodGroup || undefined, component: filters.component || undefined, status: filters.status || undefined,
      });
      setUnits(res.data.data);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load units'));
    } finally {
      setLoading(false);
    }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const discard = async (u: BloodUnit) => {
    if (!window.confirm(`Discard unit #${u.id}?`)) return;
    setPending(u.id);
    setError('');
    try {
      await bloodBankService.discardUnit(u.id);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to discard unit'));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-4">
      <Alert msg={error} />
      <div className="flex flex-wrap gap-3">
        <select aria-label="Group filter" className={input} value={filters.bloodGroup} onChange={(e) => setFilters({ ...filters, bloodGroup: e.target.value as '' | BloodGroup })}>
          <option value="">All groups</option>{GROUPS.map((g) => <option key={g}>{g}</option>)}
        </select>
        <select aria-label="Component filter" className={input} value={filters.component} onChange={(e) => setFilters({ ...filters, component: e.target.value as '' | BloodComponent })}>
          <option value="">All components</option>{COMPONENTS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
        </select>
        <select aria-label="Status filter" className={input} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as '' | BloodUnitStatus })}>
          <option value="">All statuses</option>{(['available', 'issued', 'expired', 'discarded'] as BloodUnitStatus[]).map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {loading ? <p className="text-gray-500">Loading units...</p> : units.length === 0 ? <p className="text-sm text-gray-500">No units.</p> : (
        <table className="min-w-full text-sm bg-white border border-gray-200 rounded-lg">
          <thead><tr className="bg-gray-50 text-left">
            {['#', 'Group', 'Component', 'Volume', 'Collected', 'Expires', 'Status', ''].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}
          </tr></thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id} className="border-t border-gray-100">
                <td className="px-3 py-2">{u.id}</td><td className="px-3 py-2">{u.blood_group}</td><td className="px-3 py-2 capitalize">{label(u.component)}</td>
                <td className="px-3 py-2">{u.volume_ml} ml</td><td className="px-3 py-2">{formatDbDate(u.collected_on)}</td><td className="px-3 py-2">{formatDbDate(u.expires_on)}</td>
                <td className="px-3 py-2 capitalize">{u.status}</td>
                <td className="px-3 py-2">{u.status === 'available' && (
                  <button type="button" disabled={pending === u.id} className="text-red-700 hover:underline disabled:opacity-50" onClick={() => discard(u)}>{pending === u.id ? 'Discarding...' : 'Discard'}</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
