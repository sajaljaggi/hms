import { useEffect, useState, useMemo } from 'react';
import { Calendar, Clock, Download, AlertCircle, Search, Filter, X, Star } from 'lucide-react';
import { patientService } from '../../services/patientService';
import { format, parse, addMinutes } from 'date-fns';

interface Appointment {
  id: number; status: string; date: string; time: string;
  doctor_name: string; specialization: string; fees: number;
  prescription_notes?: string; prescription_file?: string;
  my_rating?: number | null;
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

// ── Star Rating Widget ──────────────────────────────────────────────────────
function StarRating({ appointmentId, existingRating, onRated }: {
  appointmentId: number;
  existingRating: number | null | undefined;
  onRated: (appointmentId: number, stars: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(!!existingRating);
  const [selected, setSelected] = useState(existingRating || 0);
  const [error, setError] = useState('');

  const handleClick = async (stars: number) => {
    if (submitted || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await patientService.submitRating(appointmentId, stars);
      setSelected(stars);
      setSubmitted(true);
      onRated(appointmentId, stars);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to submit rating.');
    } finally {
      setSubmitting(false);
    }
  };

  const isReadonly = submitted;
  const displayValue = isReadonly ? selected : hover;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            type="button"
            disabled={isReadonly || submitting}
            onClick={() => handleClick(star)}
            onMouseEnter={() => !isReadonly && setHover(star)}
            onMouseLeave={() => !isReadonly && setHover(0)}
            className={`transition-all duration-200 ${isReadonly ? 'cursor-default' : 'cursor-pointer hover:scale-125'} ${submitting ? 'opacity-50' : ''}`}
          >
            <Star
              className={`w-5 h-5 transition-colors duration-200 ${
                star <= displayValue
                  ? 'text-amber-400 fill-amber-400'
                  : star <= selected && !hover
                    ? 'text-amber-400 fill-amber-400'
                    : 'text-gray-300'
              }`}
            />
          </button>
        ))}
        {submitting && <span className="text-xs text-gray-400 ml-2">Saving…</span>}
      </div>
      {submitted && (
        <span className="text-xs text-green-600 font-medium flex items-center gap-1">
          ✓ Thank you for your feedback!
        </span>
      )}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}

export default function History() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [searchSpec, setSearchSpec] = useState('');
  const [searchDate, setSearchDate] = useState('');

  useEffect(() => {
    patientService.getAppointments()
      .then(res => setAppointments(res.data.data))
      .catch(() => setError('Could not load appointment history.'))
      .finally(() => setLoading(false));
  }, []);

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

  const handleRated = (appointmentId: number, stars: number) => {
    setAppointments(prev => prev.map(a => a.id === appointmentId ? { ...a, my_rating: stars } : a));
  };

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
        {filtered.map(appt => (
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
            {/* Rating Section — only for completed appointments */}
            {appt.status === 'completed' && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5" /> Rate your experience
                </p>
                <StarRating
                  appointmentId={appt.id}
                  existingRating={appt.my_rating}
                  onRated={handleRated}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
