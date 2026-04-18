
import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { LogOut, Home, Calendar, Users, FileText, User as UserIcon, Activity, Clock, FilePlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Chatbot from './Chatbot';

const Layout = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  const getNavigation = () => {
    switch (user?.role) {
      case 'patient':
        return [
          { name: 'Dashboard', href: '/patient', icon: Home },
          { name: 'Book Appointment', href: '/patient/book', icon: Calendar },
          { name: 'Appointment History', href: '/patient/history', icon: Clock },
          { name: 'Medical History', href: '/patient/records', icon: FileText },
          { name: 'Profile', href: '/patient/profile', icon: UserIcon },
        ];
      case 'doctor':
        return [
          { name: 'Dashboard', href: '/doctor', icon: Home },
          { name: 'Appointments', href: '/doctor/appointments', icon: Calendar },
          { name: 'Prescriptions', href: '/doctor/prescribe', icon: FilePlus },
        ];
      case 'admin':
        return [
          { name: 'Dashboard', href: '/admin', icon: Home },
          { name: 'Staff Management', href: '/admin/staff', icon: Users },
          { name: 'Patients', href: '/admin/patients', icon: Activity },
          { name: 'All Appointments', href: '/admin/appointments', icon: Calendar },
        ];
      default:
        return [];
    }
  };

  const navigation = getNavigation();

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-teal-800 text-white flex-shrink-0 border-r border-teal-700 hidden md:flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-teal-700 bg-teal-900">
          <Activity className="h-8 w-8 text-teal-300 mr-2" />
          <span className="text-xl font-bold tracking-wider text-white">HMS Portal</span>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="px-3 space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`
                    group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-150
                    ${isActive 
                      ? 'bg-teal-700 text-white' 
                      : 'text-teal-100 hover:bg-teal-700/50 hover:text-white'}
                  `}
                >
                  <item.icon
                    className={`mr-3 h-5 w-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-teal-300 group-hover:text-white'}`}
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="p-4 border-t border-teal-700 bg-teal-900/50">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-8 w-8 rounded-full bg-teal-500 flex items-center justify-center text-white font-bold">
                {user?.name.charAt(0)}
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-white group-hover:text-gray-900 truncate w-32">
                {user?.name}
              </p>
              <p className="text-xs font-medium text-teal-300 group-hover:text-gray-700 capitalize">
                {user?.role}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden w-full">
        <header className="h-16 flex items-center justify-between bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 shadow-sm">
          <div className="md:hidden flex items-center">
             <Activity className="h-6 w-6 text-teal-600 mr-2" />
             <span className="text-lg font-bold text-gray-900">HMS Portal</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center ml-4">
            <button
              onClick={() => {
                logout();
                window.location.href = '/';
              }}
              className="flex items-center text-sm font-medium text-gray-700 hover:text-red-600 transition-colors"
            >
              <LogOut className="h-5 w-5 mr-1" />
              Sign Out
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto w-full bg-gray-50 focus:outline-none rounded-tl-xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* Chatbot — visible only for patients */}
      {user?.role === 'patient' && <Chatbot />}
    </div>
  );
};

export default Layout;
