# Hospital Management System (HMS)

A complete, full-stack Hospital Management System built with React, Vite, Node.js, Express, and MySQL.

## 🚀 Features
- **Role-based Authentication**: Secure portals for Patients, Doctors, and Admins.
- **Patient Dashboard**: Specialization-based appointment booking, medical history tracking, slot availability dynamically fetched from MySQL.
- **Doctor Dashboard**: Manage daily appointments, update statuses, upload clinical prescriptions with PDF/image support.
- **Admin Dashboard**: System-wide statistics, user and doctor management capabilities.

## 🛠️ Tech Stack
- **Frontend**: React, Tailwind CSS v4, Axios, React Router, Vite, Lucide Icons
- **Backend**: Node.js, Express, MySQL (mysql2), JSON Web Tokens (JWT), bcryptjs
- **Database**: MySQL relational architecture (5 integrated tables with strict schema and foreign key constraints)

---

## 🔑 Test Credentials & Logins

The database has been pre-seeded with 1 Admin and 20 Doctors across 5 specializations, each with pre-configured weekly time slots. 

> **Default Password:** `password` (applies to ALL pre-seeded accounts)

### Admin Account
| Role | Email | Password |
|---|---|---|
| Admin | **admin@hms.com** | `password` |

### Doctor Accounts
| Specialization | Name | Email | Password |
|---|---|---|---|
| **Cardiology** | Dr. Emily Davis | `dremilydavis@hms.com` | `password` |
| **Cardiology** | Dr. James Wilson | `drjameswilson@hms.com` | `password` |
| **Cardiology** | Dr. Robert Smith | `drrobertsmith@hms.com` | `password` |
| **Cardiology** | Dr. Sarah Johnson | `sarah@hms.com` | `password` |
| **Dermatology** | Dr. Amanda Garcia | `dramandagarcia@hms.com` | `password` |
| **Dermatology** | Dr. David Chen | `drdavidchen@hms.com` | `password` |
| **Dermatology** | Dr. Emily Davis | `emily@hms.com` | `password` |
| **Dermatology** | Dr. Lisa Wong | `drlisawong@hms.com` | `password` |
| **General Medicine**| Dr. Christopher Lee | `drchristopherlee@hms.com` | `password` |
| **General Medicine**| Dr. Elizabeth Martin | `drelizabethmartin@hms.com` | `password` |
| **General Medicine**| Dr. Joseph Harris | `drjosephharris@hms.com` | `password` |
| **General Medicine**| Dr. Robert Smith | `robert@hms.com` | `password` |
| **Neurology** | Dr. Michael Chen | `michael@hms.com` | `password` |
| **Neurology** | Dr. Michael Miller | `drmichaelmiller@hms.com` | `password` |
| **Neurology** | Dr. Sarah Taylor | `drsarahtaylor@hms.com` | `password` |
| **Neurology** | Dr. Thomas Brown | `drthomasbrown@hms.com` | `password` |
| **Orthopedics** | Dr. Ashley White | `drashleywhite@hms.com` | `password` |
| **Orthopedics** | Dr. James Wilson | `james@hms.com` | `password` |
| **Orthopedics** | Dr. Jessica Anderson | `drjessicaanderson@hms.com`| `password` |
| **Orthopedics** | Dr. William Clark | `drwilliamclark@hms.com` | `password` |

### Patient Accounts (Users)
For the patient side, the best way to interact with the platform is to simply **create a new account**:
1. Go to the Patient Portal.
2. Click **Register** instead of Sign In.
3. Your new patient account will be created safely in the MySQL database, and you can freely explore the patient dashboard, book appointments with the doctors above, and view history.

---

## ⚙️ Running Locally

1. Run the database via XAMPP or MAMP `MySQL` instance.
2. Start the backend Server:
   ```bash
   cd backend
   npm install
   npm run dev
   ```
3. Start the Vite React Frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
