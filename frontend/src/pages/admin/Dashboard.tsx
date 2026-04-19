import { useEffect, useState } from 'react';
import { Users, Stethoscope, Calendar, AlertCircle, TrendingUp, Activity } from 'lucide-react';
import { adminService } from '../../services/adminService';

export default function AdminDashboard() {
  const [patientCount, setPatientCount]       = useState(0);
  const [doctorCount, setDoctorCount]         = useState(0);
  const [appointmentCount, setAppointmentCount] = useState(0);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState('');

  useEffect(() => {
    Promise.all([
      adminService.getUsers(),
      adminService.getDoctors(),
      adminService.getAppointments(),
    ]).then(([u, d, a]) => {
      setPatientCount(u.data.data.filter((x: any) => x.role === 'patient').length);
      setDoctorCount(d.data.data.length);
      setAppointmentCount(a.data.data.length);
    }).catch(() => setError('Failed to load admin data.'))
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    { name: 'Total Patients',     stat: patientCount,     icon: Users,       color: 'text-teal-600',   bg: 'bg-teal-100',   gradient: 'from-teal-500 to-teal-600' },
    { name: 'Total Doctors',      stat: doctorCount,      icon: Stethoscope, color: 'text-blue-600',   bg: 'bg-blue-100',   gradient: 'from-blue-500 to-blue-600' },
    { name: 'Total Appointments', stat: appointmentCount, icon: Calendar,    color: 'text-orange-500', bg: 'bg-orange-100', gradient: 'from-orange-400 to-orange-500' },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome back! Here's a quick overview of your hospital management system.</p>
      </div>

      {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg"><AlertCircle className="w-4 h-4"/>{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {stats.map(item => (
          <div key={item.name} className="relative bg-white pt-5 px-4 pb-4 sm:pt-6 sm:px-6 shadow-sm rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            <dt>
              <div className={`absolute rounded-md p-3 ${item.bg}`}>
                <item.icon className={`h-6 w-6 ${item.color}`} />
              </div>
              <p className="ml-16 text-sm font-medium text-gray-500 truncate">{item.name}</p>
            </dt>
            <dd className="ml-16 pb-2">
              <p className="text-2xl font-semibold text-gray-900">{loading ? '…' : item.stat}</p>
            </dd>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-teal-600" />
          Quick Navigation
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <a href="/admin/patients" className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 hover:border-teal-200 hover:bg-teal-50/50 transition-all group">
            <div className="p-2.5 rounded-lg bg-teal-100 group-hover:bg-teal-200 transition">
              <Users className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Manage Patients</p>
              <p className="text-xs text-gray-500">View, edit & manage patient records</p>
            </div>
          </a>
          <a href="/admin/appointments" className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/50 transition-all group">
            <div className="p-2.5 rounded-lg bg-orange-100 group-hover:bg-orange-200 transition">
              <Calendar className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Appointments</p>
              <p className="text-xs text-gray-500">Track & update appointment statuses</p>
            </div>
          </a>
          <a href="/admin/doctors" className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/50 transition-all group">
            <div className="p-2.5 rounded-lg bg-blue-100 group-hover:bg-blue-200 transition">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Doctors & Slots</p>
              <p className="text-xs text-gray-500">Add doctors, manage slot availability</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
