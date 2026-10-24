import { useState } from 'react';
import { 
  Beaker, 
  Search, 
  ArrowRight, 
  Star, 
  Copy, 
  Check, 
  ChevronDown, 
  BookOpen, 
  Code,
} from 'lucide-react';
import AuthModal from '../components/AuthModal';

const LandingPage = () => {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[#f7f8f6] font-sans text-gray-900 selection:bg-[#d8e2d3]">
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 md:px-12 bg-[#d8e2d3]">
        <div className="flex items-center gap-2 text-[#1f382a]">
          <Beaker size={24} />
          <span className="text-xl font-bold tracking-tight">Formularium</span>
        </div>
        
        {/* Search Bar */}
        <div className="hidden md:flex items-center bg-white/80 rounded-full px-4 py-2 w-1/3 border border-[#c1d1b9]">
          <Search size={16} className="text-gray-500 mr-2" />
          <input 
            type="text" 
            placeholder="Search ingredients, INCI, or functions..." 
            className="bg-transparent border-none outline-none w-full text-sm text-gray-700" 
          />
        </div>

        <div className="flex items-center gap-6 text-[#2c4c3b] font-medium text-sm">
          <a href="#" className="hover:text-black hidden sm:block">Studio</a>
          <a href="#" className="hover:text-black hidden sm:block">Library</a>
          <a href="#" className="hover:text-black hidden sm:block">Community</a>
          <button 
            onClick={() => setIsAuthModalOpen(true)} 
            className="px-5 py-1.5 bg-transparent border border-[#2c4c3b] rounded-full hover:bg-[#2c4c3b] hover:text-white transition-colors"
          >
            Sign in
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-[#d8e2d3] px-6 md:px-12 pt-16 pb-24 relative overflow-hidden rounded-b-[3rem]">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="z-10 max-w-xl">
            <h1 className="text-5xl md:text-6xl font-bold text-[#1f382a] leading-[1.1] mb-6">
              Precision Formulating for the Home Lab
            </h1>
            <p className="text-lg text-[#3a5a4a] mb-8 leading-relaxed">
              Combine ingredients, calculate percentages, and validate your skincare recipes with real-time safety checks.
            </p>
            <div className="flex flex-wrap gap-4">
              <button 
                onClick={() => setIsAuthModalOpen(true)} 
                className="px-6 py-3 bg-[#2c4c3b] text-white rounded-full font-medium hover:bg-[#1f382a] transition-colors shadow-sm"
              >
                Start a New Formula
              </button>
              <button 
                onClick={() => setIsAuthModalOpen(true)} 
                className="px-6 py-3 bg-transparent border border-[#2c4c3b] text-[#2c4c3b] rounded-full font-medium hover:bg-white/20 transition-colors"
              >
                Browse Templates
              </button>
            </div>
          </div>
          
          {/* Hero UI Mockup Illustration */}
          <div className="relative z-10 hidden lg:block">
            <div className="bg-[#eef2eb] rounded-2xl shadow-xl p-6 border border-[#c1d1b9] transform rotate-1 translate-y-4 ml-8">
               <div className="flex gap-2 mb-6 border-b border-[#d8e2d3] pb-3">
                 <div className="w-3 h-3 rounded-full bg-red-400"></div>
                 <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                 <div className="w-3 h-3 rounded-full bg-green-400"></div>
               </div>
               <div className="font-bold text-[#1f382a] mb-4 text-lg">Step 2: Phasing</div>
               
               <div className="space-y-3 relative">
                 <div className="bg-white rounded-lg p-3 text-sm shadow-sm flex justify-between items-center border-l-4 border-green-500">
                    <span className="font-medium text-gray-700">Water</span> 
                    <span className="text-gray-500 bg-gray-100 px-2 py-1 rounded">73%</span>
                 </div>
                 <div className="bg-white rounded-lg p-3 text-sm shadow-sm flex justify-between items-center border-l-4 border-red-500 relative">
                    <span className="font-medium text-gray-700">Salicylic Acid</span> 
                    <span className="text-gray-500 bg-gray-100 px-2 py-1 rounded">15%</span>
                    
                    {/* Traffic Light Tooltip */}
                    <div className="absolute right-[-10px] top-[-45px] bg-white shadow-xl rounded-lg p-3 text-xs border border-red-100 z-20 w-48">
                       <span className="text-red-600 font-bold block mb-1">⚠️ Salicylic Acid 15%</span>
                       <span className="text-gray-500 block">(Recommended: 1-2%)</span>
                    </div>
                 </div>
                 <div className="bg-white rounded-lg p-3 text-sm shadow-sm flex justify-between items-center border-l-4 border-green-500">
                    <span className="font-medium text-gray-700">Niacinamide</span> 
                    <span className="text-gray-500 bg-gray-100 px-2 py-1 rounded">2%</span>
                 </div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bento Grid Features */}
      <section className="px-6 md:px-12 py-20 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 md:row-span-2 bg-[#d8e2d3] rounded-[2rem] p-8 border border-[#c1d1b9] flex flex-col">
            <h3 className="text-2xl font-bold text-[#1f382a] mb-3">The Formulation Studio</h3>
            <p className="text-[#3a5a4a] mb-8 leading-relaxed">Calculate and validate your skincare recipes with real-time feedback and smart phasing.</p>
            <div className="bg-[#eef2eb] flex-grow min-h-[250px] rounded-xl shadow-inner border border-[#c1d1b9] flex items-center justify-center text-[#8ca89b] italic text-sm">
               [Replace with Studio Screenshot]
            </div>
          </div>
          <div className="md:col-span-2 bg-[#d8e2d3] rounded-[2rem] p-8 border border-[#c1d1b9] flex flex-col sm:flex-row gap-8">
             <div className="flex-1">
               <h3 className="text-2xl font-bold text-[#1f382a] mb-3">The Ingredient Library</h3>
               <p className="text-[#3a5a4a] leading-relaxed">Combine ingredients, ensure percentage compatibility, and complete safety checks instantly.</p>
             </div>
             <div className="flex-1 bg-[#eef2eb] min-h-[150px] rounded-xl shadow-inner border border-[#c1d1b9] flex items-center justify-center text-[#8ca89b] italic text-sm">
               [Replace with Library Screenshot]
            </div>
          </div>
          <div className="bg-[#d8e2d3] rounded-[2rem] p-8 border border-[#c1d1b9]">
             <h3 className="text-xl font-bold text-[#1f382a] mb-3">Equipment Guides</h3>
             <p className="text-[#3a5a4a] text-sm mb-6 leading-relaxed">Complete database of equipment guides for your lab.</p>
             <a href="#" className="text-[#1f382a] font-semibold flex items-center text-sm hover:underline group">
               Learn more <ArrowRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform"/>
             </a>
          </div>
          <div className="bg-[#d8e2d3] rounded-[2rem] p-8 border border-[#c1d1b9]">
             <h3 className="text-xl font-bold text-[#1f382a] mb-3">Community Recipes</h3>
             <p className="text-[#3a5a4a] text-sm mb-6 leading-relaxed">Copy and adapt top community recipes for your own use.</p>
             <a href="#" className="text-[#1f382a] font-semibold flex items-center text-sm hover:underline group">
               Learn more <ArrowRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform"/>
             </a>
          </div>
        </div>
      </section>

      {/* How it Works Timeline */}
      <section className="px-6 md:px-12 py-12 max-w-5xl mx-auto text-center">
         <h2 className="text-3xl font-bold text-[#1f382a] mb-16">How It Works</h2>
         <div className="flex flex-col md:flex-row justify-between relative">
            <div className="hidden md:block absolute top-6 left-[10%] right-[10%] h-0.5 bg-[#c1d1b9] z-0"></div>
            {[
              { num: '1', title: 'Research', desc: 'Find ingredients and check safety limits.' },
              { num: '2', title: 'Formulate', desc: 'Calculate exact phase percentages.' },
              { num: '3', title: 'Validate', desc: 'Run traffic-light safety checks.' },
              { num: '4', title: 'Create', desc: 'Print lab sheets and begin mixing.' }
            ].map((step, i) => (
              <div key={i} className="relative z-10 flex flex-col items-center mb-10 md:mb-0 bg-[#f7f8f6] px-4 flex-1">
                 <div className="w-12 h-12 rounded-full bg-[#d8e2d3] border-[6px] border-[#f7f8f6] flex items-center justify-center text-[#1f382a] font-bold text-lg mb-4 shadow-sm">
                   {step.num}
                 </div>
                 <h4 className="font-bold text-[#1f382a] mb-2">{step.title}</h4>
                 <p className="text-sm text-[#3a5a4a]">{step.desc}</p>
              </div>
            ))}
         </div>
      </section>

      {/* Community Spotlights */}
      <section className="px-6 md:px-12 py-20 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-3xl font-bold text-[#1f382a] mb-3">Trending in the Community</h2>
              <p className="text-[#3a5a4a]">Discover top-rated recipes from other formulators.</p>
            </div>
            <a href="#" className="hidden md:flex text-[#2c4c3b] font-semibold items-center hover:underline">
              View all recipes <ArrowRight size={18} className="ml-1" />
            </a>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { title: "Barrier Repair Ceramide Emulsion", author: "Dr. Elena", rating: 4.9, tags: ["Emulsion", "Advanced"] },
              { title: "10% Niacinamide + Zinc Serum", author: "DIYChemist", rating: 4.8, tags: ["Serum", "Beginner"] },
              { title: "Squalane Cleansing Balm", author: "AuraSkincare", rating: 5.0, tags: ["Cleanser", "Waterless"] }
            ].map((recipe, i) => (
              <div key={i} className="border border-gray-200 rounded-[2rem] p-6 hover:shadow-lg transition-shadow bg-[#fcfcfc]">
                <div className="flex justify-between items-start mb-4">
                  <span className="px-3 py-1 bg-[#eef2eb] text-[#2c4c3b] text-xs font-semibold rounded-full">
                    {recipe.tags[0]}
                  </span>
                  <div className="flex items-center text-yellow-500 text-sm font-bold">
                    <Star size={16} className="fill-current mr-1" /> {recipe.rating}
                  </div>
                </div>
                <h4 className="text-xl font-bold text-[#1f382a] mb-2">{recipe.title}</h4>
                <p className="text-sm text-gray-500 mb-6">By {recipe.author}</p>
                <button className="w-full py-2.5 flex items-center justify-center gap-2 border border-[#c1d1b9] text-[#2c4c3b] rounded-xl hover:bg-[#d8e2d3] transition-colors font-medium text-sm">
                  <Copy size={16} /> Clone to Studio
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Tiers */}
      <section className="px-6 md:px-12 py-20 bg-[#f7f8f6]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-[#1f382a] mb-4">Simple, transparent pricing</h2>
            <p className="text-[#3a5a4a]">Start for free, upgrade when you need professional validation tools.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Free Tier */}
            <div className="bg-white border border-gray-200 rounded-[2rem] p-8 shadow-sm">
              <h3 className="text-xl font-bold text-[#1f382a] mb-2">Hobbyist</h3>
              <div className="text-4xl font-extrabold text-[#1f382a] mb-6">Free</div>
              <ul className="space-y-4 mb-8">
                {['Unlimited personal formulations', 'Access to Community Forum', 'Standard ingredient library', 'Basic shopping list exports'].map((feat, i) => (
                  <li key={i} className="flex items-center text-[#3a5a4a] text-sm">
                    <Check size={18} className="text-green-500 mr-3 flex-shrink-0" /> {feat}
                  </li>
                ))}
              </ul>
              <button className="w-full py-3 bg-white border-2 border-[#2c4c3b] text-[#2c4c3b] rounded-full font-medium hover:bg-gray-50 transition-colors">
                Sign Up Free
              </button>
            </div>

            {/* Pro Tier */}
            <div className="bg-[#1f382a] border border-[#2c4c3b] rounded-[2rem] p-8 shadow-xl relative transform md:-translate-y-4">
              <div className="absolute top-0 right-6 transform -translate-y-1/2 bg-[#d8e2d3] text-[#1f382a] px-3 py-1 text-xs font-bold rounded-full">
                MOST POPULAR
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Pro Formulator</h3>
              <div className="text-4xl font-extrabold text-white mb-6">$9<span className="text-lg font-normal text-gray-400">/mo</span></div>
              <ul className="space-y-4 mb-8">
                {['Traffic-light safety alerts', 'Private formulation toggle', 'Custom ingredient imports', 'Ink-friendly lab sheet printing'].map((feat, i) => (
                  <li key={i} className="flex items-center text-gray-300 text-sm">
                    <Check size={18} className="text-[#c1d1b9] mr-3 flex-shrink-0" /> {feat}
                  </li>
                ))}
              </ul>
              <button className="w-full py-3 bg-[#d8e2d3] text-[#1f382a] rounded-full font-bold hover:bg-white transition-colors">
                Start Pro Trial
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Latest From The Blog */}
      <section className="px-6 md:px-12 py-20 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-[#1f382a] mb-12 text-center">Latest from the Lab Notes</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { title: "Understanding INCI Naming Rules", desc: "A beginner's guide to decoding ingredient labels." },
              { title: "Safe Preservative Thresholds", desc: "How to properly calculate broad-spectrum protection." },
              { title: "The Science of Emulsions", desc: "Why HLB values matter in your creams and lotions." }
            ].map((post, i) => (
              <div key={i} className="group cursor-pointer">
                <div className="bg-[#eef2eb] h-48 rounded-2xl mb-4 flex items-center justify-center text-[#8ca89b] border border-[#c1d1b9] group-hover:shadow-md transition-shadow">
                  <BookOpen size={32} />
                </div>
                <h4 className="text-lg font-bold text-[#1f382a] mb-2 group-hover:text-[#2c4c3b] transition-colors">{post.title}</h4>
                <p className="text-sm text-gray-600">{post.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="px-6 md:px-12 py-20 bg-[#f7f8f6]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-[#1f382a] mb-10 text-center">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {[
              { q: "Who owns the rights to my private formulas?", a: "You retain 100% ownership of any formulas kept in your private studio. We never share or analyze your private data." },
              { q: "How often are ingredient safety limits updated?", a: "We sync our database monthly with global cosmetic regulatory boards to ensure your traffic-light alerts are always accurate." },
              { q: "Can I export my shopping lists?", a: "Yes, you can export them as PDFs or generate clean, ink-friendly printouts directly to your local printer." }
            ].map((faq, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-2xl p-6">
                <div className="flex justify-between items-center cursor-pointer">
                  <h4 className="font-bold text-[#1f382a]">{faq.q}</h4>
                  <ChevronDown size={20} className="text-gray-400" />
                </div>
                {/* Note: In a real app, this text would be conditionally hidden behind a state toggle */}
                <p className="mt-4 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-4">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 md:px-12 py-24 bg-[#1f382a] text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-4xl font-bold text-white mb-6">Ready to build your first formulation?</h2>
          <p className="text-[#c1d1b9] text-lg mb-10">Join thousands of formulators building safer, smarter skincare.</p>
          <button className="px-8 py-4 bg-[#d8e2d3] text-[#1f382a] rounded-full font-bold text-lg hover:bg-white transition-colors shadow-lg">
            Create Free Account
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-6 md:px-12 py-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center md:items-start gap-8">
          <div className="flex flex-col items-center md:items-start">
            <div className="flex items-center gap-2 text-[#1f382a] mb-4">
              <Beaker size={24} />
              <span className="text-xl font-bold tracking-tight">Formularium</span>
            </div>
            <p className="text-sm text-gray-500 text-center md:text-left">
              Professional skincare formulation,<br/> built for your home lab.
            </p>
          </div>
          
          <div className="flex gap-12 text-sm text-center md:text-left">
            <div>
              <h4 className="font-bold text-[#1f382a] mb-4">Product</h4>
              <ul className="space-y-2 text-gray-500">
                <li><a href="#" className="hover:text-[#1f382a]">Studio</a></li>
                <li><a href="#" className="hover:text-[#1f382a]">Library</a></li>
                <li><a href="#" className="hover:text-[#1f382a]">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-[#1f382a] mb-4">Legal</h4>
              <ul className="space-y-2 text-gray-500">
                <li><a href="#" className="hover:text-[#1f382a]">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-[#1f382a]">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          
          <div className="flex gap-4">
            <a href="#" className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-[#d8e2d3] hover:text-[#1f382a] transition-colors">
              <Code size={20} />
            </a>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-gray-100 text-center text-sm text-gray-400">
          © {new Date().getFullYear()} Formularium. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;