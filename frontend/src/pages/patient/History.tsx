import { useEffect, useState, useMemo } from 'react';
import { Calendar, Clock, Download, AlertCircle, Search, Filter, X, CheckCircle } from 'lucide-react';
import { patientService } from '../../services/patientService';
import StarRating from '../../components/StarRating';
import { format, parse, addMinutes } from 'date-fns';

interface Appointment {
  id: number; status: string; date: string; time: string;
  doctor_name: string; specialization: string; fees: number;
  prescription_notes?: string; prescription_file?: string;
}

// Track per-appointment rating state
interface RatingState {
  rated: boolean;
  submitting: boolean;
  value: number;       // user's selected stars before submitting
  submitted: number;   // confirmed submitted value
}

const statusColors: Record<string, string> = {
  pending:   'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const formatSlotRange = (timeStr: string) => {
  try {
    const start = parse(timeStr, 'HH:mm:ss', new Date());
    const end = addMinutes(start, 15);
    return `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
  } catch { return timeStr; }
};

export default function History() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [searchSpec, setSearchSpec] = useState('');
  const [searchDate, setSearchDate] = useState('');

  // Map from appointmentId -> rating state
  const [ratings, setRatings] = useState<Record<number, RatingState>>({});

  useEffect(() => {
    patientService.getAppointments()
      .then(res => {
        const appts: Appointment[] = res.data.data;
        setAppointments(appts);

        // For each completed appointment, check if already rated
        const completed = appts.filter(a => a.status === 'completed');
        completed.forEach(appt => {
          patientService.checkRating(appt.id)
            .then(r => {
              setRatings(prev => ({
                ...prev,
                [appt.id]: {
                  rated: r.data.rated,
                  submitting: false,
                  value: r.data.rated ? r.data.rating : 0,
                  submitted: r.data.rated ? r.data.rating : 0,
                },
              }));
            })
            .catch(() => {}); // silently ignore check errors
        });
      })
      .catch(() => setError('Could not load appointment history.'))
      .finally(() => setLoading(false));
  }, []);

  const handleStarChange = (apptId: number, star: number) => {
    setRatings(prev => ({ ...prev, [apptId]: { ...prev[apptId], value: star } }));
  };

  const handleSubmitRating = async (apptId: number) => {
    const state = ratings[apptId];
    if (!state?.value || state.submitting || state.rated) return;
    setRatings(prev => ({ ...prev, [apptId]: { ...prev[apptId], submitting: true } }));
    try {
      await patientService.submitRating(apptId, state.value);
      setRatings(prev => ({
        ...prev,
        [apptId]: { rated: true, submitting: false, value: state.value, submitted: state.value },
      }));
    } catch (e: any) {
      setRatings(prev => ({ ...prev, [apptId]: { ...prev[apptId], submitting: false } }));
    }
  };

  // Derive unique specializations for the dropdown
  const specializations = useMemo(() => {
    const unique = [...new Set(appointments.map(a => a.specialization))];
    return unique.sort();
  }, [appointments]);

  const filtered = useMemo(() => appointments.filter(appt => {
    const specMatch = searchSpec ? appt.specialization === searchSpec : true;
    const dateMatch = searchDate ? appt.date.startsWith(searchDate) : true;
    return specMatch && dateMatch;
  }), [appointments, searchSpec, searchDate]);

  const hasFilters = searchSpec || searchDate;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Appointment History</h1>
        <span className="text-sm text-gray-500">{filtered.length} of {appointments.length} appointments</span>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Filter by Specialization */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Specialization
            </label>
            <select
              value={searchSpec}
              onChange={e => setSearchSpec(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition"
            >
              <option value="">All Specializations</option>
              {specializations.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Filter by Date */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Date
            </label>
            <input
              type="date"
              value={searchDate}
              onChange={e => setSearchDate(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition"
            />
          </div>

          {/* Clear Button */}
          {hasFilters && (
            <button
              onClick={() => { setSearchSpec(''); setSearchDate(''); }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-500 border border-gray-200 hover:border-red-200 rounded-lg px-3 py-2.5 transition"
            >
              <X className="w-4 h-4" /> Clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading && <p className="text-gray-400 text-sm">Loading…</p>}

      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          <Search className="mx-auto w-10 h-10 mb-2 opacity-40" />
          <p>{hasFilters ? 'No appointments match your filters.' : 'No appointment history yet.'}</p>
        </div>
      )}

      <div className="space-y-4">
        {filtered.map(appt => {
          const rState = ratings[appt.id];
          return (
            <div key={appt.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex flex-wrap justify-between items-start gap-4">
                <div>
                  <p className="font-semibold text-gray-900 text-base">{appt.specialization}</p>
                  <p className="text-sm text-gray-500">{appt.doctor_name}</p>
                  <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {format(new Date(appt.date), 'MMM dd, yyyy')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatSlotRange(appt.time)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColors[appt.status]}`}>
                    {appt.status}
                  </span>
                  <span className="text-sm font-bold text-teal-700">₹{appt.fees}</span>
                  {appt.prescription_file && (
                    <a href={appt.prescription_file} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                      <Download className="w-3.5 h-3.5" /> Download Prescription
                    </a>
                  )}
                </div>
              </div>

              {appt.prescription_notes && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100 text-sm text-gray-700">
                  <p className="font-medium text-gray-600 mb-1">Doctor's Notes:</p>
                  {appt.prescription_notes}
                </div>
              )}

              {/* ── Rating Widget (completed appointments only) ────────────── */}
              {appt.status === 'completed' && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  {rState?.rated ? (
                    /* Already rated */
                    <div className="flex items-center gap-2 text-sm text-green-700">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="font-medium">Your rating:</span>
                      <StarRating value={rState.submitted} size="sm" />
                      <span className="text-gray-400">({rState.submitted}/5)</span>
                    </div>
                  ) : (
                    /* Not yet rated */
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm text-gray-500 font-medium">Rate your experience:</span>
                      <StarRating
                        value={rState?.value ?? 0}
                        interactive
                        onChange={star => handleStarChange(appt.id, star)}
                        size="md"
                      />
                      {(rState?.value ?? 0) > 0 && (
                        <button
                          onClick={() => handleSubmitRating(appt.id)}
                          disabled={rState?.submitting}
                          className="ml-1 px-3 py-1 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {rState?.submitting ? 'Submitting…' : 'Submit'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
