"use client";

import React, { useState } from 'react';
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
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setServerError('');
    try {
      const res = await api.post('auth/login/', data);
      if (res.data?.mfa_required && res.data?.mfa_challenge) {
        setMfaChallenge(res.data.mfa_challenge);
        setMfaCode('');
        return;
      }
      const me = await api.get('auth/me/');
      const u = me.data?.data;
      window.location.href = postLoginUrl(u?.role ?? '', u?.tenant ?? null);
    } catch (err: any) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;

      if (status === 429) {
        setServerError("Too many login attempts. Please wait a minute and try again.");
      } else if (status === 401 || detail?.toLowerCase().includes('no active account')) {
        setServerError("Invalid email/phone or password. Please check your credentials.");
      } else if (!err.response) {
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
      const me = await api.get('auth/me/');
      const u = me.data?.data;
      window.location.href = postLoginUrl(u?.role ?? '', u?.tenant ?? null);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.detail;
      setServerError(msg || 'Invalid code. Try again.');
    } finally {
      setMfaSubmitting(false);
    }
  };

  const inputClass =
    'block w-full px-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 bg-white/70 backdrop-blur-sm border border-slate-200/80 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-16 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgb(241,245,249),rgb(248,250,252))]">
      <div className="w-full max-w-[26rem] flex flex-col items-center text-center">
        <Image
          src="/vaarahi.png"
          alt="Vaarahi Edu Smart Services — Passion for Excellence"
          width={560}
          height={140}
          className="h-auto w-full max-w-[min(92vw,22rem)] sm:max-w-[min(88vw,26rem)] object-contain select-none"
          priority
        />

        <h1 className="mt-10 sm:mt-12 text-[1.65rem] sm:text-3xl font-semibold tracking-tight text-slate-900">
          Sign in to your account
        </h1>
        <p className="mt-2 text-[0.9375rem] text-slate-500 leading-relaxed max-w-sm">
          {mfaChallenge ? 'Enter the code from your authenticator app' : 'Enter your credentials to continue'}
        </p>

        <div className="mt-10 w-full text-left">
          {serverError && (
            <div className="mb-6 p-4 bg-red-50/90 text-red-700 border border-red-100/80 rounded-2xl text-sm font-medium flex items-start gap-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span>{serverError}</span>
            </div>
          )}

          {mfaChallenge ? (
            <form className="space-y-6" onSubmit={onMfaSubmit}>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Authentication code</label>
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
                disabled={mfaSubmitting || !mfaCode.trim()}
                className="w-full flex justify-center py-3.5 px-4 rounded-2xl text-[0.9375rem] font-semibold text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 focus:ring-offset-transparent shadow-lg shadow-slate-900/15 transition-all disabled:opacity-50 disabled:shadow-none"
              >
                {mfaSubmitting ? 'Verifying…' : 'Continue'}
              </button>
              <button
                type="button"
                onClick={() => { setMfaChallenge(null); setMfaCode(''); setServerError(''); }}
                className="w-full text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                ← Back to sign in
              </button>
            </form>
          ) : (
            <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Email or Phone Number</label>
                <input
                  type="text"
                  {...register('email')}
                  className={inputClass}
                  placeholder="Enter your email or phone number"
                  autoComplete="email"
                />
                {errors.email && <p className="mt-2 text-sm text-red-600 font-medium">{errors.email.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
                <input
                  type="password"
                  {...register('password')}
                  className={inputClass}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                {errors.password && <p className="mt-2 text-sm text-red-600 font-medium">{errors.password.message}</p>}
              </div>

              <div className="flex items-center justify-between gap-4 pt-1">
                <div className="flex items-center">
                  <input id="remember-me" name="remember-me" type="checkbox" className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20" />
                  <label htmlFor="remember-me" className="ml-2.5 block text-sm text-slate-600">Remember me</label>
                </div>
                <Link href="/forgot-password" className="text-sm font-semibold text-slate-700 hover:text-slate-900 underline-offset-4 hover:underline transition-colors shrink-0">
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 w-full flex justify-center py-3.5 px-4 rounded-2xl text-[0.9375rem] font-semibold text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 focus:ring-offset-transparent shadow-lg shadow-slate-900/15 transition-all disabled:opacity-50 disabled:shadow-none"
              >
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          )}
        </div>

        <p className="mt-10 text-sm text-slate-500 max-w-sm leading-relaxed">
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
  );
}
