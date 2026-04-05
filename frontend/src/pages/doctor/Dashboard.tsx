
import { Calendar, Users, Activity } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function DoctorDashboard() {
  const { user } = useAuth();

  const stats = [
    { name: "Today's Appointments", stat: '8', icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-100' },
    { name: 'Total Patients', stat: '142', icon: Users, color: 'text-teal-600', bg: 'bg-teal-100' },
    { name: 'Pending Prescriptions', stat: '3', icon: Activity, color: 'text-orange-500', bg: 'bg-orange-100' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          Dr. {user?.name}'s Overview
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
          <h2 className="text-lg font-bold text-gray-900">Today's Schedule</h2>
        </div>
        <div className="border border-gray-100 rounded-lg overflow-hidden divide-y divide-gray-50">
          <div className="flex items-center p-4 hover:bg-gray-50 transition">
            <div className="w-20 text-center border-r border-gray-100 pr-4 mr-4">
              <p className="font-bold text-gray-900">09:00 AM</p>
              <p className="text-xs text-gray-500">30 min</p>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">John Doe</p>
              <p className="text-sm text-gray-500 flex items-center mt-1">
                <Activity className="w-3 h-3 mr-1" /> General Checkup
              </p>
            </div>
            <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full font-medium capitalize">
              pending
            </span>
          </div>

          <div className="flex items-center p-4 hover:bg-gray-50 transition">
            <div className="w-20 text-center border-r border-gray-100 pr-4 mr-4">
              <p className="font-bold text-gray-900">10:00 AM</p>
              <p className="text-xs text-gray-500">30 min</p>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Jane Smith</p>
              <p className="text-sm text-gray-500 flex items-center mt-1">
                <Activity className="w-3 h-3 mr-1" /> Follow-up
              </p>
            </div>
            <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-medium capitalize">
              completed
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
