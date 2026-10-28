import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Beaker, X } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AuthModal = ({ isOpen, onClose }: AuthModalProps) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      if (!captchaToken) throw new Error("Please complete the security check.");

      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { captchaToken }
        });
        if (error) throw error;
        setMessage('Success! Check your email for the confirmation link.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken } // Added captcha token here!
        });
        if (error) throw error;
        onClose();
      }
    } catch (error: any) {
      setMessage(error.message || 'An error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setMessage('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      }
    });
    if (error) setMessage(error.message);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f382a]/40 backdrop-blur-sm">
      <div
        className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden relative border border-[#c1d1b9] transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full p-2 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="px-8 py-10">
          <div className="flex justify-center text-[#1f382a] mb-6">
            <Beaker size={40} />
          </div>
          <h2 className="text-center text-3xl font-bold text-[#1f382a] mb-2">
            {isSignUp ? 'Create account' : 'Welcome back'}
          </h2>
          <p className="text-center text-[#3a5a4a] text-sm mb-8">
            {isSignUp ? 'Join the community of formulators.' : 'Sign in to access your studio.'}
          </p>

          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-xl shadow-sm text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none transition-colors mb-6"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with email</span>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleEmailAuth}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input
                id="email"
                type="email"
                required
                className="w-full px-4 py-3 bg-[#f7f8f6] border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2c4c3b] focus:bg-white transition-colors"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                id="password"
                type="password"
                required
                className="w-full px-4 py-3 bg-[#f7f8f6] border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2c4c3b] focus:bg-white transition-colors"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {/* Turnstile is now always rendered for both Sign In and Sign Up */}
            <div className="flex justify-center py-2">
              <Turnstile
                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
                onSuccess={(token) => setCaptchaToken(token)}
              />
            </div>

            {message && (
              <div className={`text-sm font-medium p-3 rounded-xl ${message.includes('Success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !captchaToken}
              className="w-full py-3.5 px-4 rounded-full shadow-sm text-sm font-bold text-white bg-[#2c4c3b] hover:bg-[#1f382a] focus:outline-none disabled:opacity-50 transition-colors mt-2"
            >
              {isLoading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}
            </button>
          </form>
        </div>

        <div className="px-8 py-5 bg-[#f7f8f6] border-t border-gray-100 text-center">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setMessage('');
              // Do not reset captchaToken here, otherwise switching tabs forces them to solve it again
            }}
            className="text-sm font-medium text-[#3a5a4a] hover:text-[#1f382a] transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;