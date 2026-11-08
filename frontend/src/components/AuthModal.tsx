import React, { useState, useEffect } from 'react';
import { AuthError, completeMfaLogin, forgotPassword, isMfaChallenge, login, loginWithGoogle, register, resendVerification } from '../lib/authClient';
import GoogleSignInButton from './GoogleSignInButton';
import { Beaker, X } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
}

const AuthModal = ({ isOpen, onClose, initialMode = 'signin' }: AuthModalProps) => {
  const [isSignUp, setIsSignUp] = useState(initialMode === 'signup');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // 'form' is sign in / sign up. 'confirm' asks you to click the link we emailed. 'forgot' asks for the email to send a reset link to.
  // 'mfa' is the second step for an account with two-step verification: a code from the authenticator app.
  const [view, setView] = useState<'form' | 'confirm' | 'forgot' | 'mfa'>('form');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [notice, setNotice] = useState('');
  // Each bot check can be used once, so a screen that needs another one starts with a fresh widget
  const [widgetKey, setWidgetKey] = useState(0);

  const goTo = (next: 'form' | 'confirm' | 'forgot' | 'mfa', note = '') => {
    setView(next);
    setNotice(note);
    setMessage('');
    setCaptchaToken(null);
    setWidgetKey(k => k + 1);
  };

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  // The password was right, but the account wants a code before it signs anyone in
  const startMfa = (token: string) => {
    setMfaToken(token);
    setMfaCode('');
    goTo('mfa');
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    try {
      await completeMfaLogin(mfaToken, mfaCode.trim());
      onClose();
    } catch (error) {
      const message = error instanceof AuthError || error instanceof Error ? error.message : 'An error occurred.';
      if (error instanceof AuthError && error.code === 'mfa_expired') { goTo('form'); setMessage(message); return; }   // too slow, or too many wrong codes: start again
      setMessage(message);
      setMfaCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      if (!captchaToken) throw new Error("Please complete the security check.");

      if (isSignUp) {
        const user = await register({ email, password, username: username.trim(), captchaToken });
        if (!user) { goTo('confirm', `We sent a confirmation link to ${email.trim()}.`); return; }   // not signed in until the link is clicked
      } else {
        const result = await login({ email, password, captchaToken });
        if (isMfaChallenge(result)) { startMfa(result.mfaToken); return; }
      }
      onClose();   // signed in: the page behind the form notices and moves on
    } catch (error) {
      if (error instanceof AuthError && error.code === 'email_not_verified') { goTo('confirm', 'Your email address is not confirmed yet. Open the link we sent you, or ask for a new one.'); return; }
      setMessage(error instanceof AuthError || error instanceof Error ? error.message : 'An error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  // Asks for a new confirmation link, or a reset link. The answer is the same whether or not the address has an account.
  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    try {
      if (!captchaToken) throw new Error("Please complete the security check.");
      if (view === 'forgot') await forgotPassword({ email, captchaToken });
      else await resendVerification({ email, captchaToken });
      setCaptchaToken(null);
      setWidgetKey(k => k + 1);
      setNotice(view === 'forgot'
        ? 'If that address has an account, we sent a link to choose a new password. It works for one hour.'
        : 'If that address needs confirming, we sent a new link. The old one no longer works.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'An error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleCredential = async (idToken: string) => {
    setMessage('');
    try {
      const result = await loginWithGoogle(idToken);
      if (isMfaChallenge(result)) { startMfa(result.mfaToken); return; }
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Google sign-in failed.');
    }
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

          {view === 'mfa' && (
            <form className="space-y-5" onSubmit={handleMfa}>
              <h3 className="text-center text-lg font-bold text-[#1f382a]">Two-step verification</h3>
              <p className="text-center text-sm text-[#3a5a4a]">Enter the 6-digit code from your authenticator app. If you lost your phone, enter one of your recovery codes instead.</p>
              <div>
                <label htmlFor="mfa-code" className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                <input
                  id="mfa-code"
                  type="text"
                  inputMode="text"
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  maxLength={32}
                  className="w-full px-4 py-3 bg-[#f7f8f6] border border-transparent rounded-xl tracking-widest text-center text-lg focus:outline-none focus:ring-2 focus:ring-[#2c4c3b] focus:bg-white transition-colors"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                />
              </div>
              {message && <div role="alert" className="text-sm font-medium p-3 rounded-xl bg-red-50 text-red-700">{message}</div>}
              <button
                type="submit"
                disabled={isLoading || mfaCode.trim().length < 6}
                className="w-full py-3.5 px-4 rounded-full shadow-sm text-sm font-bold text-white bg-[#2c4c3b] hover:bg-[#1f382a] focus:outline-none disabled:opacity-50 transition-colors"
              >
                {isLoading ? 'Checking...' : 'Verify'}
              </button>
              <button type="button" onClick={() => goTo('form')} className="block w-full text-center text-sm font-medium text-[#3a5a4a] hover:text-[#1f382a]">
                Back to sign in
              </button>
            </form>
          )}

          {(view === 'confirm' || view === 'forgot') && (
            <form className="space-y-5" onSubmit={handleSendLink}>
              <h3 className="text-center text-lg font-bold text-[#1f382a]">{view === 'forgot' ? 'Reset your password' : 'Check your email'}</h3>
              <p role="status" className="text-center text-sm text-[#3a5a4a]">
                {notice || (view === 'forgot' ? 'Enter your email and we will send you a link to choose a new password.' : 'Open the link in your email to finish creating your account.')}
              </p>
              <div>
                <label htmlFor="link-email" className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                <input
                  id="link-email"
                  type="email"
                  required
                  className="w-full px-4 py-3 bg-[#f7f8f6] border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2c4c3b] focus:bg-white transition-colors"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex justify-center py-2">
                <Turnstile key={widgetKey} siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY} onSuccess={(token) => setCaptchaToken(token)} />
              </div>
              {message && <div role="alert" className="text-sm font-medium p-3 rounded-xl bg-red-50 text-red-700">{message}</div>}
              <button
                type="submit"
                disabled={isLoading || !captchaToken}
                className="w-full py-3.5 px-4 rounded-full shadow-sm text-sm font-bold text-white bg-[#2c4c3b] hover:bg-[#1f382a] focus:outline-none disabled:opacity-50 transition-colors"
              >
                {isLoading ? 'Sending...' : (view === 'forgot' ? 'Send reset link' : 'Send a new link')}
              </button>
              <button type="button" onClick={() => goTo('form')} className="block w-full text-center text-sm font-medium text-[#3a5a4a] hover:text-[#1f382a]">
                Back to sign in
              </button>
            </form>
          )}

          {view === 'form' && (<>
          <GoogleSignInButton onCredential={handleGoogleCredential} onError={setMessage} />

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with email</span>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleEmailAuth}>
            {isSignUp && (
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  id="username"
                  type="text"
                  required
                  minLength={3}
                  maxLength={30}
                  pattern="[A-Za-z0-9_.\-]+"
                  title="Letters, digits, dot, dash and underscore"
                  autoComplete="username"
                  className="w-full px-4 py-3 bg-[#f7f8f6] border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2c4c3b] focus:bg-white transition-colors"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ''))}   // usernames never contain spaces
                />
              </div>
            )}
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
                minLength={isSignUp ? 10 : undefined}
                maxLength={72}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                className="w-full px-4 py-3 bg-[#f7f8f6] border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2c4c3b] focus:bg-white transition-colors"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {/* Turnstile is now always rendered for both Sign In and Sign Up */}
            <div className="flex justify-center py-2">
              <Turnstile
                key={widgetKey}
                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
                onSuccess={(token) => setCaptchaToken(token)}
              />
            </div>

            {message && (
              <div className={`text-sm font-medium p-3 rounded-xl ${'bg-red-50 text-red-700'}`}>
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

          {!isSignUp && (
            <button type="button" onClick={() => goTo('forgot')} className="mt-4 block w-full text-center text-sm font-medium text-[#3a5a4a] hover:text-[#1f382a] underline">
              Forgot your password?
            </button>
          )}
          </>)}

          {/* Applies to email and Google sign-in alike */}
          <p className="mt-5 text-center text-xs text-gray-500 leading-relaxed">
            By continuing, you agree to our{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-[#2c4c3b] underline">Terms of Use</a>
            {' '}and acknowledge our{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-[#2c4c3b] underline">Privacy Policy</a>.
          </p>
        </div>

        <div className="px-8 py-5 bg-[#f7f8f6] border-t border-gray-100 text-center">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setMessage('');
              setView('form');
              setNotice('');
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