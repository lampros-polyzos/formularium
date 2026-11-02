import { useEffect, useState, type SyntheticEvent } from 'react';
import {
  Beaker,
  Search,
  ArrowRight,
  Copy,
  Check,
  ChevronDown,
  Code,
  Plus,
} from 'lucide-react';
import AuthModal from '../components/AuthModal';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ARTICLES } from '../content/articles';
import ArticleCard from '../components/content/ArticleCard';
import CommunityCard from '../components/content/CommunityCard';
import HeroIllustration from '../components/HeroIllustration';
import { toCommunityArticle } from '../content/community';

interface PreviewPost {
  id: string;
  title: string;
  write_up: string | null;
  tags: string[] | string | null;
  development_status?: string | null;
  created_at: string;
}

// Where to send the user once they finish signing in (survives the OAuth redirect)
const REDIRECT_KEY = 'formularium:postAuthRedirect';

const STATUS_LABELS: Record<string, string> = {
  concept: 'Concept',
  'in-testing': 'In Testing',
  stable: 'Stable',
};

const FAQS = [
  { q: "Who owns the rights to my private formulas?", a: "You retain 100% ownership of any formulas kept in your private studio. We never share or analyze your private data." },
  { q: "How often are ingredient safety limits updated?", a: "We sync our database monthly with global cosmetic regulatory boards to ensure your traffic-light alerts are always accurate." },
  { q: "Can I export my shopping lists?", a: "Yes, you can export them as PDFs or generate clean, ink-friendly printouts directly to your local printer." }
];

const normalizeTags = (tags: PreviewPost['tags']) =>
  Array.isArray(tags) ? tags : (tags ? [tags] : []);

const LandingPage = () => {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [searchQuery, setSearchQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [recipes, setRecipes] = useState<PreviewPost[]>([]);
  const [labNotes, setLabNotes] = useState<PreviewPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  // Resume the navigation the visitor asked for before they were prompted to sign in
  useEffect(() => {
    if (!user) return;
    try {
      const pending = sessionStorage.getItem(REDIRECT_KEY);
      if (pending) {
        sessionStorage.removeItem(REDIRECT_KEY);
        navigate(pending);
      }
    } catch {
      // sessionStorage unavailable; nothing to resume
    }
  }, [user, navigate]);

  useEffect(() => {
    const fetchPreviews = async () => {
      setIsLoadingPosts(true);
      try {
        const [recipeRes, notesRes] = await Promise.all([
          supabase
            .from('community_posts')
            .select('id, title, write_up, tags, development_status, created_at')
            .eq('post_type', 'formulation')
            .order('created_at', { ascending: false })
            .limit(3),
          supabase
            .from('community_posts')
            .select('id, title, write_up, tags, created_at')
            .eq('post_type', 'education')
            .order('created_at', { ascending: false })
            .limit(3),
        ]);
        if (recipeRes.error) throw recipeRes.error;
        if (notesRes.error) throw notesRes.error;
        setRecipes(recipeRes.data || []);
        setLabNotes(notesRes.data || []);
      } catch (error) {
        console.error("Error fetching landing page previews:", error);
      } finally {
        setIsLoadingPosts(false);
      }
    };

    fetchPreviews();
  }, [user]);

  const openAuth = (mode: 'signin' | 'signup' = 'signin', redirectTo?: string) => {
    try {
      if (redirectTo) sessionStorage.setItem(REDIRECT_KEY, redirectTo);
      else sessionStorage.removeItem(REDIRECT_KEY);
    } catch {
      // ignore storage errors; the user just lands back here after sign-in
    }
    setAuthMode(mode);
    setIsAuthModalOpen(true);
  };

  // Navigate to an app page, prompting for sign-in first if needed
  const goTo = (path: string, mode: 'signin' | 'signup' = 'signin') => {
    if (user) navigate(path);
    else openAuth(mode, path);
  };

  // Two newest guides plus the newest community article, falling back to a third guide
  const communityLatest = labNotes[0] ? toCommunityArticle({ ...labNotes[0], tags: labNotes[0].tags ?? null, write_up: labNotes[0].write_up ?? null }) : null;
  const blogPreview = [
    ...ARTICLES.slice(0, communityLatest ? 2 : 3).map((article) => ({ kind: 'guide' as const, article })),
    ...(communityLatest ? [{ kind: 'community' as const, post: communityLatest }] : []),
  ];

  const handleSearch = (e: SyntheticEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    goTo(q ? `/library?q=${encodeURIComponent(q)}` : '/library');
  };

  const handleGetStarted = () => {
    if (user) navigate('/studio');
    else openAuth('signup', '/studio');
  };

  return (
    <div className="min-h-screen bg-[#f7f8f6] font-sans text-gray-900 selection:bg-[#d8e2d3]">
      {/* Mounted only while open so each open starts in the requested mode */}
      {isAuthModalOpen && (
        <AuthModal isOpen onClose={() => setIsAuthModalOpen(false)} initialMode={authMode} />
      )}
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 md:px-12 bg-[#d8e2d3]">
        <div className="flex items-center gap-2 text-[#1f382a]">
          <Beaker size={24} />
          <span className="text-xl font-bold tracking-tight">Formularium</span>
        </div>

        {/* Search Bar */}
        <form
          onSubmit={handleSearch}
          className="hidden md:flex items-center bg-white/80 rounded-full px-4 py-2 w-1/3 border border-[#c1d1b9] focus-within:ring-2 focus-within:ring-[#2c4c3b]"
        >
          <button type="submit" aria-label="Search the ingredient library" className="text-gray-500 hover:text-[#1f382a] mr-2">
            <Search size={16} />
          </button>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ingredients, INCI, or functions..."
            className="bg-transparent border-none outline-none w-full text-sm text-gray-700"
          />
        </form>

        <div className="flex items-center gap-6 text-[#2c4c3b] font-medium text-sm">
          <button onClick={() => goTo('/library')} className="hover:text-black hidden sm:block">Library</button>
          <button onClick={() => goTo('/community')} className="hover:text-black hidden sm:block">Community</button>
          <button onClick={() => navigate('/learn')} className="hover:text-black hidden sm:block">Learn</button>
          <button onClick={() => navigate('/blog')} className="hover:text-black hidden sm:block">Blog</button>
          <div>
            {user ? (
              <button
                onClick={() => navigate('/studio')}
                className="py-2.5 px-6 rounded-full shadow-sm text-sm font-bold text-white bg-[#2c4c3b] hover:bg-[#1f382a] transition-colors"
              >
                Go to Studio
              </button>
            ) : (
              <button
                onClick={() => openAuth('signin')}
                className="py-2.5 px-6 rounded-full shadow-sm text-sm font-bold text-white bg-[#2c4c3b] hover:bg-[#1f382a] transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
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
                onClick={() => goTo('/studio/new', 'signup')}
                className="px-6 py-3 bg-[#2c4c3b] text-white rounded-full font-medium hover:bg-[#1f382a] transition-colors shadow-sm"
              >
                Start a New Formula
              </button>
              <button
                onClick={() => goTo('/community')}
                className="px-6 py-3 bg-transparent border border-[#2c4c3b] text-[#2c4c3b] rounded-full font-medium hover:bg-white/20 transition-colors"
              >
                Browse Community Recipes
              </button>
            </div>
          </div>

          {/* Hero artwork */}
          <HeroIllustration className="relative z-10 hidden lg:block w-full max-w-[560px] ml-auto drop-shadow-sm" />
        </div>
      </section>

      {/* Bento Grid Features */}
      <section className="px-6 md:px-12 py-20 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 md:row-span-2 bg-[#d8e2d3] rounded-[2rem] p-8 border border-[#c1d1b9] flex flex-col">
            <h3 className="text-2xl font-bold text-[#1f382a] mb-3">The Formulation Studio</h3>
            <p className="text-[#3a5a4a] mb-6 leading-relaxed">Calculate and validate your skincare recipes with real-time feedback and smart phasing.</p>
            <div className="bg-[#eef2eb] flex-grow min-h-[250px] rounded-xl shadow-inner border border-[#c1d1b9] p-4 space-y-3 mb-6" aria-hidden="true">
              <div className="flex items-center justify-between text-xs font-bold text-[#1f382a] uppercase tracking-wide">
                <span>My Formulas</span>
                <span className="flex items-center gap-1 bg-[#2c4c3b] text-white px-2 py-1 rounded-full normal-case tracking-normal">
                  <Plus size={12} /> New
                </span>
              </div>
              {[
                { name: 'Gentle Gel Cleanser', meta: '3 phases · 100 g', dot: 'bg-green-500' },
                { name: 'Ceramide Night Cream', meta: '4 phases · 50 g', dot: 'bg-yellow-400' },
                { name: 'Vitamin C Serum', meta: '2 phases · 30 ml', dot: 'bg-green-500' },
              ].map((f) => (
                <div key={f.name} className="bg-white rounded-lg p-3 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-700">{f.name}</div>
                    <div className="text-xs text-gray-400">{f.meta}</div>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full ${f.dot}`}></span>
                </div>
              ))}
            </div>
            <button onClick={() => goTo('/studio')} className="text-[#1f382a] font-semibold flex items-center text-sm hover:underline group self-start">
              Open the Studio <ArrowRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
          <div className="md:col-span-2 bg-[#d8e2d3] rounded-[2rem] p-8 border border-[#c1d1b9] flex flex-col sm:flex-row gap-8">
            <div className="flex-1 flex flex-col">
              <h3 className="text-2xl font-bold text-[#1f382a] mb-3">The Ingredient Library</h3>
              <p className="text-[#3a5a4a] leading-relaxed mb-6">Combine ingredients, ensure percentage compatibility, and complete safety checks instantly.</p>
              <button onClick={() => goTo('/library')} className="mt-auto text-[#1f382a] font-semibold flex items-center text-sm hover:underline group self-start">
                Explore the Library <ArrowRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
            <div className="flex-1 bg-[#eef2eb] min-h-[150px] rounded-xl shadow-inner border border-[#c1d1b9] p-4 space-y-2" aria-hidden="true">
              {[
                { name: 'Niacinamide', inci: 'Niacinamide', fn: 'Active' },
                { name: 'Squalane', inci: 'Squalane', fn: 'Emollient' },
                { name: 'Olivem 1000', inci: 'Cetearyl Olivate, Sorbitan Olivate', fn: 'Emulsifier' },
              ].map((ing) => (
                <div key={ing.name} className="bg-white rounded-lg px-3 py-2 shadow-sm flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-700">{ing.name}</div>
                    <div className="text-xs text-gray-400 truncate">{ing.inci}</div>
                  </div>
                  <span className="text-xs font-semibold text-[#2c4c3b] bg-[#eef2eb] px-2 py-1 rounded-full flex-shrink-0">{ing.fn}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[#d8e2d3] rounded-[2rem] p-8 border border-[#c1d1b9]">
            <h3 className="text-xl font-bold text-[#1f382a] mb-3">Stash &amp; Packaging</h3>
            <p className="text-[#3a5a4a] text-sm mb-6 leading-relaxed">Track the ingredients and containers you own, so you always know what you can make.</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <button onClick={() => goTo('/stash')} className="text-[#1f382a] font-semibold flex items-center text-sm hover:underline group">
                My Stash <ArrowRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform" />
              </button>
              <button onClick={() => goTo('/containers')} className="text-[#1f382a] font-semibold flex items-center text-sm hover:underline group">
                Packaging <ArrowRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
          <div className="bg-[#d8e2d3] rounded-[2rem] p-8 border border-[#c1d1b9]">
            <h3 className="text-xl font-bold text-[#1f382a] mb-3">Community Recipes</h3>
            <p className="text-[#3a5a4a] text-sm mb-6 leading-relaxed">Copy and adapt top community recipes for your own use.</p>
            <button onClick={() => goTo('/community')} className="text-[#1f382a] font-semibold flex items-center text-sm hover:underline group">
              Browse recipes <ArrowRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform" />
            </button>
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
              <h2 className="text-3xl font-bold text-[#1f382a] mb-3">Fresh from the Community</h2>
              <p className="text-[#3a5a4a]">Discover the latest recipes shared by other formulators.</p>
            </div>
            <button onClick={() => goTo('/community')} className="hidden md:flex text-[#2c4c3b] font-semibold items-center hover:underline">
              View all recipes <ArrowRight size={18} className="ml-1" />
            </button>
          </div>

          {isLoadingPosts ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="border border-gray-200 rounded-[2rem] p-6 bg-[#fcfcfc] animate-pulse h-56"></div>
              ))}
            </div>
          ) : recipes.length === 0 ? (
            <div className="border border-dashed border-[#c1d1b9] rounded-[2rem] p-10 text-center bg-[#fcfcfc]">
              <p className="text-[#3a5a4a] mb-4">No recipes have been shared yet. Be the first to publish one!</p>
              <button
                onClick={() => goTo('/community')}
                className="px-6 py-2.5 bg-[#2c4c3b] text-white rounded-full font-medium hover:bg-[#1f382a] transition-colors text-sm"
              >
                Visit the Community
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {recipes.map((recipe) => {
                const tags = normalizeTags(recipe.tags);
                const status = recipe.development_status ? STATUS_LABELS[recipe.development_status] : null;
                return (
                  <div key={recipe.id} className="border border-gray-200 rounded-[2rem] p-6 hover:shadow-lg transition-shadow bg-[#fcfcfc] flex flex-col">
                    <div className="flex justify-between items-start mb-4 gap-2">
                      <span className="px-3 py-1 bg-[#eef2eb] text-[#2c4c3b] text-xs font-semibold rounded-full truncate">
                        {tags[0] ?? 'Formulation'}
                      </span>
                      {status && (
                        <span className="text-xs font-semibold text-gray-500 flex-shrink-0">{status}</span>
                      )}
                    </div>
                    <h4 className="text-xl font-bold text-[#1f382a] mb-2 line-clamp-2">{recipe.title}</h4>
                    <p className="text-sm text-gray-500 mb-6 line-clamp-2 flex-grow">
                      {recipe.write_up || `Shared ${new Date(recipe.created_at).toLocaleDateString()}`}
                    </p>
                    <button
                      onClick={() => goTo(`/community/${recipe.id}`)}
                      className="w-full py-2.5 flex items-center justify-center gap-2 border border-[#c1d1b9] text-[#2c4c3b] rounded-xl hover:bg-[#d8e2d3] transition-colors font-medium text-sm"
                    >
                      <Copy size={16} /> View &amp; Clone
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <button onClick={() => goTo('/community')} className="md:hidden mt-8 mx-auto flex text-[#2c4c3b] font-semibold items-center hover:underline">
            View all recipes <ArrowRight size={18} className="ml-1" />
          </button>
        </div>
      </section>

      {/* Pricing Tiers */}
      <section id="pricing" className="px-6 md:px-12 py-20 bg-[#f7f8f6] scroll-mt-4">
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
              <button
                onClick={handleGetStarted}
                className="w-full py-3 bg-white border-2 border-[#2c4c3b] text-[#2c4c3b] rounded-full font-medium hover:bg-gray-50 transition-colors"
              >
                {user ? 'Go to Studio' : 'Sign Up Free'}
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
              <button
                disabled
                className="w-full py-3 bg-[#d8e2d3] text-[#1f382a] rounded-full font-bold opacity-70 cursor-not-allowed"
              >
                Coming Soon
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* From the blog: beginner guides plus the newest community article */}
      <section className="px-6 md:px-12 py-20 bg-[#f7f8f6]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#1f382a] mb-3">New to formulating? Start here</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">Plain-language guides and articles from the community, free for everyone.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {blogPreview.map((item) => item.kind === 'guide'
              ? <ArticleCard key={item.article.slug} article={item.article} />
              : (
                <CommunityCard
                  key={item.post.id}
                  post={item.post}
                  onOpen={() => goTo(`/community/${item.post.id}`)}
                  membersOnly={!user}
                />
              ))}
          </div>
          <div className="flex flex-wrap justify-center gap-4 mt-10">
            <button onClick={() => navigate('/blog')} className="px-6 py-3 bg-[#2c4c3b] text-white rounded-full font-medium hover:bg-[#1f382a] transition-colors shadow-sm">
              Read the blog
            </button>
            <button onClick={() => navigate('/learn')} className="px-6 py-3 border border-[#2c4c3b] text-[#2c4c3b] rounded-full font-medium hover:bg-white transition-colors">
              Open the Learn hub
            </button>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="px-6 md:px-12 py-20 bg-[#f7f8f6]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-[#1f382a] mb-10 text-center">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {FAQS.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={i} className="bg-white border border-gray-200 rounded-2xl p-6">
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-answer-${i}`}
                    className="w-full flex justify-between items-center text-left gap-4"
                  >
                    <h4 className="font-bold text-[#1f382a]">{faq.q}</h4>
                    <ChevronDown size={20} className={`text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <p id={`faq-answer-${i}`} className="mt-4 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-4">
                      {faq.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 md:px-12 py-24 bg-[#1f382a] text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-4xl font-bold text-white mb-6">Ready to build your first formulation?</h2>
          <p className="text-[#c1d1b9] text-lg mb-10">Join thousands of formulators building safer, smarter skincare.</p>
          <button
            onClick={handleGetStarted}
            className="px-8 py-4 bg-[#d8e2d3] text-[#1f382a] rounded-full font-bold text-lg hover:bg-white transition-colors shadow-lg"
          >
            {user ? 'Go to Studio' : 'Create Free Account'}
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
              Professional skincare formulation,<br /> built for your home lab.
            </p>
          </div>

          <div className="flex gap-12 text-sm text-center md:text-left">
            <div>
              <h4 className="font-bold text-[#1f382a] mb-4">Product</h4>
              <ul className="space-y-2 text-gray-500">
                <li><button onClick={() => goTo('/studio')} className="hover:text-[#1f382a]">Studio</button></li>
                <li><button onClick={() => goTo('/library')} className="hover:text-[#1f382a]">Library</button></li>
                <li><button onClick={() => navigate('/learn')} className="hover:text-[#1f382a]">Learn</button></li>
                <li><button onClick={() => navigate('/blog')} className="hover:text-[#1f382a]">Blog</button></li>
                <li><a href="#pricing" className="hover:text-[#1f382a]">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-[#1f382a] mb-4">Your Lab</h4>
              <ul className="space-y-2 text-gray-500">
                <li><button onClick={() => goTo('/stash')} className="hover:text-[#1f382a]">Stash</button></li>
                <li><button onClick={() => goTo('/containers')} className="hover:text-[#1f382a]">Packaging</button></li>
                <li><button onClick={() => goTo('/community')} className="hover:text-[#1f382a]">Community</button></li>
              </ul>
            </div>
          </div>

          <div className="flex gap-4">
            <a
              href="https://github.com/lampros-polyzos/formularium"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Source code on GitHub"
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-[#d8e2d3] hover:text-[#1f382a] transition-colors"
            >
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
