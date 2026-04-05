import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';

// Auth Pages
const Login = React.lazy(() => import('./pages/auth/Login'));

// Patient Pages
const PatientDashboard = React.lazy(() => import('./pages/patient/Dashboard'));
const BookAppointment = React.lazy(() => import('./pages/patient/BookAppointment'));
const PatientHistory = React.lazy(() => import('./pages/patient/History'));
const MedicalHistory = React.lazy(() => import('./pages/patient/MedicalHistory'));
const Profile = React.lazy(() => import('./pages/patient/Profile'));

// Doctor Pages
const DoctorDashboard = React.lazy(() => import('./pages/doctor/Dashboard'));
const DoctorAppointments = React.lazy(() => import('./pages/doctor/Appointments'));
const DoctorPrescribe = React.lazy(() => import('./pages/doctor/Prescribe'));

// Admin Pages
const AdminDashboard = React.lazy(() => import('./pages/admin/Dashboard'));
const Home = React.lazy(() => import('./pages/Home'));

const Loader = () => (
  <div className="flex bg-gray-50 items-center justify-center min-h-screen content-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            
            <Route element={<Layout />}>
              {/* Patient Routes */}
              <Route path="patient">
                <Route index element={<PatientDashboard />} />
                <Route path="book" element={<BookAppointment />} />
                <Route path="history" element={<PatientHistory />} />
                <Route path="records" element={<MedicalHistory />} />
                <Route path="profile" element={<Profile />} />
              </Route>

              {/* Doctor Routes */}
              <Route path="doctor">
                <Route index element={<DoctorDashboard />} />
                <Route path="appointments" element={<DoctorAppointments />} />
                <Route path="prescribe" element={<DoctorPrescribe />} />
              </Route>

              {/* Admin Routes */}
              <Route path="admin">
                <Route index element={<AdminDashboard />} />
                <Route path="staff" element={<div>Staff Management Under Construction</div>} />
                <Route path="patients" element={<div>Patients Management Under Construction</div>} />
                <Route path="appointments" element={<div>All Appointments Under Construction</div>} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
