import { useCallback, useEffect, useState } from 'react';
import { BedDouble, Plus } from 'lucide-react';
import { bedService } from '../../services/bedService';
import { useAuth } from '../../context/useAuth';
import PatientPicker from '../../components/PatientPicker';
import { BedRequestsTab, MyPatientsTab } from './BedRequests';
import { getErrorMessage } from '../../utils/getErrorMessage';
import type { Bed, BedStats, BedStatus, PatientSearchResult, Ward, WardType } from '../../types/modules';

const STATUS_STYLE: Record<BedStatus, string> = {
  available: 'bg-green-50 border-green-300 text-green-800',
  occupied: 'bg-red-50 border-red-300 text-red-800',
  maintenance: 'bg-gray-100 border-gray-300 text-gray-700',
  reserved: 'bg-amber-50 border-amber-300 text-amber-800',
};
const WARD_TYPES: WardType[] = ['general', 'icu', 'emergency', 'maternity', 'pediatric', 'private'];
const SETTABLE: Exclude<BedStatus, 'occupied'>[] = ['available', 'maintenance', 'reserved'];

// Only the admin assigns and discharges. Doctors see availability, their admitted patients, and their requests.
type Tab = 'beds' | 'requests' | 'my patients';

export default function BedManagement() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const tabs: Tab[] = isAdmin ? ['beds', 'requests'] : ['my patients', 'requests'];
  const [tab, setTab] = useState<Tab>(tabs[0]);

  const [wards, setWards] = useState<Ward[]>([]);
  const [stats, setStats] = useState<BedStats | null>(null);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [wardFilter, setWardFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | BedStatus>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState('');

  const [allocBed, setAllocBed] = useState<Bed | null>(null);
  const [patient, setPatient] = useState<PatientSearchResult | null>(null);
  const [reason, setReason] = useState('');
  const [wardForm, setWardForm] = useState<{ name: string; wardType: WardType; floor: string } | null>(null);
  const [bedForm, setBedForm] = useState<{ wardId: string; bedNumber: string; dailyRate: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, s, b] = await Promise.all([
        bedService.getWards(),
        bedService.getStats(),
        // Who is in which bed is the admin's view only.
        isAdmin ? bedService.getBeds({
          wardId: wardFilter ? Number(wardFilter) : undefined,
          status: statusFilter || undefined,
        }) : Promise.resolve(null),
      ]);
      setWards(w.data.data);
      setStats(s.data.data);
      if (b) setBeds(b.data.data);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load beds'));
    } finally {
      setLoading(false);
    }
  }, [wardFilter, statusFilter, isAdmin]);

  useEffect(() => { load(); }, [load]);

  // Runs a mutation with a pending key, shows errors, re-fetches on success. Returns success.
  const run = async (key: string, fn: () => Promise<unknown>, fallback: string, inDialog = false) => {
    setPending(key);
    setError('');
    setDialogError('');
    try {
      await fn();
      await load();
      return true;
    } catch (err) {
      // Dialog actions report inside the dialog: the page banner sits behind the backdrop.
      (inDialog ? setDialogError : setError)(getErrorMessage(err, fallback));
      return false;
    } finally {
      setPending(null);
    }
  };

  const closeAlloc = () => { setDialogError(''); setAllocBed(null); setPatient(null); setReason(''); };

  const submitAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocBed || !patient) return;
    const ok = await run('allocate', () => bedService.allocate(allocBed.id, { patientId: patient.id, reason: reason.trim() || undefined }), 'Failed to allocate bed', true);
    if (ok) closeAlloc();
  };

  const discharge = (bed: Bed) => {
    if (bed.allocation_id == null) return;
    if (!window.confirm(`Discharge ${bed.patient_name ?? 'patient'} from bed ${bed.bed_number}?`)) return;
    run(`discharge-${bed.id}`, () => bedService.discharge(bed.allocation_id!), 'Failed to discharge');
  };

  const submitWard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wardForm) return;
    const ok = await run('ward', () => bedService.createWard({
      name: wardForm.name.trim(), wardType: wardForm.wardType, floor: wardForm.floor ? Number(wardForm.floor) : undefined,
    }), 'Failed to add ward', true);
    if (ok) setWardForm(null);
  };

  const submitBed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bedForm) return;
    const ok = await run('bed', () => bedService.createBed({
      wardId: Number(bedForm.wardId), bedNumber: bedForm.bedNumber.trim(),
      dailyRate: bedForm.dailyRate ? Number(bedForm.dailyRate) : undefined,
    }), 'Failed to add bed', true);
    if (ok) setBedForm(null);
  };

  const input = 'border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
  const btn = 'px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50';

  if (loading) return <p className="p-6 text-gray-500">Loading beds...</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><BedDouble className="h-6 w-6 text-teal-600" /> Bed Management</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <button type="button" className={`${btn} bg-teal-600 text-white hover:bg-teal-700 flex items-center gap-1`} onClick={() => { setDialogError(''); setWardForm({ name: '', wardType: 'general', floor: '' }); }}>
              <Plus className="h-4 w-4" /> Add ward
            </button>
            <button type="button" className={`${btn} border border-teal-600 text-teal-700 hover:bg-teal-50 flex items-center gap-1`} onClick={() => { setDialogError(''); setBedForm({ wardId: wards[0] ? String(wards[0].id) : '', bedNumber: '', dailyRate: '' }); }}>
              <Plus className="h-4 w-4" /> Add bed
            </button>
          </div>
        )}
      </div>

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-2">{error}</div>}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[['Total', stats.total], ['Available', stats.available], ['Occupied', stats.occupied], ['Occupancy', `${stats.occupancyRate}%`]].map(([l, v]) => (
            <div key={l} className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
              <p className="text-xs uppercase text-gray-500">{l}</p>
              <p className="text-2xl font-semibold text-gray-900">{v}</p>
            </div>
          ))}
        </div>
      )}

      <div role="tablist" className="flex gap-2 border-b border-gray-200">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px ${tab === t ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'requests' && <BedRequestsTab isAdmin={isAdmin} userId={user?.id} wards={wards} onChange={load} />}
      {tab === 'my patients' && <MyPatientsTab />}

      {tab === 'beds' && isAdmin && <>
      <div className="flex flex-wrap gap-3">
        <select aria-label="Ward filter" className={input} value={wardFilter} onChange={(e) => setWardFilter(e.target.value)}>
          <option value="">All wards</option>
          {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select aria-label="Status filter" className={input} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | BedStatus)}>
          <option value="">All statuses</option>
          {(['available', 'occupied', 'maintenance', 'reserved'] as BedStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {beds.length === 0 && <p className="text-gray-500 text-sm">No beds match.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {beds.map((bed) => (
          <div key={bed.id} data-testid={`bed-${bed.id}`} className={`border rounded-lg p-3 space-y-2 ${STATUS_STYLE[bed.status]}`}>
            <div className="flex justify-between text-sm font-semibold">
              <span>{bed.ward_name} / {bed.bed_number}</span>
              <span className="capitalize">{bed.status}</span>
            </div>
            {bed.status === 'occupied' && <p className="text-sm">{bed.patient_name}</p>}
            <div className="flex flex-wrap gap-2 items-center">
              {bed.status === 'available' && (
                <button type="button" className={`${btn} bg-teal-600 text-white`} onClick={() => setAllocBed(bed)}>Allocate</button>
              )}
              {bed.status === 'occupied' && (
                <button type="button" className={`${btn} bg-red-600 text-white`} disabled={pending === `discharge-${bed.id}`} onClick={() => discharge(bed)}>
                  {pending === `discharge-${bed.id}` ? 'Discharging...' : 'Discharge'}
                </button>
              )}
              {isAdmin && bed.status !== 'occupied' && (
                <select aria-label={`Set status for ${bed.bed_number}`} className="border border-gray-300 rounded px-1 py-1 text-xs bg-white text-gray-800" value={bed.status}
                  disabled={pending === `status-${bed.id}`}
                  onChange={(e) => run(`status-${bed.id}`, () => bedService.updateStatus(bed.id, e.target.value as Exclude<BedStatus, 'occupied'>), 'Failed to update status')}>
                  {SETTABLE.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </div>
          </div>
        ))}
      </div>

      </>}

      {allocBed && (
        <div role="dialog" aria-label="Allocate bed" className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form onSubmit={submitAllocate} className="bg-white rounded-lg p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">Allocate {allocBed.ward_name} / {allocBed.bed_number}</h2>
            <PatientPicker value={patient} onChange={setPatient} />
            {dialogError && <p role="alert" className="text-sm text-red-700">{dialogError}</p>}
            <label className="block text-sm font-medium text-gray-700">Reason
              <input className={`${input} w-full mt-1`} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className={`${btn} border border-gray-300`} onClick={closeAlloc}>Cancel</button>
              <button type="submit" className={`${btn} bg-teal-600 text-white`} disabled={!patient || pending === 'allocate'}>
                {pending === 'allocate' ? 'Allocating...' : 'Confirm allocation'}
              </button>
            </div>
          </form>
        </div>
      )}

      {wardForm && (
        <div role="dialog" aria-label="Add ward" className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form onSubmit={submitWard} className="bg-white rounded-lg p-6 w-full max-w-md space-y-3">
            <h2 className="text-lg font-semibold">Add ward</h2>
            {dialogError && <p role="alert" className="text-sm text-red-700">{dialogError}</p>}
            <label className="block text-sm">Name<input required className={`${input} w-full mt-1`} value={wardForm.name} onChange={(e) => setWardForm({ ...wardForm, name: e.target.value })} /></label>
            <label className="block text-sm">Type
              <select className={`${input} w-full mt-1`} value={wardForm.wardType} onChange={(e) => setWardForm({ ...wardForm, wardType: e.target.value as WardType })}>
                {WARD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="block text-sm">Floor<input type="number" className={`${input} w-full mt-1`} value={wardForm.floor} onChange={(e) => setWardForm({ ...wardForm, floor: e.target.value })} /></label>
            <div className="flex justify-end gap-2">
              <button type="button" className={`${btn} border border-gray-300`} onClick={() => { setDialogError(''); setWardForm(null); }}>Cancel</button>
              <button type="submit" className={`${btn} bg-teal-600 text-white`} disabled={pending === 'ward'}>{pending === 'ward' ? 'Saving...' : 'Save ward'}</button>
            </div>
          </form>
        </div>
      )}

      {bedForm && (
        <div role="dialog" aria-label="Add bed" className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form onSubmit={submitBed} className="bg-white rounded-lg p-6 w-full max-w-md space-y-3">
            <h2 className="text-lg font-semibold">Add bed</h2>
            {dialogError && <p role="alert" className="text-sm text-red-700">{dialogError}</p>}
            <label className="block text-sm">Ward
              <select required className={`${input} w-full mt-1`} value={bedForm.wardId} onChange={(e) => setBedForm({ ...bedForm, wardId: e.target.value })}>
                {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">Bed number<input required className={`${input} w-full mt-1`} value={bedForm.bedNumber} onChange={(e) => setBedForm({ ...bedForm, bedNumber: e.target.value })} /></label>
            <label className="block text-sm">Daily rate<input type="number" min="0" className={`${input} w-full mt-1`} value={bedForm.dailyRate} onChange={(e) => setBedForm({ ...bedForm, dailyRate: e.target.value })} /></label>
            <div className="flex justify-end gap-2">
              <button type="button" className={`${btn} border border-gray-300`} onClick={() => { setDialogError(''); setBedForm(null); }}>Cancel</button>
              <button type="submit" className={`${btn} bg-teal-600 text-white`} disabled={pending === 'bed'}>{pending === 'bed' ? 'Saving...' : 'Save bed'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
