"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import api from '@/lib/axios';
import Link from 'next/link';
import { getPostLoginPath } from '@/lib/rolePortal';
import { safeInternalNext } from '@/lib/loginNext';

const loginSchema = z.object({
  email: z.string().min(1, { message: "Email or phone number is required" }),
  password: z.string().min(1, { message: "Password is required" }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function postLoginUrl(role: string, tenant: string | null | undefined) {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const next = safeInternalNext(params.get('next'));
  return next || getPostLoginPath(role, tenant ?? null);
}

export default function LoginPage() {
  const [serverError, setServerError] = useState('');
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  // Track redirect state so we can suppress stale error messages during navigation
  const [isRedirecting, setIsRedirecting] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    // Auto-refresh the page once to clear out any stale cache, state, or CSRF tokens.
    // This solves issues where users are on an old frontend build or have stale cookies.
    if (typeof window !== 'undefined') {
      const hasRefreshed = sessionStorage.getItem('loginRefreshed');
      if (!hasRefreshed) {
        sessionStorage.setItem('loginRefreshed', 'true');
        window.location.reload();
      }
    }
  }, []);

  const onSubmit = async (data: LoginFormValues) => {
    setServerError('');
    try {
      const res = await api.post('auth/login/', data);
      if (res.data?.mfa_required && res.data?.mfa_challenge) {
        setMfaChallenge(res.data.mfa_challenge);
        setMfaCode('');
        return;
      }

      // BUG FIX: Fetch /me with { _skipRedirectOn401: true } so the axios interceptor
      // does NOT redirect to /login on 401 here — it would cause a blank-page flash
      // immediately after a successful login if the session cookie hasn't propagated yet.
      const me = await api.get('auth/me/', { _skipAuthRedirect: true } as object);
      const u = me.data?.data;
      const dest = postLoginUrl(u?.role ?? '', u?.tenant ?? null);

      // Mark redirecting so no stale errors flash during navigation
      setIsRedirecting(true);
      window.location.href = dest;
    } catch (err: unknown) {
      setIsRedirecting(false);
      const axiosErr = err as { response?: { status?: number; data?: { detail?: string } } };
      const status = axiosErr.response?.status;
      const detail = axiosErr.response?.data?.detail;

      if (status === 429) {
        setServerError("Too many login attempts. Please wait a minute and try again.");
      } else if (status === 401 || (typeof detail === 'string' && detail.toLowerCase().includes('no active account'))) {
        setServerError("Invalid email/phone or password. Please check your credentials.");
      } else if (!axiosErr.response) {
        setServerError("Unable to reach the server. Check your internet connection.");
      } else {
        setServerError(detail || "Something went wrong. Please try again.");
      }
    }
  };

  const onMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallenge || !mfaCode.trim()) return;
    setServerError('');
    setMfaSubmitting(true);
    try {
      await api.post('auth/mfa/verify/', {
        mfa_challenge: mfaChallenge,
        code: mfaCode.replace(/\s/g, ''),
      });
      const me = await api.get('auth/me/', { _skipAuthRedirect: true } as object);
      const u = me.data?.data;
      const dest = postLoginUrl(u?.role ?? '', u?.tenant ?? null);
      setIsRedirecting(true);
      window.location.href = dest;
    } catch (err: unknown) {
      setIsRedirecting(false);
      const axiosErr = err as { response?: { data?: { error?: string; detail?: string } } };
      const msg = axiosErr.response?.data?.error || axiosErr.response?.data?.detail;
      setServerError(msg || 'Invalid code. Try again.');
    } finally {
      setMfaSubmitting(false);
    }
  };

  // Shared input class — removed backdrop-blur-sm which causes iOS Safari rendering glitches
  const inputClass =
    'block w-full px-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 transition-all duration-150';

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgb(241,245,249),rgb(248,250,252))]">
      {/* Full-height scroll container — handles iOS Safari bottom bar safely */}
      <div className="w-full flex-1 flex flex-col items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-[24rem] sm:max-w-[26rem] flex flex-col items-center text-center">

          {/* Logo */}
          <div className="w-full flex justify-center">
            <Image
              src="/vaarahi.png"
              alt="Vaarahi Edu Smart Services — Passion for Excellence"
              width={560}
              height={140}
              className="h-auto w-full max-w-[min(88vw,20rem)] sm:max-w-[min(85vw,22rem)] object-contain select-none"
              priority
            />
          </div>

          {/* Heading */}
          <h1 className="mt-8 sm:mt-10 text-2xl sm:text-[1.65rem] font-semibold tracking-tight text-slate-900">
            Sign in to your account
          </h1>
          <p className="mt-2 text-sm sm:text-[0.9375rem] text-slate-500 leading-relaxed">
            {mfaChallenge ? 'Enter the code from your authenticator app' : 'Enter your credentials to continue'}
          </p>

          {/* Form container */}
          <div className="mt-8 w-full text-left">

            {/* Server error — only show when NOT redirecting (prevents stale flash) */}
            {serverError && !isRedirecting && (
              <div
                role="alert"
                className="mb-5 p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm font-medium flex items-start gap-3"
              >
                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <span>{serverError}</span>
              </div>
            )}

            {/* Redirect overlay — prevents any content flash while navigating */}
            {isRedirecting && (
              <div className="mb-5 p-4 bg-green-50 text-green-700 border border-green-200 rounded-xl text-sm font-medium flex items-center gap-3">
                <svg className="w-5 h-5 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Signing you in…</span>
              </div>
            )}

            {mfaChallenge ? (
              <form className="space-y-5" onSubmit={onMfaSubmit} noValidate>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Authentication code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    className={inputClass}
                    placeholder="6-digit code"
                  />
                </div>
                <button
                  type="submit"
                  disabled={mfaSubmitting || !mfaCode.trim() || isRedirecting}
                  className="w-full flex justify-center py-3.5 px-4 rounded-xl text-[0.9375rem] font-semibold text-white bg-slate-900 hover:bg-slate-800 active:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {mfaSubmitting ? 'Verifying…' : 'Continue'}
                </button>
                <button
                  type="button"
                  onClick={() => { setMfaChallenge(null); setMfaCode(''); setServerError(''); }}
                  className="w-full text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors py-2"
                >
                  ← Back to sign in
                </button>
              </form>
            ) : (
              <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                    Email or Phone Number
                  </label>
                  <input
                    id="email"
                    type="text"
                    {...register('email')}
                    className={inputClass}
                    placeholder="Enter your email or phone number"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  {errors.email && (
                    <p className="mt-2 text-sm text-red-600 font-medium" role="alert">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    {...register('password')}
                    className={inputClass}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  {errors.password && (
                    <p className="mt-2 text-sm text-red-600 font-medium" role="alert">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-4 pt-1">
                  <div className="flex items-center gap-2.5">
                    <input
                      id="remember-me"
                      name="remember-me"
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20 cursor-pointer"
                    />
                    <label htmlFor="remember-me" className="text-sm text-slate-600 cursor-pointer select-none">
                      Remember me
                    </label>
                  </div>
                  <Link
                    href="/forgot-password"
                    className="text-sm font-semibold text-slate-700 hover:text-slate-900 underline-offset-4 hover:underline transition-colors shrink-0"
                  >
                    Forgot password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || isRedirecting}
                  className="mt-1 w-full flex justify-center py-3.5 px-4 rounded-xl text-[0.9375rem] font-semibold text-white bg-slate-900 hover:bg-slate-800 active:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                >
                  {isSubmitting || isRedirecting ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Signing in…
                    </span>
                  ) : 'Sign in'}
                </button>
              </form>
            )}
          </div>

          <p className="mt-8 text-sm text-slate-500 max-w-sm leading-relaxed">
            <Link
              href="/login?next=/m"
              className="font-semibold text-slate-800 hover:underline underline-offset-4"
            >
              Mobile app layout
            </Link>
            {' — '}same login; touch-friendly navigation after you sign in.
          </p>
        </div>
      </div>
    </div>
  );
}
