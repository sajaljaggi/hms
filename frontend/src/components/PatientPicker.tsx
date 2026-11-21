import { useEffect, useState } from 'react';
import { bedService } from '../services/bedService';
import type { PatientSearchResult } from '../types/modules';

interface Props {
  value: PatientSearchResult | null;
  onChange: (p: PatientSearchResult | null) => void;
  label?: string;
}

// Debounced (300 ms) patient search. Controlled: the parent owns the selected patient.
export default function PatientPicker({ value, onChange, label = 'Patient' }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (!term) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await bedService.searchPatients(term);
        if (!cancelled) setResults(res.data.data);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  if (value) {
    return (
      <div>
        <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
        <div className="flex items-center justify-between border border-gray-300 rounded-md px-3 py-2 text-sm">
          <span>{value.name} <span className="text-gray-500">({value.email})</span></span>
          <button type="button" className="text-teal-700 text-xs hover:underline" onClick={() => { onChange(null); setQ(''); setResults([]); }}>
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        <input
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); if (!e.target.value.trim()) setResults([]); }}
          placeholder="Search by name, email or phone"
          className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </label>
      {searching && <p className="text-xs text-gray-500 mt-1">Searching...</p>}
      {q.trim() && !searching && results.length > 0 && (
        <ul role="listbox" aria-label="Patient results" className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow max-h-48 overflow-y-auto">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" role="option" aria-selected={false} onClick={() => { onChange(p); setResults([]); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50">
                {p.name} <span className="text-gray-500">({p.email})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
