import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Bone, Brain, Pill, PlusSquare, ThumbsUp, MapPin, Phone, Mail, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Home() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const heroSlides = [
    {
      image: 'https://images.unsplash.com/photo-1551076805-e1869033e561?auto=format&fit=crop&q=80&w=2670&ixlib=rb-4.0.3',
      title: 'CARE & CURE',
      subtitle: 'Hospital Management System',
      desc: 'is an advanced software solution designed to streamline and optimize various administrative and clinical processes within healthcare facilities.'
    },
    {
      image: 'https://images.unsplash.com/photo-1538108149393-cebb47cbdc96?auto=format&fit=crop&q=80&w=2670&ixlib=rb-4.0.3',
      title: 'DEDICATED STAFF',
      subtitle: 'Professional Healthcare',
      desc: 'Providing world-class medical services with a team of experienced doctors, nurses, and specialists dedicated to your well-being.'
    }
  ];

  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
  const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + heroSlides.length) % heroSlides.length);

  const features = [
    { title: 'Cardiology', icon: Heart },
    { title: 'Orthopaedic', icon: Bone },
    { title: 'Neurologist', icon: Brain },
    { title: 'Pharma Pipeline', icon: Pill },
    { title: 'Pharma Team', icon: PlusSquare },
    { title: 'High Quality treatments', icon: ThumbsUp },
  ];

  const logins = [
    { title: 'Patient Login', image: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&q=80&w=800', role: 'patient' },
    { title: 'Doctors login', image: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=800', role: 'doctor' },
    { title: 'Admin Login', image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=800', role: 'admin' },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans overflow-x-hidden">
      {/* Navigation */}
      <header className="bg-white shadow-sm z-50 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex-shrink-0 flex items-center">
              <span className="text-4xl font-extrabold text-gray-900 tracking-tight">HMS</span>
            </div>
            <nav className="hidden md:flex space-x-8 items-center font-medium">
              <a href="#home" className="text-gray-900 hover:text-teal-600 transition">Home</a>
              <a href="#services" className="text-gray-600 hover:text-teal-600 transition">Services</a>
              <a href="#about" className="text-gray-600 hover:text-teal-600 transition">About Us</a>
              <a href="#gallery" className="text-gray-600 hover:text-teal-600 transition">Gallery</a>
              <a href="#contact" className="text-gray-600 hover:text-teal-600 transition">Contact Us</a>
              <a href="#logins" className="text-gray-600 hover:text-teal-600 transition">Logins</a>
              <Link to="/login" state={{ role: 'patient', redirectTo: '/patient/book' }} className="bg-teal-500 hover:bg-teal-600 text-white px-5 py-2.5 shadow-sm transition">
                Book an Appointment
              </Link>
            </nav>
            <div className="md:hidden flex items-center">
              <button className="text-gray-600 hover:text-gray-900 focus:outline-none">
                 <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                 </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="home" className="relative h-[85vh] flex items-center w-full overflow-hidden group">
         <div 
           className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-1000 transform scale-105" 
           style={{ backgroundImage: `url("${heroSlides[currentSlide].image}")` }}
         ></div>
         {/* Diagonal Teal Overlay */}
         <div className="absolute inset-0 z-0 bg-teal-500/85 clip-diagonal sm:w-2/3 lg:w-3/5 h-full opacity-90 transition-all hidden md:block"
              style={{ clipPath: 'polygon(0 0, 100% 0, 75% 100%, 0 100%)' }}
         ></div>
         <div className="absolute inset-0 z-0 bg-teal-500/85 md:hidden opacity-90"></div>
         
         <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
           <div className="md:w-3/5 lg:w-1/2 transition-opacity duration-500">
             <h2 className="text-white text-3xl font-bold tracking-wider mb-2 drop-shadow-md">{heroSlides[currentSlide].title}</h2>
             <h1 className="text-white text-5xl lg:text-5xl font-extrabold tracking-tight mb-6 drop-shadow-md leading-tight">
               {heroSlides[currentSlide].subtitle}
             </h1>
             <p className="text-teal-50 text-lg font-medium mb-10 max-w-lg leading-relaxed drop-shadow">
               {heroSlides[currentSlide].desc}
             </p>
           </div>
         </div>

         {/* Carousel Controls */}
         <button onClick={prevSlide} className="absolute left-4 top-1/2 transform -translate-y-1/2 z-20 text-white/50 hover:text-white transition opacity-0 group-hover:opacity-100">
            <ChevronLeft className="w-12 h-12" />
         </button>
         <button onClick={nextSlide} className="absolute right-4 top-1/2 transform -translate-y-1/2 z-20 text-white/50 hover:text-white transition opacity-0 group-hover:opacity-100">
            <ChevronRight className="w-12 h-12" />
         </button>
      </section>

      {/* Features Section */}
      <section id="services" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-500 text-lg mb-16">Take a look at some of our key features</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-y-16 gap-x-8">
            {features.map((feature, idx) => (
              <div key={idx} className="flex flex-col items-center group">
                <div className="w-16 h-16 mb-4 text-teal-500 transform transition-transform group-hover:scale-110">
                  <feature.icon className="w-full h-full" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-bold text-gray-700">{feature.title}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Logins Section */}
      <section id="logins" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-700 mb-16">Logins</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {logins.map((login, idx) => (
              <div key={idx} className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-gray-100 flex flex-col">
                <div className="h-64 overflow-hidden">
                   <img src={login.image} alt={login.title} className="w-full h-full object-cover object-center transform hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-6 text-center flex-grow flex flex-col justify-between items-center bg-white border-t border-gray-50">
                  <h3 className="text-xl font-bold text-gray-700 mb-4">{login.title}</h3>
                  <Link to={`/login`} state={{ role: login.role }} className="inline-block bg-teal-500 hover:bg-teal-600 text-white px-6 py-2 rounded shadow-sm transition">
                    Click Here
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Us Section */}
      <section id="contact" className="relative py-24 bg-cover bg-center" style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&q=80&w=2653&ixlib=rb-4.0.3")' }}>
        <div className="absolute inset-0 bg-blue-900/40"></div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="text-center mb-16 max-w-4xl mx-auto">
             <h2 className="text-5xl font-bold text-teal-300 mb-6 drop-shadow-md">Contact Us</h2>
             <p className="text-white text-lg drop-shadow font-medium leading-relaxed">
               Care and Cure cares takes pride in its world class user experience and customer satisfaction, we are very eager to here from you about your experience with out services. Please feel free to reach out to us with any questions, inquiries, or feedback you may have. We are committed to providing exceptional service and support to all our clients.
             </p>
           </div>

           <div className="flex flex-col md:flex-row justify-between items-start gap-12">
              {/* Contact Info (Left) */}
              <div className="md:w-1/2 space-y-8 mt-4">
                 <div className="flex items-start">
                   <div className="bg-white p-4 rounded-full text-pink-500 mr-6 shadow-lg flex-shrink-0">
                     <MapPin className="w-6 h-6" />
                   </div>
                   <div className="text-white">
                     <h4 className="text-xl font-bold mb-1 drop-shadow-sm">Address</h4>
                     <p className="drop-shadow-sm">Street Number 299, DJ Block (Newtown), Action Area I<br />Newtown, New Town, West Bengal 700156</p>
                   </div>
                 </div>
                 
                 <div className="flex items-start">
                   <div className="bg-white p-4 rounded-full text-purple-600 mr-6 shadow-lg flex-shrink-0">
                     <Phone className="w-6 h-6" />
                   </div>
                   <div className="text-white">
                     <h4 className="text-xl font-bold mb-1 drop-shadow-sm">Phone</h4>
                     <p className="drop-shadow-sm">+91 33 2476 5102</p>
                   </div>
                 </div>

                 <div className="flex items-start">
                   <div className="bg-white p-4 rounded-full text-pink-500 mr-6 shadow-lg flex-shrink-0">
                     <Mail className="w-6 h-6" />
                   </div>
                   <div className="text-white break-all">
                     <h4 className="text-xl font-bold mb-1 drop-shadow-sm">Email</h4>
                     <p className="drop-shadow-sm">ApolloHospitalshospitalmanagementsystem@gmail.com</p>
                   </div>
                 </div>
              </div>

              {/* Contact Form (Right) */}
              <div className="md:w-1/2 w-full">
                 <div className="bg-white/80 backdrop-blur-md p-8 shadow-xl">
                   <h3 className="text-2xl font-bold text-gray-700 mb-6">Send Messages</h3>
                   <form className="space-y-6">
                     <div>
                       <input type="text" placeholder="Full Name" className="w-full bg-transparent border-b border-gray-400 py-3 text-gray-800 placeholder-gray-500 focus:outline-none focus:border-teal-500 transition-colors" />
                     </div>
                     <div>
                       <input type="email" placeholder="Email" className="w-full bg-transparent border-b border-gray-400 py-3 text-gray-800 placeholder-gray-500 focus:outline-none focus:border-teal-500 transition-colors" />
                     </div>
                     <div>
                       <input type="text" placeholder="Type your Message" className="w-full bg-transparent border-b border-gray-400 py-3 text-gray-800 placeholder-gray-500 focus:outline-none focus:border-teal-500 transition-colors" />
                     </div>
                     <button type="button" className="w-full bg-teal-500/90 hover:bg-teal-600 text-white font-medium py-3 text-lg transition-colors mt-4">
                       Submit
                     </button>
                   </form>
                 </div>
              </div>
           </div>
        </div>
      </section>
      
      {/* Scroll to Top / Floating Action Button */}
      <div className="fixed bottom-6 right-6 z-50">
         <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-xl hover:bg-blue-700 hover:scale-105 transition-transform cursor-pointer">
           <span className="text-xl font-bold">M</span>
         </div>
      </div>
    </div>
  );
}
