import { useCallback, useEffect, useState } from 'react';
import { bedService } from '../../services/bedService';
import PatientPicker from '../../components/PatientPicker';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { URGENCY_STYLE } from '../../utils/urgencyBadge';
import type { Bed, BedRequest, BedUrgency, MyPatientBed, PatientSearchResult, Ward, WardType } from '../../types/modules';

// Doctors ask for a bed or a discharge; the admin assigns the bed or discharges (like blood requests).

const WARD_TYPES: WardType[] = ['general', 'icu', 'emergency', 'maternity', 'pediatric', 'private'];
const URGENCIES: BedUrgency[] = ['routine', 'urgent', 'emergency'];
const input = 'border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
const btn = 'px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50';
const Alert = ({ msg }: { msg: string }) => (msg ? <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-2">{msg}</div> : null);

export function BedRequestsTab({ isAdmin, userId, wards, onChange }: {
  isAdmin: boolean; userId?: number; wards: Ward[]; onChange: () => void;
}) {
  const [requests, setRequests] = useState<BedRequest[]>([]);
  const [freeBeds, setFreeBeds] = useState<Bed[]>([]);
  const [chosenBed, setChosenBed] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rowError, setRowError] = useState<{ id: number; msg: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [patient, setPatient] = useState<PatientSearchResult | null>(null);
  const [form, setForm] = useState({ wardType: '' as '' | WardType, urgency: 'routine' as BedUrgency, reason: '' });

  const load = useCallback(async () => {
    try {
      const [r, b] = await Promise.all([
        bedService.getRequests(),
        isAdmin ? bedService.getBeds({ status: 'available' }) : Promise.resolve(null),
      ]);
      setRequests(r.data.data);
      if (b) setFreeBeds(b.data.data);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load bed requests'));
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);
  useEffect(() => { load(); }, [load]);

  const wardTypeOf = (bed: Bed) => wards.find((w) => w.id === bed.ward_id)?.ward_type;
  // Beds of the requested ward type first.
  const bedsFor = (r: BedRequest) => [...freeBeds].sort((a, b) =>
    Number(wardTypeOf(b) === r.ward_type) - Number(wardTypeOf(a) === r.ward_type));

  const rowAction = async (r: BedRequest, kind: 'assign' | 'discharge' | 'reject' | 'cancel') => {
    let notes: string | undefined;
    if (kind === 'reject') {
      const answer = window.prompt(`Reject the request for ${r.patient_name}? Reason (optional):`, '');
      if (answer === null) return;
      notes = answer.trim() || undefined;
    }
    if (kind === 'discharge' && !window.confirm(`Discharge ${r.patient_name} from ${r.ward_name} / ${r.bed_number}?`)) return;
    setPending(`${kind}-${r.id}`);
    setRowError(null);
    try {
      if (kind === 'assign') await bedService.fulfillRequest(r.id, Number(chosenBed[r.id]));
      else if (kind === 'discharge') await bedService.fulfillRequest(r.id);
      else if (kind === 'reject') await bedService.rejectRequest(r.id, notes);
      else await bedService.cancelRequest(r.id);
      await load();
      onChange();
    } catch (err) {
      setRowError({ id: r.id, msg: getErrorMessage(err, `Failed to ${kind} request`) });
      await load(); // e.g. the chosen bed was just taken: refresh the free beds
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
      await bedService.createRequest({
        type: 'admission', patientId: patient.id, wardType: form.wardType || undefined,
        urgency: form.urgency, reason: form.reason.trim() || undefined,
      });
      setShowForm(false);
      setPatient(null);
      setForm({ wardType: '', urgency: 'routine', reason: '' });
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to send bed request'));
    } finally {
      setPending(null);
    }
  };

  if (loading) return <p className="text-gray-500">Loading bed requests...</p>;

  return (
    <div className="space-y-4">
      <Alert msg={error} />
      {!isAdmin && <button type="button" className={`${btn} bg-teal-600 text-white`} onClick={() => setShowForm((s) => !s)}>Request a bed</button>}
      {showForm && (
        <form onSubmit={submit} aria-label="New bed request" className="bg-white border border-gray-200 rounded-lg p-4 grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2"><PatientPicker value={patient} onChange={setPatient} /></div>
          <label className="text-sm">Preferred ward type
            <select className={`${input} w-full mt-1`} value={form.wardType} onChange={(e) => setForm({ ...form, wardType: e.target.value as '' | WardType })}>
              <option value="">Any</option>
              {WARD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-sm">Urgency
            <select className={`${input} w-full mt-1`} value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value as BedUrgency })}>
              {URGENCIES.map((u) => <option key={u}>{u}</option>)}
            </select>
          </label>
          <label className="text-sm md:col-span-2">Reason
            <input className={`${input} w-full mt-1`} maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </label>
          <div className="md:col-span-2">
            <button type="submit" disabled={!patient || pending === 'create'} className={`${btn} bg-teal-600 text-white`}>{pending === 'create' ? 'Sending...' : 'Send request'}</button>
          </div>
        </form>
      )}

      {requests.length === 0 && <p className="text-sm text-gray-500">No bed requests.</p>}
      <ul className="space-y-2">
        {requests.map((r) => (
          <li key={r.id} data-testid={`bed-request-${r.id}`} className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm flex flex-wrap items-center gap-2">
                <strong>{r.patient_name}</strong>
                <span>{r.request_type === 'admission' ? 'Bed' : 'Discharge'}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${URGENCY_STYLE[r.urgency]}`}>{r.urgency}</span>
                {r.ward_type && <span className="text-gray-500">wants {r.ward_type}</span>}
                {r.bed_number && <span className="text-gray-500">{r.ward_name} / {r.bed_number}</span>}
                <span className="capitalize font-medium">{r.status}</span>
              </span>
              {r.status === 'pending' && (
                <span className="flex flex-wrap gap-2 items-center">
                  {isAdmin && r.request_type === 'admission' && <>
                    <select aria-label={`Bed for ${r.patient_name}`} className="border border-gray-300 rounded px-2 py-1.5 text-sm" value={chosenBed[r.id] ?? ''}
                      onChange={(e) => setChosenBed({ ...chosenBed, [r.id]: e.target.value })}>
                      <option value="">Choose a free bed</option>
                      {bedsFor(r).map((b) => <option key={b.id} value={b.id}>{b.ward_name} / {b.bed_number}</option>)}
                    </select>
                    <button type="button" className={`${btn} bg-teal-600 text-white`} disabled={pending !== null || !chosenBed[r.id]} onClick={() => rowAction(r, 'assign')}>Assign bed</button>
                  </>}
                  {isAdmin && r.request_type === 'discharge' && (
                    <button type="button" className={`${btn} bg-teal-600 text-white`} disabled={pending !== null} onClick={() => rowAction(r, 'discharge')}>Discharge &amp; free bed</button>
                  )}
                  {isAdmin && <button type="button" className={`${btn} border border-red-300 text-red-700`} disabled={pending !== null} onClick={() => rowAction(r, 'reject')}>Reject</button>}
                  {r.requested_by === userId && (
                    <button type="button" className={`${btn} border border-gray-300`} disabled={pending !== null} onClick={() => rowAction(r, 'cancel')}>Cancel</button>
                  )}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">
              {isAdmin && r.requester_name && <>By {r.requester_name} · </>}
              {new Date(r.created_at).toLocaleString()}
              {r.emergency_case_id && <> · Emergency case #{r.emergency_case_id}</>}
              {r.reason && <> · {r.reason}</>}
              {r.admin_notes && <> · Admin: {r.admin_notes}</>}
            </p>
            {rowError?.id === r.id && <p role="alert" className="text-sm text-red-700">{rowError.msg}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// The doctor's admitted patients (admissions they requested) and their discharge requests.
export function MyPatientsTab() {
  const [rows, setRows] = useState<MyPatientBed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await bedService.getMyPatients();
      setRows(res.data.data);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load your admitted patients'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const requestDischarge = async (row: MyPatientBed) => {
    const answer = window.prompt(`Ask the admin to discharge ${row.patient_name}? Note (optional):`, '');
    if (answer === null) return;
    setPending(row.allocation_id);
    setError('');
    try {
      await bedService.createRequest({ type: 'discharge', allocationId: row.allocation_id, reason: answer.trim() || undefined });
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to request discharge'));
    } finally {
      setPending(null);
    }
  };

  if (loading) return <p className="text-gray-500">Loading your patients...</p>;

  return (
    <div className="space-y-3">
      <Alert msg={error} />
      {rows.length === 0 && <p className="text-sm text-gray-500">None of your patients are admitted. Use Requests to ask for a bed.</p>}
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map((row) => (
          <li key={row.allocation_id} className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
            <div className="flex justify-between gap-2">
              <strong className="text-gray-900">{row.patient_name}</strong>
              <span className="text-sm text-gray-700">{row.ward_name} / {row.bed_number}</span>
            </div>
            <p className="text-xs text-gray-500">Admitted {new Date(row.admitted_at).toLocaleString()}{row.reason && <> · {row.reason}</>}</p>
            {row.discharge_request_id
              ? <span className="inline-block text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800">Discharge requested</span>
              : <button type="button" className={`${btn} border border-red-300 text-red-700`} disabled={pending !== null} onClick={() => requestDischarge(row)}>
                  {pending === row.allocation_id ? 'Sending...' : 'Request discharge'}
                </button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
