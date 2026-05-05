"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import api from '@/lib/axios';
import Link from 'next/link';

const loginSchema = z.object({
  email: z.string().min(1, { message: "Email or phone number is required" }),
  password: z.string().min(1, { message: "Password is required" }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

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
      window.location.href = '/dashboard';
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
      window.location.href = '/dashboard';
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.detail;
      setServerError(msg || 'Invalid code. Try again.');
    } finally {
      setMfaSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex flex-col items-center">
          <div className="rounded-xl bg-black px-6 py-4 shadow-lg ring-1 ring-slate-200/80">
            <Image
              src="/vaarahi.png"
              alt="Vaarahi Edu Smart Services — Passion for Excellence"
              width={280}
              height={72}
              className="h-auto w-[min(100%,280px)] object-contain"
              priority
            />
          </div>
        </div>
        <h2 className="mt-8 text-center text-3xl font-extrabold text-slate-900">
          Sign in to your account
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          {mfaChallenge ? 'Enter the code from your authenticator app' : 'Enter your credentials to continue'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-slate-100">
          {serverError && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 border border-red-100 rounded-xl text-sm font-medium flex items-start gap-2">
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span>{serverError}</span>
            </div>
          )}

          {mfaChallenge ? (
            <form className="space-y-6" onSubmit={onMfaSubmit}>
              <div>
                <label className="block text-sm font-medium text-slate-700">Authentication code</label>
                <div className="mt-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    className="appearance-none block w-full px-4 py-3 border border-slate-200 rounded-xl shadow-sm placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm transition-all"
                    placeholder="6-digit code"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={mfaSubmitting || !mfaCode.trim()}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-all disabled:opacity-50"
              >
                {mfaSubmitting ? 'Verifying…' : 'Continue'}
              </button>
              <button
                type="button"
                onClick={() => { setMfaChallenge(null); setMfaCode(''); setServerError(''); }}
                className="w-full text-sm text-slate-600 hover:text-slate-900"
              >
                ← Back to sign in
              </button>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
              <div>
                <label className="block text-sm font-medium text-slate-700">Email or Phone Number</label>
                <div className="mt-2">
                  <input
                    type="text"
                    {...register('email')}
                    className="appearance-none block w-full px-4 py-3 border border-slate-200 rounded-xl shadow-sm placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm transition-all"
                    placeholder="Enter your email or phone number"
                    autoComplete="email"
                  />
                  {errors.email && <p className="mt-1 text-sm text-red-600 font-medium">{errors.email.message}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <div className="mt-2">
                  <input
                    type="password"
                    {...register('password')}
                    className="appearance-none block w-full px-4 py-3 border border-slate-200 rounded-xl shadow-sm placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm transition-all"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  {errors.password && <p className="mt-1 text-sm text-red-600 font-medium">{errors.password.message}</p>}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input id="remember-me" name="remember-me" type="checkbox" className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded" />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-900">Remember me</label>
                </div>
                <div className="text-sm">
                  <Link href="/forgot-password" className="font-medium text-blue-600 hover:text-blue-500 transition-colors">
                    Forgot your password?
                  </Link>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Signing in...' : 'Sign in'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
