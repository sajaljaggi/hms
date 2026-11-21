import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { teleconsultService } from '../../services/teleconsultService';
import { loadScript } from '../../utils/scriptLoader';
import { getErrorMessage } from '../../utils/getErrorMessage';
import type { TeleconsultJoinData } from '../../types/modules';

interface JitsiApi { dispose: () => void }
type JitsiCtor = new (domain: string, opts: object) => JitsiApi;

const HOSTNAME = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i;

export default function TeleconsultRoom() {
  const { appointmentId } = useParams();
  const id = Number(appointmentId);
  const container = useRef<HTMLDivElement>(null);
  const [join, setJoin] = useState<TeleconsultJoinData | null>(null);
  const [error, setError] = useState<{ code?: string; message: string; startsAt?: string } | null>(null);
  const [completing, setCompleting] = useState(false);
  const [done, setDone] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let cancelled = false;
    teleconsultService.join(id)
      .then(res => { if (!cancelled) setJoin(res.data.data); })
      .catch(err => {
        if (cancelled) return;
        const e = (err as { response?: { data?: { error?: { code?: string; details?: { startsAt?: string } } } } })?.response?.data?.error;
        setError({ code: e?.code, message: getErrorMessage(err, 'Could not join the consultation.'), startsAt: e?.details?.startsAt });
      });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!join) return;
    let api: JitsiApi | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!HOSTNAME.test(join.domain)) throw new Error('Invalid video server address.');
        await loadScript(`https://${join.domain}/external_api.js`);
        const Ctor = (window as unknown as { JitsiMeetExternalAPI?: JitsiCtor }).JitsiMeetExternalAPI;
        if (!Ctor) throw new Error('Video library is unavailable.');
        if (cancelled || !container.current) return;
        api = new Ctor(join.domain, {
          roomName: join.roomName, parentNode: container.current,
          userInfo: { displayName: join.displayName }, configOverwrite: { prejoinPageEnabled: true },
        });
      } catch (err) {
        if (!cancelled) setError({ message: getErrorMessage(err, 'Could not start the video call.') });
      }
    })();
    return () => { cancelled = true; api?.dispose(); };
  }, [join]);

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
  if (!join) return <p className="text-gray-400 text-sm">Joining…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Video consultation</h1>
        {join.role === 'doctor' && (
          <button onClick={complete} disabled={completing || done}
            className="bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-60">
            {done ? 'Completed' : completing ? 'Saving…' : 'Mark consultation completed'}
          </button>
        )}
      </div>
      {actionError && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded p-2">{actionError}</p>}
      <div ref={container} role="region" aria-label="Video call" className="h-[70vh] w-full bg-gray-900 rounded-xl overflow-hidden" />
    </div>
  );
}
