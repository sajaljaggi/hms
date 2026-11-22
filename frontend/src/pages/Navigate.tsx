import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, AlertCircle } from 'lucide-react';
import { navigationService } from '../services/navigationService';
import { getErrorMessage } from '../utils/getErrorMessage';
import type { NavLocation, NavRoute } from '../types/modules';

export default function Navigate() {
  const [params] = useSearchParams();
  const [locations, setLocations] = useState<NavLocation[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [accessible, setAccessible] = useState(false);
  const [route, setRoute] = useState<NavRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    navigationService.getLocations()
      .then(res => {
        const list = res.data.data;
        setLocations(list);
        const target = list.find(l => l.code === params.get('to'));
        if (target) setTo(String(target.id));
      })
      .catch(err => setError(getErrorMessage(err, 'Could not load locations.')))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byFloor = useMemo(() => {
    const m = new Map<number, NavLocation[]>();
    for (const l of locations) m.set(l.floor, [...(m.get(l.floor) ?? []), l]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [locations]);

  const find = async () => {
    if (!from || !to || finding) return;
    setFinding(true); setError(''); setRoute(null);
    try {
      setRoute((await navigationService.getRoute(Number(from), Number(to), accessible)).data.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not find a route.'));
    } finally {
      setFinding(false);
    }
  };

  const select = (label: string, value: string, set: (v: string) => void) => (
    <label className="flex-1 min-w-[200px] text-sm font-medium text-gray-700">
      {label}
      <select aria-label={label} value={value} onChange={e => set(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
        <option value="">Select location</option>
        {byFloor.map(([floor, ls]) => (
          <optgroup key={floor} label={`Floor ${floor}`}>
            {ls.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="text-2xl font-extrabold text-gray-900">HMS</Link>
          <Link to="/" className="text-sm text-teal-600 hover:underline">Home</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Hospital Map</h1>
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            {select('From', from, setFrom)}
            <button type="button" aria-label="Swap" onClick={() => { setFrom(to); setTo(from); }} className="p-2.5 border rounded-lg hover:bg-gray-50">
              <ArrowLeftRight className="w-4 h-4" />
            </button>
            {select('To', to, setTo)}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={accessible} onChange={e => setAccessible(e.target.checked)} />
            Accessible route (avoid stairs)
          </label>
          <button onClick={find} disabled={!from || !to || finding}
            className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-60">
            {finding ? 'Finding…' : 'Find route'}
          </button>
        </div>
        {loading && <p className="text-gray-400 text-sm">Loading…</p>}
        {error && <div role="alert" className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3"><AlertCircle className="w-4 h-4" /> {error}</div>}
        {route && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
            <p className="font-semibold text-gray-900">{route.totalDistance} m • about {route.estimatedMinutes} min</p>
            <ol className="space-y-2">
              {route.steps.map((s, i) => {
                const floorChange = s.from.floor !== s.to.floor;
                return (
                  <li key={i} data-floor-change={floorChange}
                    className={`text-sm rounded-lg p-3 border ${floorChange ? 'bg-amber-50 border-amber-200' : 'border-gray-100'}`}>
                    <span className="font-medium">{i + 1}. {s.instruction}</span>
                    <span className="text-gray-500"> ({s.distance} m)</span>
                    {floorChange && <span className="ml-2 text-xs font-semibold text-amber-700">Floor {s.from.floor} → {s.to.floor}</span>}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </main>
    </div>
  );
}
