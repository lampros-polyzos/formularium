import React from 'react';
import { Beaker, Users, ShoppingCart, ShieldAlert, ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Define strict types for the feature cards
interface FeatureCardProps {
  title: string;
  description: string;
  Icon: LucideIcon;
  iconBgClass: string;
  iconColorClass: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ title, description, Icon, iconBgClass, iconColorClass }) => (
  <div className="p-8 bg-white border border-gray-100 rounded-xl shadow-sm hover:-translate-y-1 transition-transform duration-200">
    <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-6 ${iconBgClass} ${iconColorClass}`}>
      <Icon size={24} />
    </div>
    <h3 className="text-xl font-semibold mb-3 text-gray-900">{title}</h3>
    <p className="text-gray-500 leading-relaxed text-sm">{description}</p>
  </div>
);

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Navigation */}
      <nav className="flex justify-between items-center px-6 py-4 md:px-12 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2 text-teal-600">
          <Beaker size={28} />
          <span className="text-xl font-bold tracking-tight text-gray-900">Formularium</span>
        </div>
        <div className="flex gap-4">
          <button className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md font-medium transition-colors">
            Log In
          </button>
          <button className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-medium transition-colors">
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="px-6 py-24 text-center max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
          Professional Skincare <span className="text-teal-600">Formulation</span> Studio
        </h1>
        <p className="text-lg md:text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
          Design, validate, and share cosmetic formulas with real-time safety checks. 
          Built for modern formulators and DIY chemists.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <button className="flex items-center justify-center px-8 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium text-lg transition-colors">
            Start Formulating <ArrowRight size={20} className="ml-2" />
          </button>
          <button className="px-8 py-3 bg-transparent border-2 border-gray-200 text-gray-700 hover:bg-gray-100 rounded-lg font-medium text-lg transition-colors">
            Explore Community
          </button>
        </div>
      </header>

      {/* Features Grid */}
      <section className="px-6 py-20 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16 text-gray-900">
            Everything you need to formulate safely
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard 
              title="Smart Formulation Studio" 
              description="Real-time math recalculations and a traffic-light safety validation system to keep your ingredient phases perfectly balanced."
              Icon={Beaker}
              iconBgClass="bg-sky-100"
              iconColorClass="text-sky-600"
            />
            <FeatureCard 
              title="Community Forum" 
              description="Publish your recipes, clone formulations from others, and rate shared creations on texture, efficacy, and stability."
              Icon={Users}
              iconBgClass="bg-green-100"
              iconColorClass="text-green-600"
            />
            <FeatureCard 
              title="Lab-Ready Shopping Lists" 
              description="Flatten multi-phase recipes into a single aggregated checklist. Print a clean, ink-friendly copy straight for your lab."
              Icon={ShoppingCart}
              iconBgClass="bg-purple-100"
              iconColorClass="text-purple-600"
            />
            <FeatureCard 
              title="Global Safety Alerts" 
              description="Get instant platform-wide notifications if ingredient safety limits change, automatically flagging affected recipes in your draft studio."
              Icon={ShieldAlert}
              iconBgClass="bg-red-100"
              iconColorClass="text-red-600"
            />
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;