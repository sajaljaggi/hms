import { useState, useMemo } from 'react';
import { Clock, RefreshCw, Ban, Zap, Stethoscope, UserCheck, CalendarDays, ChevronRight, Check } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { format, addDays } from 'date-fns';
import { getErrorMessage } from '../../utils/getErrorMessage';

interface Doctor { id: number; name: string; specialization: string; fees: number; email: string; rating: number; rating_count: number; }
interface Slot { id: number; date: string; time: string; is_booked: number; is_available: number; }

const formatTime = (timeStr: string) => {
  try {
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${m} ${ampm}`;
  } catch { return timeStr; }
};

export default function SlotManagement({ doctors }: { doctors: Doctor[] }) {
  const [selectedSpecialisation, setSelectedSpecialisation] = useState('');
  const [selectedDoctor, setSelectedDoctor]                 = useState('');
  const [selectedDate, setSelectedDate]                     = useState('');
  const [slots, setSlots]                                   = useState<Slot[]>([]);
  const [loadingSlots,  setLoadingSlots]    = useState(false);
  const [togglingId,    setTogglingId]      = useState<number | null>(null);
  const [actionMsg,     setActionMsg]       = useState('');
  const [actionError,   setActionError]     = useState('');

  const today    = format(new Date(), 'yyyy-MM-dd');
  const maxDate  = format(addDays(new Date(), 14), 'yyyy-MM-dd');

  // Derive unique specialisations
  const specialisations = useMemo(() => {
    const set = new Set(doctors.map(d => d.specialization));
    return Array.from(set).sort();
  }, [doctors]);

  // Filtered doctors for step 2
  const filteredDoctors = useMemo(() => {
    if (!selectedSpecialisation) return [];
    return doctors.filter(d => d.specialization === selectedSpecialisation);
  }, [doctors, selectedSpecialisation]);

  // Current step (1-indexed)
  const currentStep = selectedDate ? 3 : selectedDoctor ? 2 : selectedSpecialisation ? 1 : 0;

  const flash = (msg: string, isError = false) => {
    if (isError) { setActionError(msg); setActionMsg(''); }
    else         { setActionMsg(msg);   setActionError(''); }
    setTimeout(() => { setActionMsg(''); setActionError(''); }, 3000);
  };

  const loadSlots = async () => {
    if (!selectedDoctor || !selectedDate) return;
    setLoadingSlots(true);
    try {
      const res = await adminService.getSlots(Number(selectedDoctor), selectedDate);
      setSlots(res.data.data);
    } catch {
      flash('Failed to load slots.', true);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleToggle = async (slotId: number) => {
    setTogglingId(slotId);
    try {
      const res = await adminService.toggleSlot(slotId);
      const newAvail = res.data.is_available;
      setSlots(prev => prev.map(s => s.id === slotId ? { ...s, is_available: newAvail } : s));
      flash(newAvail ? 'Slot unblocked.' : 'Slot blocked.');
    } catch (err) {
      flash(getErrorMessage(err, 'Could not toggle slot.'), true);
    } finally {
      setTogglingId(null);
    }
  };

  const handleBlockDay = async () => {
    if (!selectedDoctor || !selectedDate) return;
    if (!confirm(`Block all available slots for ${selectedDate}? Booked slots will be unaffected.`)) return;
    try {
      const res = await adminService.blockDay(Number(selectedDoctor), selectedDate);
      flash(`Deleted ${res.data.deleted} slot(s). Reload to refresh grid.`);
      setSlots([]);
    } catch (err) {
      flash(getErrorMessage(err, 'Failed to block day.'), true);
    }
  };

  const handleGenerate = async () => {
    if (!selectedDoctor || !selectedDate) return;
    try {
      await adminService.generateSlots(Number(selectedDoctor), selectedDate);
      flash('Slots generated!');
      await loadSlots();
    } catch {
      flash('Failed to generate slots.', true);
    }
  };

  // Step indicator data
  const steps = [
    { label: 'Specialisation', icon: Stethoscope, value: selectedSpecialisation },
    { label: 'Doctor', icon: UserCheck, value: filteredDoctors.find(d => String(d.id) === selectedDoctor)?.name || '' },
    { label: 'Date', icon: CalendarDays, value: selectedDate ? format(new Date(selectedDate + 'T00:00:00'), 'MMM dd, yyyy') : '' },
  ];

  return (
    <div className="space-y-5">
      {/* ── Step Indicator / Breadcrumb ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-3.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {steps.map((step, i) => {
            const StepIcon = step.icon;
            const isComplete = i === 0 ? !!selectedSpecialisation : i === 1 ? !!selectedDoctor : !!selectedDate;
            const isActive = i === currentStep;
            const isPending = !isComplete && !isActive;

            return (
              <div key={step.label} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                  ${isComplete ? 'bg-teal-100 text-teal-700' : isActive ? 'bg-teal-50 text-teal-600 ring-1 ring-teal-200' : 'bg-gray-50 text-gray-400'}`}>
                  {isComplete ? <Check className="w-3.5 h-3.5" /> : <StepIcon className="w-3.5 h-3.5" />}
                  <span>{step.label}</span>
                  {isComplete && step.value && (
                    <span className={`ml-0.5 ${isPending ? 'text-gray-400' : 'text-teal-500'} font-semibold truncate max-w-[120px]`}>
                      · {step.value}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Step 1: Specialisation ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center font-bold">1</span>
          Select Specialisation
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {specialisations.map(spec => {
            const count = doctors.filter(d => d.specialization === spec).length;
            const isSelected = selectedSpecialisation === spec;
            return (
              <button
                key={spec}
                onClick={() => {
                  setSelectedSpecialisation(spec);
                  setSelectedDoctor('');
                  setSelectedDate('');
                  setSlots([]);
                }}
                className={`relative px-4 py-3 rounded-xl border-2 text-left transition-all duration-200
                  ${isSelected
                    ? 'border-teal-500 bg-teal-50 shadow-md'
                    : 'border-gray-100 hover:border-teal-200 hover:bg-teal-50/30 bg-white'}`}
              >
                <p className={`text-sm font-semibold ${isSelected ? 'text-teal-800' : 'text-gray-800'}`}>{spec}</p>
                <p className={`text-xs mt-0.5 ${isSelected ? 'text-teal-500' : 'text-gray-400'}`}>{count} doctor{count !== 1 ? 's' : ''}</p>
                {isSelected && <div className="absolute top-2 right-2"><Check className="w-4 h-4 text-teal-600" /></div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Step 2: Doctor ── */}
      <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5 transition-all duration-300
        ${!selectedSpecialisation ? 'opacity-40 pointer-events-none' : ''}`}>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <span className={`w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold
            ${selectedSpecialisation ? 'bg-teal-600' : 'bg-gray-300'}`}>2</span>
          Select Doctor
          {selectedSpecialisation && <span className="text-xs text-gray-400 font-normal ml-1">— {selectedSpecialisation}</span>}
        </h3>
        {selectedSpecialisation && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filteredDoctors.map(d => {
              const isSelected = selectedDoctor === String(d.id);
              return (
                <button
                  key={d.id}
                  onClick={() => {
                    setSelectedDoctor(String(d.id));
                    setSelectedDate('');
                    setSlots([]);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all duration-200
                    ${isSelected
                      ? 'border-teal-500 bg-teal-50 shadow-md'
                      : 'border-gray-100 hover:border-teal-200 hover:bg-teal-50/30 bg-white'}`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
                    ${isSelected ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                    {d.name.replace(/^Dr\.\s*/, '').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold truncate ${isSelected ? 'text-teal-800' : 'text-gray-800'}`}>{d.name}</p>
                    <p className={`text-xs ${isSelected ? 'text-teal-500' : 'text-gray-400'}`}>₹{d.fees}</p>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />}
                </button>
              );
            })}
            {filteredDoctors.length === 0 && (
              <p className="text-sm text-gray-400 col-span-full py-4 text-center">No doctors found for this specialisation.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Step 3: Date + Actions ── */}
      <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5 transition-all duration-300
        ${!selectedDoctor ? 'opacity-40 pointer-events-none' : ''}`}>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <span className={`w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold
            ${selectedDoctor ? 'bg-teal-600' : 'bg-gray-300'}`}>3</span>
          Select Date & Manage Slots
        </h3>
        {selectedDoctor && (
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[180px] max-w-[260px]">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date</label>
              <input
                type="date"
                value={selectedDate}
                min={today}
                max={maxDate}
                onChange={e => { setSelectedDate(e.target.value); setSlots([]); }}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={loadSlots}
                disabled={!selectedDoctor || !selectedDate || loadingSlots}
                className="flex items-center gap-1.5 bg-teal-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-teal-700 disabled:opacity-50 transition"
              >
                <RefreshCw className={`w-4 h-4 ${loadingSlots ? 'animate-spin' : ''}`} />
                Load Slots
              </button>
              <button
                onClick={handleGenerate}
                disabled={!selectedDoctor || !selectedDate}
                className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
              >
                <Zap className="w-4 h-4" />
                Generate
              </button>
              <button
                onClick={handleBlockDay}
                disabled={!selectedDoctor || !selectedDate}
                className="flex items-center gap-1.5 bg-red-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-red-600 disabled:opacity-50 transition"
              >
                <Ban className="w-4 h-4" />
                Block Day
              </button>
            </div>
          </div>
        )}

        {/* Feedback messages */}
        {actionMsg   && <p className="mt-3 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{actionMsg}</p>}
        {actionError && <p className="mt-3 text-sm text-red-600   bg-red-50   rounded-lg px-3 py-2">{actionError}</p>}
      </div>

      {/* ── Legend ── */}
      {slots.length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-teal-500 inline-block"></span> Available (click to block)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-300 inline-block"></span> Blocked (click to unblock)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-300 inline-block"></span> Booked by patient</span>
        </div>
      )}

      {/* ── Slot Grid ── */}
      {slots.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-600" />
              {slots.length} slots — {selectedDate}
            </h3>
            <span className="text-xs text-gray-400">
              {slots.filter(s => s.is_booked).length} booked &nbsp;·&nbsp;
              {slots.filter(s => !s.is_booked && !s.is_available).length} blocked &nbsp;·&nbsp;
              {slots.filter(s => !s.is_booked && s.is_available).length} available
            </span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
            {slots.map(s => {
              const isBooked   = s.is_booked === 1;
              const isBlocked  = !s.is_booked && !s.is_available;
              const isToggling = togglingId === s.id;

              let cls = '';
              let label = '';
              if (isBooked) {
                cls   = 'bg-red-100 border-red-200 text-red-500 cursor-not-allowed';
                label = 'Booked';
              } else if (isBlocked) {
                cls   = 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200 cursor-pointer';
                label = 'Blocked';
              } else {
                cls   = 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100 cursor-pointer';
                label = 'Open';
              }

              return (
                <button
                  key={s.id}
                  onClick={() => !isBooked && handleToggle(s.id)}
                  disabled={isBooked || isToggling}
                  title={label}
                  className={`relative text-xs font-medium rounded-lg border px-1 py-2 text-center transition-all ${cls} ${isToggling ? 'opacity-50' : ''}`}
                >
                  {formatTime(s.time)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loadingSlots && slots.length === 0 && selectedDoctor && selectedDate && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center text-gray-400">
          <Clock className="mx-auto w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm">Select a doctor and date, then click <strong>Load Slots</strong>.</p>
        </div>
      )}
    </div>
  );
}
