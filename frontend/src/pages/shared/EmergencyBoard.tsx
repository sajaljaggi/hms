import { useCallback, useEffect, useState } from 'react';
import { Siren } from 'lucide-react';
import { emergencyService } from '../../services/emergencyService';
import { bedService } from '../../services/bedService';
import { patientService } from '../../services/patientService';
import PatientPicker from '../../components/PatientPicker';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { canAdmit, canTransition, suggestEsiLevel } from '../../utils/triage';
import type {
  ArrivalMode, Bed, CreateEmergencyCaseBody, EmergencyCase, EmergencyStats, EmergencyStatus, Gender, PatientSearchResult, TriageLevel,
} from '../../types/modules';

const POLL_MS = 30_000;
const ESI_STYLE: Record<TriageLevel, string> = {
  1: 'bg-red-600 text-white', 2: 'bg-orange-500 text-white', 3: 'bg-yellow-400 text-gray-900', 4: 'bg-green-500 text-white', 5: 'bg-blue-500 text-white',
};
const LEVELS: TriageLevel[] = [1, 2, 3, 4, 5];
const input = 'border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
const btn = 'px-2.5 py-1 rounded-md text-xs font-medium disabled:opacity-50';
const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

const EMPTY = {
  patientName: '', age: '', gender: '' as '' | Gender, contactPhone: '', chiefComplaint: '', arrivalMode: 'walk_in' as ArrivalMode,
  immediate: false, highRisk: false, resources: '0',
  heartRate: '', respRate: '', spo2: '', bpSystolic: '', bpDiastolic: '', temperature: '',
};

interface Doctor { id: number; name: string; specialization: string }

export default function EmergencyBoard() {
  const [cases, setCases] = useState<EmergencyCase[]>([]);
  const [stats, setStats] = useState<EmergencyStats | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [override, setOverride] = useState<TriageLevel | null>(null);
  // Admission needs a registered patient, so the arrival can be linked to one up front.
  const [patient, setPatient] = useState<PatientSearchResult | null>(null);

  const [admitFor, setAdmitFor] = useState<number | null>(null);
  const [freeBeds, setFreeBeds] = useState<Bed[]>([]);
  const [bedId, setBedId] = useState('');

  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([emergencyService.getCases('active'), emergencyService.getStats()]);
      setCases(c.data.data);
      setStats(s.data.data);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load emergency board'));
    } finally {
      setLoading(false);
    }
  }, []);

  // One interval for the page's lifetime; hidden tabs skip a tick and catch up on becoming visible.
  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  useEffect(() => {
    patientService.getDoctors()
      .then((res) => setDoctors(res.data.data))
      .catch((err) => setError(getErrorMessage(err, 'Failed to load doctors')));
  }, []);

  const suggested = suggestEsiLevel({
    requiresImmediateIntervention: form.immediate, highRisk: form.highRisk, expectedResources: Number(form.resources) || 0,
    heartRate: num(form.heartRate), respRate: num(form.respRate), spo2: num(form.spo2),
  });
  const level = override ?? suggested;

  const act = async (key: string, fn: () => Promise<unknown>, fallback: string) => {
    setPending(key);
    setError('');
    try {
      await fn();
      await load();
      return true;
    } catch (err) {
      setError(getErrorMessage(err, fallback));
      return false;
    } finally {
      setPending(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: CreateEmergencyCaseBody = {
      patientId: patient?.id, patientName: form.patientName.trim() || undefined, chiefComplaint: form.chiefComplaint.trim(), arrivalMode: form.arrivalMode,
      age: num(form.age), gender: form.gender || undefined, contactPhone: form.contactPhone.trim() || undefined,
      requiresImmediateIntervention: form.immediate, highRisk: form.highRisk, expectedResources: Number(form.resources) || 0,
      heartRate: num(form.heartRate), respRate: num(form.respRate), spo2: num(form.spo2),
      bpSystolic: num(form.bpSystolic), bpDiastolic: num(form.bpDiastolic), temperature: num(form.temperature),
      triageLevel: override ?? undefined,
    };
    if (await act('create', () => emergencyService.createCase(body), 'Failed to register arrival')) {
      setForm(EMPTY);
      setOverride(null);
      setPatient(null);
      setShowForm(false);
    }
  };

  const setStatus = (c: EmergencyCase, status: Exclude<EmergencyStatus, 'admitted'>) => {
    if ((status === 'discharged' || status === 'transferred') && !window.confirm(`Mark ${c.patient_name} as ${status}?`)) return;
    act(`${status}-${c.id}`, () => emergencyService.updateCase(c.id, { status }), 'Failed to update case');
  };

  const loadFreeBeds = async () => {
    setBedId('');
    try {
      const res = await bedService.getBeds({ status: 'available' });
      setFreeBeds(res.data.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load available beds'));
    }
  };

  const openAdmit = (c: EmergencyCase) => {
    setAdmitFor(c.id);
    return loadFreeBeds();
  };

  const confirmAdmit = async (c: EmergencyCase) => {
    if (await act(`admit-${c.id}`, () => emergencyService.admit(c.id, Number(bedId)), 'Failed to admit patient')) setAdmitFor(null);
    else await loadFreeBeds(); // the chosen bed may be gone: refresh the list and clear the selection
  };

  const field = (k: keyof typeof EMPTY) => ({
    value: form[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value }),
  });

  if (loading) return <p className="p-6 text-gray-500">Loading emergency board...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Siren className="h-6 w-6 text-red-600" /> Emergency Board</h1>
        <button type="button" className="px-3 py-2 rounded-md text-sm font-medium bg-teal-600 text-white" onClick={() => setShowForm((s) => !s)}>New arrival</button>
      </div>

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-2">{error}</div>}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Active" value={stats.active} />
          <Stat label="Waiting" value={stats.waiting} />
          <Stat label="Avg wait" value={`${stats.avgWaitMinutes} min`} />
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 flex gap-1.5 items-center flex-wrap">
            {LEVELS.map((l) => (
              <span key={l} title={`ESI ${l}`} data-testid={`esi-count-${l}`} className={`px-2 py-0.5 rounded text-xs font-semibold ${ESI_STYLE[l]}`}>{l}: {stats.byTriageLevel[l] ?? 0}</span>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} aria-label="New arrival" className="bg-white border border-gray-200 rounded-lg p-4 grid md:grid-cols-3 gap-3">
          <div className="md:col-span-3"><PatientPicker label="Registered patient (required to admit)" value={patient} onChange={setPatient} /></div>
          <label className="text-sm">Patient name{patient && ' (optional)'}<input required={!patient} className={`${input} w-full mt-1`} {...field('patientName')} /></label>
          <label className="text-sm">Age<input type="number" min={0} className={`${input} w-full mt-1`} {...field('age')} /></label>
          <label className="text-sm">Gender
            <select className={`${input} w-full mt-1`} {...field('gender')}>
              <option value="">Unknown</option><option value="male">male</option><option value="female">female</option><option value="other">other</option>
            </select>
          </label>
          <label className="text-sm md:col-span-2">Chief complaint<input required className={`${input} w-full mt-1`} {...field('chiefComplaint')} /></label>
          <label className="text-sm">Arrival mode
            <select className={`${input} w-full mt-1`} {...field('arrivalMode')}>
              <option value="walk_in">walk in</option><option value="ambulance">ambulance</option><option value="referral">referral</option>
            </select>
          </label>
          <label className="text-sm">Contact phone<input className={`${input} w-full mt-1`} {...field('contactPhone')} /></label>

          <fieldset className="md:col-span-3 border border-gray-200 rounded-md p-3 space-y-2">
            <legend className="text-sm font-semibold px-1">ESI decision helper</legend>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.immediate} onChange={(e) => setForm({ ...form, immediate: e.target.checked })} /> Requires immediate life-saving intervention</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.highRisk} onChange={(e) => setForm({ ...form, highRisk: e.target.checked })} /> High-risk situation / confused / severe pain</label>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              <label className="text-xs">Expected resources<input type="number" min={0} className={`${input} w-full mt-1`} {...field('resources')} /></label>
              <label className="text-xs">Heart rate<input type="number" min={0} className={`${input} w-full mt-1`} {...field('heartRate')} /></label>
              <label className="text-xs">Resp. rate<input type="number" min={0} className={`${input} w-full mt-1`} {...field('respRate')} /></label>
              <label className="text-xs">SpO2<input type="number" min={0} max={100} className={`${input} w-full mt-1`} {...field('spo2')} /></label>
              <label className="text-xs">BP systolic<input type="number" min={0} className={`${input} w-full mt-1`} {...field('bpSystolic')} /></label>
              <label className="text-xs">BP diastolic<input type="number" min={0} className={`${input} w-full mt-1`} {...field('bpDiastolic')} /></label>
              <label className="text-xs">Temp (C)<input type="number" step="0.1" className={`${input} w-full mt-1`} {...field('temperature')} /></label>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span>Suggested ESI: <strong data-testid="suggested-esi" className={`px-2 py-0.5 rounded ${ESI_STYLE[suggested]}`}>{suggested}</strong></span>
              <label>Triage level
                <select aria-label="Triage level" className={`${input} ml-2`} value={level} onChange={(e) => setOverride(Number(e.target.value) as TriageLevel)}>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              {override !== null && <button type="button" className="text-teal-700 text-xs hover:underline" onClick={() => setOverride(null)}>Use suggestion</button>}
            </div>
          </fieldset>
          <div className="md:col-span-3">
            <button type="submit" disabled={pending === 'create'} className="px-3 py-2 rounded-md text-sm font-medium bg-teal-600 text-white disabled:opacity-50">{pending === 'create' ? 'Registering...' : 'Register arrival'}</button>
          </div>
        </form>
      )}

      {cases.length === 0 ? <p className="text-sm text-gray-500">No active cases.</p> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm bg-white border border-gray-200 rounded-lg">
            <thead><tr className="bg-gray-50 text-left">
              {['ESI', 'Patient', 'Complaint', 'Status', 'Wait', 'Doctor', 'Actions'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}
            </tr></thead>
            <tbody>
              {cases.map((c) => {
                const busy = pending !== null;
                return (
                  <tr key={c.id} data-testid={`case-${c.id}`} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded font-semibold ${ESI_STYLE[c.triage_level]}`}>{c.triage_level}</span></td>
                    <td className="px-3 py-2">{c.patient_name}{c.age != null && <span className="text-gray-500"> ({c.age})</span>}</td>
                    <td className="px-3 py-2">{c.chief_complaint}</td>
                    <td className="px-3 py-2 capitalize">{c.status.replace('_', ' ')}</td>
                    <td className="px-3 py-2">{c.wait_minutes} min</td>
                    <td className="px-3 py-2">
                      {c.status === 'waiting' || c.status === 'in_treatment' ? (
                        <select aria-label={`Assign doctor for ${c.patient_name}`} className="border border-gray-300 rounded px-1 py-1 text-xs" disabled={busy}
                          value={c.assigned_doctor_id ?? ''}
                          onChange={(e) => e.target.value && act(`assign-${c.id}`, () => emergencyService.updateCase(c.id, { assignedDoctorId: Number(e.target.value) }), 'Failed to assign doctor')}>
                          <option value="">{c.assigned_doctor_name ?? 'Assign doctor'}</option>
                          {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      ) : (c.assigned_doctor_name ?? '-')}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {canTransition(c.status, 'in_treatment') && <button type="button" disabled={busy} className={`${btn} bg-teal-600 text-white`} onClick={() => setStatus(c, 'in_treatment')}>Start treatment</button>}
                        {canAdmit(c.status) && <button type="button" disabled={busy} className={`${btn} bg-blue-600 text-white`} onClick={() => openAdmit(c)}>Admit</button>}
                        {canTransition(c.status, 'discharged') && <button type="button" disabled={busy} className={`${btn} border border-gray-300`} onClick={() => setStatus(c, 'discharged')}>Discharge</button>}
                        {canTransition(c.status, 'transferred') && <button type="button" disabled={busy} className={`${btn} border border-gray-300`} onClick={() => setStatus(c, 'transferred')}>Transfer</button>}
                      </div>
                      {admitFor === c.id && (
                        <div className="mt-2 flex gap-2 items-center">
                          <select aria-label="Bed" className="border border-gray-300 rounded px-1 py-1 text-xs" value={bedId} onChange={(e) => setBedId(e.target.value)}>
                            <option value="">Select bed</option>
                            {freeBeds.map((b) => <option key={b.id} value={b.id}>{b.ward_name} / {b.bed_number}</option>)}
                          </select>
                          <button type="button" disabled={!bedId || busy} className={`${btn} bg-blue-600 text-white`} onClick={() => confirmAdmit(c)}>{pending === `admit-${c.id}` ? 'Admitting...' : 'Confirm admit'}</button>
                          <button type="button" className={`${btn} border border-gray-300`} onClick={() => setAdmitFor(null)}>Cancel</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: number | string }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
    <p className="text-xs uppercase text-gray-500">{label}</p>
    <p className="text-xl font-semibold text-gray-900">{value}</p>
  </div>
);
