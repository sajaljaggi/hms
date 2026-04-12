import { useEffect, useState } from 'react';
import { Clock, CheckCircle, UserCheck, AlertCircle, Heart, Activity, Brain, Bone, Stethoscope, Info } from 'lucide-react';
import { format, addDays, parse, addMinutes } from 'date-fns';
import { patientService } from '../../services/patientService';

const SPECIALIZATIONS = [
  { name: 'Cardiology', icon: Heart, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200', desc: 'Heart & Blood Vessels. Treats heart attacks, high blood pressure, and related issues.' },
  { name: 'Dermatology', icon: Activity, color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200', desc: 'Skin, Hair & Nails. Treats acne, eczema, hair loss, and skin health.' },
  { name: 'Neurology', icon: Brain, color: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-200', desc: 'Brain, Spinal Cord & Nerves. Treats headaches, stroke, and nerve pain.' },
  { name: 'Orthopedics', icon: Bone, color: 'text-stone-500', bg: 'bg-stone-50', border: 'border-stone-200', desc: 'Bones, Joints & Muscles. Treats fractures, arthritis, and sports injuries.' },
  { name: 'General Medicine', icon: Stethoscope, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200', desc: 'Overall health & Primary Care. Treats common fever, cold, stomach aches, etc.' },
];

interface Doctor  { id: number; name: string; specialization: string; fees: number; }
interface Slot    { id: number; date: string; time: string; }

// Utility to format "09:00:00" to "9:00 AM - 9:15 AM"
const formatSlotRange = (timeStr: string) => {
  try {
    const start = parse(timeStr, 'HH:mm:ss', new Date());
    const end = addMinutes(start, 15);
    return `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
  } catch {
    return timeStr;
  }
};

export default function BookAppointment() {
  const [spec,   setSpec]   = useState('');
  const [date,   setDate]   = useState<Date | null>(null);
  const [slot,   setSlot]   = useState<Slot | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [booked, setBooked] = useState(false);
  const [error,  setError]  = useState('');
  const [booking, setBooking] = useState(false);
  const [reason,  setReason]  = useState('');
  const [infoSpec, setInfoSpec] = useState<string | null>(null);

  const [doctors, setDoctors]   = useState<Doctor[]>([]);
  const [slots,   setSlots]     = useState<Slot[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [loadingSlots,   setLoadingSlots]   = useState(false);

  // Fetch doctors when spec changes
  useEffect(() => {
    if (!spec) { setDoctors([]); return; }
    setLoadingDoctors(true);
    patientService.getDoctors(spec)
      .then(res => setDoctors(res.data.data))
      .catch(() => setError('Could not load doctors.'))
      .finally(() => setLoadingDoctors(false));
  }, [spec]);

  // Fetch available slots when doctor + date both selected
  useEffect(() => {
    if (!doctor || !date) { setSlots([]); return; }
    setLoadingSlots(true);
    setSlot(null);
    patientService.getAvailableSlots(doctor.id, format(date, 'yyyy-MM-dd'))
      .then(res => setSlots(res.data.data))
      .catch(() => setError('Could not load slots.'))
      .finally(() => setLoadingSlots(false));
  }, [doctor, date]);

  const handleBook = async () => {
    if (!doctor || !slot) return;
    setBooking(true); setError('');
    try {
      await patientService.bookAppointment(doctor.id, slot.id, reason);
      setBooked(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Booking failed. Please try again.');
    } finally {
      setBooking(false);
    }
  };

  const reset = () => { setBooked(false); setSpec(''); setDate(null); setSlot(null); setDoctor(null); setDoctors([]); setSlots([]); setReason(''); };

  if (booked) return (
    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl shadow-sm">
      <div className="rounded-full bg-green-100 p-3 mb-4">
        <CheckCircle className="h-16 w-16 text-green-500" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Appointment Confirmed!</h2>
      <p className="text-gray-500 mb-1">Your appointment with <strong>{doctor?.name}</strong> is scheduled for:</p>
      <p className="text-teal-700 font-semibold mb-6">{date && format(date, 'MMM dd, yyyy')} | {slot && formatSlotRange(slot.time)}</p>
      <button onClick={reset} className="bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700 transition font-medium">
        Book Another Appointment
      </button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Book Appointment</h1>
        <p className="text-gray-500">Follow the steps below to schedule your visit.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Step 1: Specialization */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
            <span className="bg-teal-100 text-teal-700 w-6 h-6 rounded-full inline-flex items-center justify-center text-sm mr-2">1</span>
            Select Specialization
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {SPECIALIZATIONS.map(s => {
              const Icon = s.icon;
              const isSelected = spec === s.name;
              const showingInfo = infoSpec === s.name;
              return (
                <button
                  key={s.name}
                  onClick={() => { if (!showingInfo) { setSpec(s.name); setDate(null); setSlot(null); setDoctor(null); setReason(''); setInfoSpec(null); } }}
                  className={`relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-300 ${isSelected ? 'border-teal-500 bg-teal-50 shadow-md transform scale-[1.02]' : 'border-gray-100 hover:border-teal-200 hover:bg-teal-50/30 hover:shadow-sm bg-white'}`}
                >
                  <div 
                    onClick={(e) => { e.stopPropagation(); setInfoSpec(showingInfo ? null : s.name); }}
                    className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-colors z-10"
                    title="What is this?"
                  >
                    <Info className="w-5 h-5" />
                  </div>

                  {!showingInfo ? (
                    <>
                      <div className={`p-4 rounded-full mb-3 transition-transform duration-300 ${isSelected ? 'bg-teal-100 text-teal-600 scale-110' : `${s.bg} ${s.color}`}`}>
                        <Icon className="w-8 h-8" />
                      </div>
                      <span className={`text-base font-bold text-center ${isSelected ? 'text-teal-900' : 'text-gray-800'}`}>
                        {s.name}
                      </span>
                    </>
                  ) : (
                    <div className="flex flex-col items-center text-center animate-in fade-in duration-300 h-full justify-center">
                      <span className={`text-sm font-bold mb-2 ${s.color}`}>{s.name}</span>
                      <p className="text-xs text-gray-600 leading-relaxed font-medium">{s.desc}</p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          
          {spec === 'General Medicine' && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="block text-sm font-medium text-blue-900 mb-2">
                Reason for Visit <span className="text-gray-500 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. regular checkup, cough, cold, viral..."
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="block w-full pl-3 pr-3 py-2 border-blue-200 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md border bg-white"
              />
            </div>
          )}
        </div>

        {/* Step 2: Date & Time */}
        {spec && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold mb-6 text-gray-800 flex items-center">
              <span className="bg-teal-100 text-teal-700 w-6 h-6 rounded-full inline-flex items-center justify-center text-sm mr-2">2</span>
              Select Date
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {Array.from({ length: 14 }).map((_, offset) => {
                const d = addDays(new Date(), offset);
                const selected = date && format(date, 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd');
                return (
                  <button key={offset} onClick={() => { setDate(d); setSlot(null); }}
                    className={`flex-shrink-0 flex flex-col items-center justify-center w-20 h-24 rounded-xl border transition-all
                      ${selected ? 'bg-teal-600 text-white border-teal-600 shadow-md scale-105' : 'bg-white border-gray-200 text-gray-700 hover:border-teal-400 hover:bg-teal-50'}`}>
                    <span className="text-xs uppercase font-medium">{format(d, 'MMM')}</span>
                    <span className="text-2xl font-bold my-1">{format(d, 'dd')}</span>
                    <span className="text-xs font-medium">{format(d, 'EEE')}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3: Choose Doctor */}
        {spec && date && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold mb-6 text-gray-800 flex items-center">
              <span className="bg-teal-100 text-teal-700 w-6 h-6 rounded-full inline-flex items-center justify-center text-sm mr-2">3</span>
              Choose Doctor
            </h2>
            {loadingDoctors ? <p className="text-gray-400 text-sm">Loading doctors…</p>
            : doctors.length === 0 ? (
              <div className="p-8 text-center bg-gray-50 rounded-lg">
                <UserCheck className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                <p className="text-gray-500 font-medium">No doctors found for this specialization.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {doctors.map(d => (
                  <div key={d.id} onClick={() => { setDoctor(d); setSlot(null); }}
                    className={`overflow-hidden border rounded-xl cursor-pointer transition-all duration-300 transform hover:-translate-y-1 bg-white
                      ${doctor?.id === d.id ? 'border-teal-500 shadow-xl ring-2 ring-teal-500 scale-[1.02]' : 'border-gray-200 hover:shadow-lg hover:border-teal-300'}`}>
                    <div className="w-full h-40 bg-gray-200 overflow-hidden relative group">
                      <img 
                        src={`https://i.pravatar.cc/300?u=${d.id}${d.name.replace(/\s+/g, '')}`} 
                        alt={d.name} 
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(d.name)}&background=0f766e&color=fff&size=300`; }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-gray-900/20 to-transparent"></div>
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <p className="font-bold text-white text-lg leading-tight truncate">{d.name}</p>
                        <p className="text-sm text-teal-200 font-medium">{d.specialization}</p>
                      </div>
                      {doctor?.id === d.id && (
                        <div className="absolute top-3 right-3 bg-teal-500 rounded-full p-1 shadow-md">
                          <CheckCircle className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="p-4 bg-white border-t border-gray-100">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Consultation Fee</p>
                        <span className="text-teal-700 font-extrabold text-lg">₹{d.fees}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Available Slots */}
        {spec && date && doctor && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
              <span className="bg-teal-100 text-teal-700 w-6 h-6 rounded-full inline-flex items-center justify-center text-sm mr-2">4</span>
              <Clock className="w-4 h-4 mr-2 text-teal-600" /> Choose Time Slot
            </h2>
            {loadingSlots ? <p className="text-gray-400 text-sm">Loading slots…</p>
            : slots.length === 0 ? (
              <p className="text-gray-500 text-sm">No available slots for this doctor on {format(date, 'MMM dd')}. Try another date.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {slots.map(s => (
                  <button key={s.id} onClick={() => setSlot(s)}
                    className={`py-2 pt-3 px-4 text-sm font-medium rounded-lg border transition-all duration-300
                      ${slot?.id === s.id ? 'bg-teal-600 border-teal-600 text-white shadow-md transform scale-105' : 'bg-white border-gray-200 text-gray-700 hover:border-teal-400 hover:bg-teal-50 hover:shadow-sm'}`}>
                    <div className="flex flex-col items-center">
                      <span>{formatSlotRange(s.time).split(' - ')[0]}</span>
                      <span className="text-xs opacity-70 mb-1">to</span>
                      <span>{formatSlotRange(s.time).split(' - ')[1]}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirm */}
      {spec && date && doctor && slot && (
        <div className="mt-4 bg-teal-50 p-6 rounded-xl border border-teal-200 shadow-sm sticky bottom-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div>
              <p className="text-sm text-teal-800 font-medium">Selected Consultation</p>
              <p className="text-lg font-bold text-teal-900">{doctor.name} &bull; ₹{doctor.fees}</p>
              <p className="text-sm text-teal-700">{format(date, 'MMM dd, yyyy')} &bull; {formatSlotRange(slot.time)}</p>
            </div>
            <button onClick={handleBook} disabled={booking}
              className="w-full sm:w-auto bg-teal-600 text-white py-3 px-8 rounded-lg font-bold shadow-md hover:bg-teal-700 transition disabled:opacity-60">
              {booking ? 'Booking…' : 'Confirm Booking'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
