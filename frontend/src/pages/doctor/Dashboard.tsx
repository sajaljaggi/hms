import { useEffect, useState } from 'react';
import { Calendar, Users, Activity, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { doctorService } from '../../services/doctorService';
import { format, isToday, isTomorrow, parse } from 'date-fns';

interface DashboardData {
  totalPatients: number;
  upcomingAppointments: number;
  pendingPrescriptions: number;
  schedule: {
    id: number;
    status: string;
    reason: string | null;
    date: string;
    time: string;
    patient_name: string;
  }[];
}

export default function DoctorDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    doctorService.getDashboardStats()
      .then(res => setData(res.data.data))
      .catch(err => console.error('Failed to fetch dashboard stats', err))
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    { name: "Upcoming Appointments", stat: data?.upcomingAppointments || 0, icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-100' },
    { name: 'Total Patients', stat: data?.totalPatients || 0, icon: Users, color: 'text-teal-600', bg: 'bg-teal-100' },
    { name: 'Pending Prescriptions', stat: data?.pendingPrescriptions || 0, icon: Activity, color: 'text-orange-500', bg: 'bg-orange-100' },
  ];

  const formatTime = (timeStr: string) => {
    try {
      return format(parse(timeStr, 'HH:mm:ss', new Date()), 'h:mm A');
    } catch { return timeStr; }
  };

  if (loading) return <div className="p-8 text-gray-500">Loading dashboard...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          {user?.name}'s Overview
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((item) => (
          <div key={item.name} className="relative bg-white pt-5 px-4 pb-4 sm:pt-6 sm:px-6 shadow-sm rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            <dt>
              <div className={`absolute rounded-md p-3 ${item.bg}`}>
                <item.icon className={`h-6 w-6 ${item.color}`} aria-hidden="true" />
              </div>
              <p className="ml-16 text-sm font-medium text-gray-500 truncate">{item.name}</p>
            </dt>
            <dd className="ml-16 pb-2 flex items-baseline sm:pb-3">
              <p className="text-2xl font-semibold text-gray-900">{item.stat}</p>
            </dd>
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <item.icon className="h-16 w-16 text-gray-900" />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-gray-100 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-gray-900">Next 2 Days Schedule</h2>
          <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">Today & Tomorrow</span>
        </div>
        
        {data?.schedule && data.schedule.length > 0 ? (
          <div className="border border-gray-100 rounded-lg overflow-hidden divide-y divide-gray-50">
            {data.schedule.map((appt) => {
              const apptDate = new Date(appt.date);
              const dayLabel = isToday(apptDate) ? 'Today' : isTomorrow(apptDate) ? 'Tomorrow' : format(apptDate, 'MMM dd');
              
              return (
                <div key={appt.id} className="flex items-center p-4 hover:bg-gray-50 transition">
                  <div className="w-24 text-center border-r border-gray-100 pr-4 mr-4">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-teal-600 mb-0.5">{dayLabel}</p>
                    <p className="font-bold text-gray-900 text-sm whitespace-nowrap">{formatTime(appt.time)}</p>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{appt.patient_name}</p>
                    <p className="text-sm text-gray-500 flex items-center mt-1">
                      <Activity className="w-3 h-3 mr-1" /> {appt.reason || 'General Checkup'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter ${
                      appt.status === 'completed' ? 'bg-green-100 text-green-700' : 
                      appt.status === 'cancelled' ? 'bg-red-100 text-red-700' : 
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {appt.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400 border border-dashed border-gray-200 rounded-lg">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">No appointments scheduled for today or tomorrow.</p>
          </div>
        )}
      </div>
    </div>
  );
}
