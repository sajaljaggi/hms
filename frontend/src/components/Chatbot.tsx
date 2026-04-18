import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageCircle,
  X,
  Send,
  Bot,
  User,
  Sparkles,
  Calendar,
  Stethoscope,
  Clock,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { format, addDays, parse, addMinutes } from 'date-fns';
import { chatbotService, type ChatDoctor, type ChatSlot, type ChatAppointment } from '../services/chatbotService';
import { useAuth } from '../context/AuthContext';

/* ── Types ──────────────────────────────────────────────────────────────── */
interface Message {
  id: string;
  role: 'user' | 'bot';
  content: string;
  timestamp: Date;
  doctors?: ChatDoctor[];
  slots?: ChatSlot[];
  appointments?: ChatAppointment[];
  bookingConfirmed?: boolean;
  isQuickActions?: boolean;
}

type BookingStep = 'idle' | 'select-doctor' | 'select-date' | 'select-slot' | 'confirm' | 'done';

/* ── Helpers ────────────────────────────────────────────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 10);

const formatSlotRange = (timeStr: string) => {
  try {
    const start = parse(timeStr, 'HH:mm:ss', new Date());
    const end = addMinutes(start, 15);
    return `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`;
  } catch {
    return timeStr;
  }
};

const QUICK_ACTIONS = [
  { label: '🩺 Find a Doctor', text: 'I want to find a doctor' },
  { label: '📅 Book Appointment', text: 'I want to book an appointment' },
  { label: '🤒 I have symptoms', text: 'I have some symptoms I need help with' },
  { label: '📋 My Appointments', text: 'Show my upcoming appointments' },
  { label: '🏥 Hospital Info', text: 'Tell me about your hospital' },
];

/* ── Component ──────────────────────────────────────────────────────────── */
export default function Chatbot() {
  const { user, isAuthenticated } = useAuth();

  // Chat state
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [history, setHistory] = useState<{ role: string; content: string }[]>([]);

  // Booking state
  const [bookingStep, setBookingStep] = useState<BookingStep>('idle');
  const [bookingSpec, setBookingSpec] = useState('');
  const [bookingDoctors, setBookingDoctors] = useState<ChatDoctor[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<ChatDoctor | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [bookingSlots, setBookingSlots] = useState<ChatSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<ChatSlot | null>(null);
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [bookingReason, setBookingReason] = useState('');

  // Pulse animation for FAB
  const [showPulse, setShowPulse] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, bookingStep, bookingDoctors, bookingSlots]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const greeting = isAuthenticated
        ? `Hi ${user?.name?.split(' ')[0]} 👋! I'm **MediBot**, your healthcare assistant. How can I help you today?`
        : `Hello 👋! I'm **MediBot**, your healthcare assistant at Care & Cure Hospital. I can help you find doctors, understand symptoms, or book appointments. How can I help?`;

      setMessages([
        {
          id: uid(),
          role: 'bot',
          content: greeting,
          timestamp: new Date(),
        },
        {
          id: uid(),
          role: 'bot',
          content: '',
          timestamp: new Date(),
          isQuickActions: true,
        },
      ]);
    }
  }, [isOpen]);

  /* ── Add message ─────────────────────────────────────────────────────── */
  const addBotMessage = useCallback((content: string, extras?: Partial<Message>) => {
    setMessages(prev => [
      ...prev,
      { id: uid(), role: 'bot', content, timestamp: new Date(), ...extras },
    ]);
  }, []);

  /* ── Send message ────────────────────────────────────────────────────── */
  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg) return;

    // Add user message
    setMessages(prev => [
      ...prev.filter(m => !m.isQuickActions),
      { id: uid(), role: 'user', content: msg, timestamp: new Date() },
    ]);
    setInput('');
    setIsTyping(true);

    // Update history for context
    const newHistory = [...history, { role: 'user', content: msg }];

    try {
      const { data } = await chatbotService.sendMessage(msg, newHistory);
      const resp = data.data;

      setHistory([...newHistory, { role: 'model', content: resp.message }]);
      addBotMessage(resp.message);

      // Handle actions
      if (resp.action) {
        const spec = resp.action.specialization || '';
        if (
          resp.action.type === 'RECOMMEND_SPECIALIZATION' ||
          resp.action.type === 'START_BOOKING' ||
          resp.action.type === 'SHOW_DOCTORS'
        ) {
          if (!isAuthenticated) {
            addBotMessage(
              "To book an appointment, you'll need to **log in** first. Please [click here to login](/login) and come back to chat! 🔐"
            );
          } else if (user?.role !== 'patient') {
            addBotMessage("Appointment booking is available for patients. You're currently logged in as a " + user?.role + ".");
          } else {
            await startBookingFlow(spec);
          }
        } else if (resp.action.type === 'SHOW_APPOINTMENTS') {
          if (!isAuthenticated) {
            addBotMessage(
              "To view your appointments, you'll need to **log in** first. Please [click here to login](/login) and come back! 🔐"
            );
          } else if (user?.role !== 'patient') {
            addBotMessage("Appointment viewing is available for patients. You're currently logged in as a " + user?.role + ".");
          } else {
            await fetchAppointments(resp.action.filter || 'all');
          }
        }
      }
    } catch {
      addBotMessage("Sorry, I'm having trouble right now. Please try again in a moment. 🏥");
    } finally {
      setIsTyping(false);
    }
  };

  /* ── Fetch Appointments ───────────────────────────────────────────── */
  const fetchAppointments = async (filter: string) => {
    setIsTyping(true);
    try {
      const { data } = await chatbotService.getAppointments(filter);
      const appts = data.data;
      if (appts.length === 0) {
        const label = filter === 'upcoming' ? 'upcoming' : filter === 'past' ? 'past' : '';
        addBotMessage(`You don't have any ${label} appointments right now. Would you like to **book a new appointment**? 📅`);
      } else {
        const label = filter === 'upcoming' ? 'upcoming' : filter === 'past' ? 'past' : '';
        addBotMessage(`Here are your ${label} appointments:`, { appointments: appts });
      }
    } catch {
      addBotMessage('Sorry, I could not fetch your appointments right now. Please try again or check your **Appointment History** page.');
    } finally {
      setIsTyping(false);
    }
  };

  /* ── Booking Flow ────────────────────────────────────────────────── */
  const startBookingFlow = async (specialization: string) => {
    setBookingSpec(specialization);
    setBookingStep('select-doctor');
    setIsLoadingDoctors(true);
    try {
      const { data } = await chatbotService.getDoctors(specialization);
      setBookingDoctors(data.data);
      if (data.data.length === 0) {
        addBotMessage(`No doctors are currently available for **${specialization}**. Please try another specialization or visit our **Book Appointment** page.`);
        resetBooking();
      } else {
        addBotMessage(`Here are the available **${specialization}** doctors. Please select one:`, {
          doctors: data.data,
        });
      }
    } catch {
      addBotMessage('Failed to load doctors. Please try again.');
      resetBooking();
    } finally {
      setIsLoadingDoctors(false);
    }
  };

  const handleDoctorSelect = (doctor: ChatDoctor) => {
    setSelectedDoctor(doctor);
    setBookingStep('select-date');
    setMessages(prev => [
      ...prev,
      { id: uid(), role: 'user', content: `Selected Dr. ${doctor.name}`, timestamp: new Date() },
    ]);
    addBotMessage(`Great choice! **Dr. ${doctor.name}** (₹${doctor.fees} consultation fee). Now please pick a date for your appointment:`);
  };

  const handleDateSelect = async (date: Date) => {
    if (!selectedDoctor) return;
    setSelectedDate(date);
    setBookingStep('select-slot');
    setIsLoadingSlots(true);
    setMessages(prev => [
      ...prev,
      { id: uid(), role: 'user', content: `Selected ${format(date, 'MMM dd, yyyy (EEEE)')}`, timestamp: new Date() },
    ]);

    try {
      const { data } = await chatbotService.getSlots(selectedDoctor.id, format(date, 'yyyy-MM-dd'));
      setBookingSlots(data.data);
      if (data.data.length === 0) {
        addBotMessage(`No slots available on **${format(date, 'MMM dd')}**. Please try another date.`);
        setBookingStep('select-date');
      } else {
        addBotMessage(`Available slots on **${format(date, 'MMM dd')}**. Pick a time:`, {
          slots: data.data,
        });
      }
    } catch {
      addBotMessage('Failed to load slots. Please try again.');
      setBookingStep('select-date');
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const handleSlotSelect = (slot: ChatSlot) => {
    setSelectedSlot(slot);
    setBookingStep('confirm');
    setMessages(prev => [
      ...prev,
      { id: uid(), role: 'user', content: `Selected ${formatSlotRange(slot.time)}`, timestamp: new Date() },
    ]);
    addBotMessage(
      `Perfect! Here's your booking summary:\n\n` +
      `👨‍⚕️ **Dr. ${selectedDoctor?.name}** — ${bookingSpec}\n` +
      `📅 **${selectedDate ? format(selectedDate, 'MMM dd, yyyy') : ''}**\n` +
      `🕐 **${formatSlotRange(slot.time)}**\n` +
      `💰 **₹${selectedDoctor?.fees}** consultation fee\n\n` +
      `Shall I confirm this booking?`
    );
  };

  const confirmBooking = async () => {
    if (!selectedDoctor || !selectedSlot) return;
    setIsBooking(true);
    try {
      await chatbotService.bookAppointment(selectedDoctor.id, selectedSlot.id, bookingReason || bookingSpec);
      setBookingStep('done');
      addBotMessage(
        `✅ **Appointment Confirmed!**\n\nYour appointment with **Dr. ${selectedDoctor.name}** on **${selectedDate ? format(selectedDate, 'MMM dd, yyyy') : ''}** at **${formatSlotRange(selectedSlot.time)}** has been booked successfully!\n\nYou can view your appointments from the dashboard. Is there anything else I can help with? 😊`,
        { bookingConfirmed: true }
      );
      resetBooking();
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || 'Booking failed. Please try again.';
      addBotMessage(`❌ ${errMsg}`);
    } finally {
      setIsBooking(false);
    }
  };

  const resetBooking = () => {
    setBookingStep('idle');
    setBookingSpec('');
    setBookingDoctors([]);
    setSelectedDoctor(null);
    setSelectedDate(null);
    setBookingSlots([]);
    setSelectedSlot(null);
    setBookingReason('');
  };

  const cancelBooking = () => {
    resetBooking();
    addBotMessage("Booking cancelled. No worries! Is there anything else I can help with? 😊");
  };

  /* ── Render Helpers ──────────────────────────────────────────────────── */
  const renderMarkdown = (text: string) => {
    // Simple markdown: **bold**, [link](url), newlines
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-teal-400 underline hover:text-teal-300 transition-colors">$1</a>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <>
      {/* ── Floating Action Button ──────────────────────────────────────── */}
      <button
        id="chatbot-fab"
        onClick={() => { setIsOpen(!isOpen); setShowPulse(false); }}
        className={`
          fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full
          flex items-center justify-center
          shadow-lg transition-all duration-500 ease-out
          ${isOpen
            ? 'bg-gray-700 hover:bg-gray-600 rotate-0 scale-100'
            : 'bg-gradient-to-br from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 hover:scale-110'
          }
        `}
        style={{ boxShadow: isOpen ? undefined : '0 4px 24px rgba(20, 184, 166, 0.45)' }}
        aria-label={isOpen ? 'Close chatbot' : 'Open chatbot'}
      >
        {showPulse && !isOpen && (
          <>
            <span className="absolute w-full h-full rounded-full bg-teal-400 animate-ping opacity-40" />
            <span className="absolute w-full h-full rounded-full bg-teal-400 animate-pulse opacity-20" />
          </>
        )}
        {isOpen ? (
          <X className="w-6 h-6 text-white transition-transform duration-300" />
        ) : (
          <MessageCircle className="w-6 h-6 text-white transition-transform duration-300" />
        )}
      </button>

      {/* ── Chat Panel ──────────────────────────────────────────────────── */}
      <div
        className={`
          fixed bottom-24 right-6 z-50
          w-[380px] max-w-[calc(100vw-2rem)]
          transition-all duration-500 ease-out origin-bottom-right
          ${isOpen
            ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 scale-90 translate-y-4 pointer-events-none'
          }
        `}
        style={{
          height: 'min(580px, calc(100vh - 8rem))',
        }}
      >
        <div
          className="flex flex-col h-full rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.97), rgba(15, 23, 42, 0.99))',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(45, 212, 191, 0.15)',
            boxShadow: '0 25px 60px rgba(0,0,0,0.4), 0 0 40px rgba(20, 184, 166, 0.08)',
          }}
        >
          {/* ── Header ──────────────────────────────────────────────── */}
          <div
            className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(20, 184, 166, 0.15), rgba(16, 185, 129, 0.08))',
              borderBottom: '1px solid rgba(45, 212, 191, 0.12)',
            }}
          >
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center shadow-lg">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-slate-900" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-semibold text-sm tracking-wide">MediBot</h3>
              <p className="text-xs text-teal-300/80">Healthcare Assistant • Online</p>
            </div>
            {bookingStep !== 'idle' && (
              <button
                onClick={cancelBooking}
                className="text-xs text-red-400/80 hover:text-red-300 transition-colors bg-red-400/10 hover:bg-red-400/20 px-2.5 py-1 rounded-full"
              >
                Cancel Booking
              </button>
            )}
          </div>

          {/* ── Messages ────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {messages.map((msg) => {
              // Quick actions card
              if (msg.isQuickActions) {
                return (
                  <div key={msg.id} className="flex flex-wrap gap-2 pl-10">
                    {QUICK_ACTIONS.map((qa) => (
                      <button
                        key={qa.label}
                        onClick={() => sendMessage(qa.text)}
                        className="text-xs px-3 py-1.5 rounded-full border border-teal-500/30 text-teal-300 hover:bg-teal-500/15 hover:border-teal-400/50 transition-all duration-200"
                      >
                        {qa.label}
                      </button>
                    ))}
                  </div>
                );
              }

              return (
                <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'bot' && (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500/20 to-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5 border border-teal-500/20">
                      <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-teal-600 to-teal-700 text-white rounded-br-md shadow-md'
                        : 'bg-slate-800/60 text-slate-200 rounded-bl-md border border-slate-700/50'
                    }`}
                  >
                    <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />

                    {/* Doctor cards inside message */}
                    {msg.doctors && msg.doctors.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {msg.doctors.map((doc) => (
                          <button
                            key={doc.id}
                            onClick={() => handleDoctorSelect(doc)}
                            className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                              selectedDoctor?.id === doc.id
                                ? 'border-teal-400 bg-teal-500/15 shadow-md'
                                : 'border-slate-600/50 bg-slate-700/30 hover:border-teal-500/50 hover:bg-slate-700/60'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border border-slate-600">
                                <img
                                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(doc.name)}&background=0f766e&color=fff&size=80`}
                                  alt={doc.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-medium text-xs truncate">Dr. {doc.name}</p>
                                <p className="text-teal-400/80 text-[11px]">{doc.specialization}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-teal-300 font-bold text-xs">₹{doc.fees}</p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Slot chips inside message */}
                    {msg.slots && msg.slots.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {msg.slots.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => handleSlotSelect(s)}
                            className={`text-[11px] px-2.5 py-1.5 rounded-lg border transition-all duration-200 ${
                              selectedSlot?.id === s.id
                                ? 'bg-teal-500/20 border-teal-400 text-teal-300'
                                : 'border-slate-600/50 text-slate-300 hover:border-teal-500/40 hover:bg-slate-700/50'
                            }`}
                          >
                            <Clock className="w-3 h-3 inline mr-1 opacity-60" />
                            {formatSlotRange(s.time).split(' – ')[0]}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Booking confirmed */}
                    {msg.bookingConfirmed && (
                      <div className="mt-3 flex items-center gap-2 text-green-400">
                        <CheckCircle className="w-5 h-5" />
                        <span className="text-xs font-medium">Booking Confirmed</span>
                      </div>
                    )}

                    {/* Appointment cards */}
                    {msg.appointments && msg.appointments.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {msg.appointments.map((appt) => {
                          const isPast = new Date(appt.date) < new Date(new Date().toDateString());
                          const statusColor = appt.status === 'completed' ? 'text-green-400 bg-green-400/10'
                            : appt.status === 'cancelled' ? 'text-red-400 bg-red-400/10'
                            : 'text-amber-400 bg-amber-400/10';
                          return (
                            <div
                              key={appt.id}
                              className={`p-3 rounded-xl border transition-all ${
                                isPast ? 'border-slate-600/30 bg-slate-800/20 opacity-80' : 'border-teal-500/30 bg-slate-700/30'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-white font-medium text-xs truncate">
                                    👨‍⚕️ Dr. {appt.doctor_name}
                                  </p>
                                  <p className="text-teal-400/70 text-[11px]">{appt.specialization}</p>
                                </div>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${statusColor}`}>
                                  {appt.status}
                                </span>
                              </div>
                              <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {(() => { try { return format(new Date(appt.date), 'MMM dd, yyyy'); } catch { return appt.date; } })()}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatSlotRange(appt.time).split(' – ')[0]}
                                </span>
                                <span className="text-teal-300/70 ml-auto">₹{appt.fees}</span>
                              </div>
                              {appt.reason && (
                                <p className="mt-1 text-[10px] text-slate-500 truncate">Reason: {appt.reason}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-600 to-teal-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500/20 to-emerald-500/20 flex items-center justify-center flex-shrink-0 border border-teal-500/20">
                  <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                </div>
                <div className="bg-slate-800/60 rounded-2xl rounded-bl-md px-4 py-3 border border-slate-700/50">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-teal-400/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-teal-400/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-teal-400/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {/* Date picker in booking flow */}
            {bookingStep === 'select-date' && (
              <div className="pl-10">
                <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-teal-400" />
                    <span className="text-xs text-slate-300 font-medium">Select a date</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {Array.from({ length: 14 }).map((_, i) => {
                      const d = addDays(new Date(), i);
                      const isSelected = selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd');
                      return (
                        <button
                          key={i}
                          onClick={() => handleDateSelect(d)}
                          className={`flex-shrink-0 flex flex-col items-center justify-center w-14 h-16 rounded-xl border transition-all duration-200 ${
                            isSelected
                              ? 'bg-teal-500/20 border-teal-400 text-teal-300 shadow-md'
                              : 'border-slate-600/50 text-slate-300 hover:border-teal-500/40 hover:bg-slate-700/50'
                          }`}
                        >
                          <span className="text-[10px] uppercase font-medium opacity-70">{format(d, 'MMM')}</span>
                          <span className="text-base font-bold">{format(d, 'dd')}</span>
                          <span className="text-[10px] font-medium opacity-70">{format(d, 'EEE')}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Loading doctors */}
            {isLoadingDoctors && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500/20 to-emerald-500/20 flex items-center justify-center border border-teal-500/20">
                  <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                </div>
                <div className="bg-slate-800/60 rounded-2xl rounded-bl-md px-4 py-3 border border-slate-700/50 flex items-center gap-2 text-slate-400 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" /> Finding doctors...
                </div>
              </div>
            )}

            {/* Loading slots */}
            {isLoadingSlots && (
              <div className="flex gap-2.5 justify-start pl-10">
                <div className="bg-slate-800/60 rounded-2xl px-4 py-3 border border-slate-700/50 flex items-center gap-2 text-slate-400 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading available slots...
                </div>
              </div>
            )}

            {/* Confirm booking */}
            {bookingStep === 'confirm' && (
              <div className="pl-10 flex gap-2">
                <button
                  onClick={confirmBooking}
                  disabled={isBooking}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-xs font-semibold hover:from-teal-500 hover:to-emerald-500 transition-all shadow-md disabled:opacity-50"
                >
                  {isBooking ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Booking...</>
                  ) : (
                    <><CheckCircle className="w-3.5 h-3.5" /> Confirm Booking</>
                  )}
                </button>
                <button
                  onClick={cancelBooking}
                  disabled={isBooking}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-600 text-slate-300 text-xs font-medium hover:bg-slate-700/50 transition-all disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Input ───────────────────────────────────────────────── */}
          <div
            className="px-4 py-3 flex-shrink-0"
            style={{ borderTop: '1px solid rgba(45, 212, 191, 0.1)', background: 'rgba(15, 23, 42, 0.6)' }}
          >
            {bookingStep !== 'idle' && bookingStep !== 'done' && (
              <div className="flex items-center gap-2 mb-2 text-[11px]">
                <Stethoscope className="w-3 h-3 text-teal-400" />
                <span className="text-teal-400/70">
                  Booking: {bookingSpec} •{' '}
                  {bookingStep === 'select-doctor' && 'Select a doctor'}
                  {bookingStep === 'select-date' && 'Pick a date'}
                  {bookingStep === 'select-slot' && 'Choose a time'}
                  {bookingStep === 'confirm' && 'Confirm details'}
                </span>
                <button onClick={cancelBooking} className="ml-auto text-red-400/60 hover:text-red-400 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  bookingStep !== 'idle' && bookingStep !== 'done'
                    ? 'Or type a message...'
                    : 'Type your message...'
                }
                disabled={isTyping}
                className="flex-1 bg-slate-800/50 text-white text-sm placeholder-slate-500 rounded-xl px-4 py-2.5 border border-slate-700/50 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20 transition-all disabled:opacity-40"
              />
              <button
                type="submit"
                disabled={isTyping || !input.trim()}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white shadow-md hover:from-teal-400 hover:to-emerald-500 transition-all disabled:opacity-30 disabled:hover:from-teal-500 disabled:hover:to-emerald-600 flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <p className="text-center text-[10px] text-slate-500/60 mt-2">
              MediBot may make mistakes. Always consult a doctor.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
