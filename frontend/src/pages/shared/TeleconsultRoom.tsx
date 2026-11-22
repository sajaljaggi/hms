import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { teleconsultService } from '../../services/teleconsultService';
import { loadScript } from '../../utils/scriptLoader';
import { getErrorMessage } from '../../utils/getErrorMessage';
import type { TeleconsultRoomData, TeleconsultStatus } from '../../types/modules';

interface JitsiApi { dispose: () => void }
type JitsiCtor = new (domain: string, opts: object) => JitsiApi;

const HOSTNAME = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i;
const TENANT = /^vpaas-magic-cookie-[a-z0-9]+$/i;
const POLL_MS = 5000;

export default function TeleconsultRoom() {
  const { appointmentId } = useParams();
  const id = Number(appointmentId);
  const container = useRef<HTMLDivElement>(null);
  const [join, setJoin] = useState<TeleconsultRoomData | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<{ code?: string; message: string; startsAt?: string } | null>(null);
  const [status, setStatus] = useState<TeleconsultStatus | null>(null);
  const [admitting, setAdmitting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [done, setDone] = useState(false);
  const [actionError, setActionError] = useState('');

  // A patient keeps asking until the doctor admits them; each ask also tells the doctor they are waiting.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => teleconsultService.join(id)
      .then(res => {
        if (cancelled) return;
        const d = res.data.data;
        if (d.waiting) { setWaiting(true); timer = setTimeout(attempt, POLL_MS); }
        else { setWaiting(false); setJoin(d); }
      })
      .catch(err => {
        if (cancelled) return;
        const e = (err as { response?: { data?: { error?: { code?: string; details?: { startsAt?: string } } } } })?.response?.data?.error;
        setError({ code: e?.code, message: getErrorMessage(err, 'Could not join the consultation.'), startsAt: e?.details?.startsAt });
      });
    attempt();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id]);

  // The doctor watches the waiting room until the patient is admitted.
  const isDoctor = join?.role === 'doctor';
  const admitted = !!status?.admitted;
  useEffect(() => {
    if (!isDoctor || admitted) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => teleconsultService.status(id)
      .then(res => { if (!cancelled) setStatus(res.data.data); })
      .catch(() => { /* transient; the next check retries */ })
      .finally(() => { if (!cancelled) timer = setTimeout(check, POLL_MS); });
    check();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id, isDoctor, admitted]);

  useEffect(() => {
    if (!join) return;
    let api: JitsiApi | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!HOSTNAME.test(join.domain)) throw new Error('Invalid video server address.');
        if (join.tenant && !TENANT.test(join.tenant)) throw new Error('Invalid video account.');
        await loadScript(`https://${join.domain}/${join.tenant ? `${join.tenant}/` : ''}external_api.js`);
        const Ctor = (window as unknown as { JitsiMeetExternalAPI?: JitsiCtor }).JitsiMeetExternalAPI;
        if (!Ctor) throw new Error('Video library is unavailable.');
        if (cancelled || !container.current) return;
        api = new Ctor(join.domain, {
          roomName: join.roomName, parentNode: container.current, jwt: join.jwt,
          userInfo: { displayName: join.displayName }, configOverwrite: { prejoinPageEnabled: true },
        });
      } catch (err) {
        if (!cancelled) setError({ message: getErrorMessage(err, 'Could not start the video call.') });
      }
    })();
    return () => { cancelled = true; api?.dispose(); };
  }, [join]);

  const admit = async () => {
    if (admitting) return;
    setAdmitting(true); setActionError('');
    try { await teleconsultService.admit(id); setStatus({ admitted: true, patientWaiting: false }); }
    catch (err) { setActionError(getErrorMessage(err, 'Could not admit the patient.')); }
    finally { setAdmitting(false); }
  };

  const complete = async () => {
    if (completing) return;
    setCompleting(true); setActionError('');
    try { await teleconsultService.complete(id); setDone(true); }
    catch (err) { setActionError(getErrorMessage(err, 'Could not mark completed.')); }
    finally { setCompleting(false); }
  };

  if (error) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center space-y-3" role="alert">
        {error.code === 'PAYMENT_REQUIRED' ? (
          <>
            <p className="font-semibold text-gray-900">Payment required</p>
            <p className="text-sm text-gray-500">Please pay for this appointment before joining.</p>
            <Link to="/patient/history" className="text-teal-600 underline text-sm">Go to appointment history</Link>
          </>
        ) : error.code === 'OUTSIDE_JOIN_WINDOW' ? (
          <>
            <p className="font-semibold text-gray-900">{error.message}</p>
            {error.startsAt && <p className="text-sm text-gray-500">Starts at {new Date(error.startsAt).toLocaleString()}</p>}
          </>
        ) : (
          <p className="font-semibold text-gray-900">{error.message}</p>
        )}
      </div>
    );
  }
  if (waiting) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center space-y-2" role="status">
        <p className="font-semibold text-gray-900">You are in the waiting room</p>
        <p className="text-sm text-gray-500">The doctor will admit you shortly. Keep this page open; the call starts on its own.</p>
      </div>
    );
  }
  if (!join) return <p className="text-gray-400 text-sm">Joining…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Video consultation</h1>
        {isDoctor && (
          <button onClick={complete} disabled={completing || done}
            className="bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-60">
            {done ? 'Completed' : completing ? 'Saving…' : 'Mark consultation completed'}
          </button>
        )}
      </div>
      {isDoctor && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-indigo-50 border-indigo-200 px-4 py-3 text-sm">
          {admitted ? <span className="text-indigo-900">Patient admitted. They join the call as soon as their page updates.</span>
            : status?.patientWaiting ? (
              <>
                <span className="font-medium text-indigo-900">The patient is waiting to join.</span>
                <button onClick={admit} disabled={admitting}
                  className="bg-indigo-600 text-white font-medium px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-60">
                  {admitting ? 'Admitting…' : 'Admit patient'}
                </button>
              </>
            ) : <span className="text-indigo-900">Waiting for the patient to arrive…</span>}
        </div>
      )}
      {actionError && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded p-2">{actionError}</p>}
      <div ref={container} role="region" aria-label="Video call" className="h-[70vh] w-full bg-gray-900 rounded-xl overflow-hidden" />
    </div>
  );
}
