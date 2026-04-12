import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { Role } from '../../context/AuthContext';
import { Activity, Lock, Mail, Users, AlertCircle } from 'lucide-react';

export default function Login() {
  const location   = useLocation();
  const navigate   = useNavigate();
  const { login, register } = useAuth();

  const [role, setRole]     = useState<Role>((location.state?.role as Role) || 'patient');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const hideRoleSelection = !!location.state?.role;

  // Form fields
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [guardian_name, setGuardianName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register({ name, email, password, role: 'patient', guardian_name, phone, gender, age, weight, address, city });
      }
      if (location.state?.redirectTo && role === location.state?.role) {
        navigate(location.state.redirectTo);
      } else {
        navigate(`/${role}`);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-teal-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="rounded-full bg-teal-600 p-3 shadow-lg">
            <Activity className="h-10 w-10 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 tracking-tight">
          Hospital Management System
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          {isLogin ? 'Sign in to your account' : 'Create a new account'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-2xl sm:px-10 border border-teal-100">

          {/* Sign In / Register tabs — patients only */}
          {role === 'patient' && (
            <div className="mb-6 flex rounded-lg bg-gray-100 p-1">
              <button onClick={() => setIsLogin(true)}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${isLogin ? 'bg-white shadow-sm text-teal-700' : 'text-gray-500 hover:text-gray-700'}`}>
                Sign In
              </button>
              <button onClick={() => setIsLogin(false)}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${!isLogin ? 'bg-white shadow-sm text-teal-700' : 'text-gray-500 hover:text-gray-700'}`}>
                Register
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            {/* Name — register only */}
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Full Name</label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Users className="h-5 w-5 text-gray-400" />
                  </div>
                  <input type="text" required value={name} onChange={e => setName(e.target.value)}
                    className="focus:ring-teal-500 focus:border-teal-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
                    placeholder="John Doe" />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Email address</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  className="focus:ring-teal-500 focus:border-teal-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
                  placeholder="you@example.com" />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                  className="focus:ring-teal-500 focus:border-teal-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
                  placeholder="••••••••" />
              </div>
            </div>

            {/* Extended Registration Fields */}
            {!isLogin && (
              <div className="space-y-4 pt-4 border-t border-gray-100 mt-2">
                <p className="text-sm font-semibold text-teal-800 mb-2">Personal & Medical Details</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Father/Spouse Name</label>
                    <input type="text" value={guardian_name} onChange={e => setGuardianName(e.target.value)}
                      className="mt-1 focus:ring-teal-500 focus:border-teal-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
                      placeholder="Name" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Phone</label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                      className="mt-1 focus:ring-teal-500 focus:border-teal-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
                      placeholder="+91..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Age</label>
                    <input type="number" value={age} onChange={e => setAge(e.target.value)}
                      className="mt-1 focus:ring-teal-500 focus:border-teal-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
                      placeholder="Years" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Weight Range (kg)</label>
                    <select value={weight} onChange={e => setWeight(e.target.value)}
                      className="mt-1 focus:ring-teal-500 focus:border-teal-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border bg-white">
                      <option value="">Select Range</option>
                      <option value="Under 5 kg">Under 5 kg</option>
                      <option value="5-10 kg">5-10 kg</option>
                      <option value="10-15 kg">10-15 kg</option>
                      <option value="15-20 kg">15-20 kg</option>
                      <option value="20-30 kg">20-30 kg</option>
                      <option value="30-40 kg">30-40 kg</option>
                      <option value="40-50 kg">40-50 kg</option>
                      <option value="50-60 kg">50-60 kg</option>
                      <option value="60-70 kg">60-70 kg</option>
                      <option value="70-80 kg">70-80 kg</option>
                      <option value="80-90 kg">80-90 kg</option>
                      <option value="90-100 kg">90-100 kg</option>
                      <option value="100-110 kg">100-110 kg</option>
                      <option value="110-120 kg">110-120 kg</option>
                      <option value="120+ kg">120+ kg</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Gender</label>
                    <select value={gender} onChange={e => setGender(e.target.value)}
                      className="mt-1 focus:ring-teal-500 focus:border-teal-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border bg-white">
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">City</label>
                    <input type="text" value={city} onChange={e => setCity(e.target.value)}
                      className="mt-1 focus:ring-teal-500 focus:border-teal-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
                      placeholder="City" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Complete Address</label>
                  <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                    className="mt-1 focus:ring-teal-500 focus:border-teal-500 block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
                    placeholder="123, Street Name, Area" />
                </div>
              </div>
            )}

            {/* Role selector (shown only when coming from home logins section) */}
            {!hideRoleSelection && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Role</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['patient', 'doctor', 'admin'] as Role[]).map((r) => (
                    <button key={r} type="button" onClick={() => { setRole(r); setIsLogin(true); }}
                      className={`py-2 px-3 border rounded-md text-sm font-medium capitalize ${role === r
                        ? 'bg-teal-50 border-teal-500 text-teal-700 ring-1 ring-teal-500'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
              {loading ? 'Please wait…' : isLogin ? 'Sign In' : 'Register'}
            </button>
          </form>

          {/* Hint for demo credentials */}
          <div className="mt-6 text-center text-xs text-gray-400 border-t pt-4">
            Demo — Admin: <strong>admin@hms.com</strong> / Doctors: <strong>sarah@hms.com</strong> · Password: <strong>password</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
