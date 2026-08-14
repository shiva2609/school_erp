"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import api from '@/lib/axios';
import { toast } from 'react-hot-toast';
import { Loader2, LogOut, CheckCircle, XCircle, QrCode, User, Briefcase, ChevronLeft } from 'lucide-react';
import { useAuth } from '@/components/common/AuthProvider';
import { useRouter } from 'next/navigation';

export default function KioskView() {
  const router = useRouter();
  const { logout } = useAuth();
  
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [kioskState, setKioskState] = useState<'READY' | 'SCANNING' | 'CONFIRMING' | 'SUCCESS'>('READY');
  const [validationData, setValidationData] = useState<any>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    fetchDeviceInfo();
    return () => stopCamera();
  }, []);

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    
    if (kioskState === 'SCANNING') {
      scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 }, supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA] },
        /* verbose= */ false
      );
      
      scanner.render(
        (decodedText) => {
          if (scanner) {
            scanner.clear();
          }
          handleScan(decodedText);
        },
        (error) => {
          // ignore scan errors
        }
      );
    }
    
    return () => {
      if (scanner) {
        scanner.clear().catch(console.error);
      }
    };
  }, [kioskState]);

  // Idle timeout when confirming
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (kioskState === 'CONFIRMING' && !isSubmitting) {
      timeoutId = setTimeout(() => {
        toast.error('Session expired due to inactivity');
        resetKiosk();
      }, 30000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [kioskState, isSubmitting]);

  const resetKiosk = () => {
    setKioskState('READY');
    stopCamera();
    setPhotoBlob(null);
    setValidationData(null);
  };

  const fetchDeviceInfo = async () => {
    try {
      const res = await api.get('staff-attend/device/info/');
      setDeviceInfo(res.data);
    } catch (err: any) {
      toast.error('Failed to load device info');
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async (token: string) => {
    try {
      const res = await api.post('staff-attend/qr/validate/', { token });
      setValidationData(res.data);
      if (res.data.action === 'COMPLETED') {
        toast.error('Attendance already completed for today.');
        setTimeout(() => resetKiosk(), 3000);
      } else {
        setKioskState('CONFIRMING');
        startCamera();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invalid QR Code');
      resetKiosk();
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
    } catch (err) {
      toast.error('Failed to access camera');
      resetKiosk();
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const captureAndSubmit = () => {
    if (videoRef.current && canvasRef.current) {
      setIsSubmitting(true);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (blob) {
            setPhotoBlob(blob);
            await submitAttendance(blob);
          } else {
            setIsSubmitting(false);
            toast.error('Failed to capture photo');
          }
        }, 'image/jpeg', 0.8);
      }
    }
  };

  const submitAttendance = async (blob: Blob) => {
    if (!validationData) return;
    
    const formData = new FormData();
    formData.append('transaction_id', validationData.transaction_id);
    formData.append('action', validationData.action);
    formData.append('photo', blob, 'photo.jpg');

    try {
      await api.post('staff-attend/mark/', formData);
      setKioskState('SUCCESS');
      stopCamera();
      fetchDeviceInfo(); // refresh stats
      setTimeout(() => {
        resetKiosk();
      }, 3000);
    } catch (err: any) {
      const msg = err.response?.data?.error 
        || err.response?.data?.detail 
        || (err.response?.status ? `Server error (${err.response.status})` : 'Network error');
      toast.error(msg);
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  if (loading) {
    return <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 animate-spin text-blue-500 mx-auto" />;
  }

  return (
    <div className="w-full max-w-4xl mx-auto flex items-center justify-center py-2 sm:py-6">
      <div className="w-full bg-white/95 backdrop-blur-xl rounded-2xl sm:rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col min-h-auto md:min-h-[620px]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-4 sm:p-6 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 pr-2">
            {deviceInfo?.tenant_logo && (
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 p-1.5 rounded-xl sm:rounded-2xl backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={deviceInfo.tenant_logo} alt="Logo" className="w-full h-full object-contain" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl md:text-2xl font-bold tracking-tight truncate leading-snug">
                {deviceInfo?.tenant_name || 'School ERP'}
              </h1>
              <p className="text-slate-300 font-medium text-xs sm:text-sm tracking-wide opacity-90 truncate">
                Staff Attendance Device • {deviceInfo?.branch_name}
              </p>
            </div>
          </div>
          <button 
            onClick={handleLogout} 
            className="p-2 sm:p-2.5 hover:bg-white/10 rounded-xl sm:rounded-2xl transition-all duration-200 text-slate-300 hover:text-white shrink-0"
            title="Logout Device"
          >
            <LogOut className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 bg-gradient-to-b from-slate-50 to-white relative">
          
          {kioskState === 'READY' && (
            <div className="w-full max-w-sm sm:max-w-md animate-in fade-in zoom-in duration-300 flex flex-col items-center py-4 sm:py-6">
              <div className="w-20 h-20 sm:w-28 sm:h-28 bg-blue-50 rounded-full flex items-center justify-center mb-4 sm:mb-6 shadow-inner">
                <QrCode className="w-10 h-10 sm:w-14 sm:h-14 text-blue-600" />
              </div>
              
              <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 mb-2 tracking-tight">Ready to Scan</h2>
              <p className="text-slate-500 text-center mb-6 sm:mb-8 text-sm sm:text-base max-w-xs sm:max-w-sm">
                Open "My Attendance" on your phone to generate your personal QR code.
              </p>

              <button
                onClick={() => setKioskState('SCANNING')}
                className="group relative inline-flex items-center justify-center gap-2.5 sm:gap-3 w-full bg-blue-600 text-white px-6 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-base sm:text-lg font-semibold shadow-lg shadow-blue-600/20 hover:bg-blue-700 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                <QrCode className="w-5 h-5 sm:w-6 sm:h-6 relative z-10" />
                <span className="relative z-10">Scan QR Code</span>
              </button>

              <div className="mt-6 sm:mt-8 bg-white px-4 py-3.5 sm:px-6 sm:py-4 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm w-full">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-center mb-3">Today's Overview</p>
                <div className="flex justify-around items-center">
                  <div className="text-center">
                    <span className="block text-xl sm:text-2xl md:text-3xl font-bold text-slate-800">{deviceInfo?.stats.checked_in ?? 0}</span>
                    <span className="text-xs sm:text-sm font-medium text-slate-500">Checked In</span>
                  </div>
                  <div className="w-px h-8 sm:h-10 bg-slate-200" />
                  <div className="text-center">
                    <span className="block text-xl sm:text-2xl md:text-3xl font-bold text-slate-800">{deviceInfo?.stats.checked_out ?? 0}</span>
                    <span className="text-xs sm:text-sm font-medium text-slate-500">Checked Out</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {kioskState === 'SCANNING' && (
            <div className="w-full max-w-sm sm:max-w-lg animate-in slide-in-from-bottom-6 duration-300 py-2 sm:py-4">
              <button 
                onClick={resetKiosk}
                className="mb-3 sm:mb-4 flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm sm:text-base font-medium transition-colors"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" /> Back
              </button>
              
              <div className="bg-white p-2 rounded-2xl sm:rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
                <div id="reader" className="w-full rounded-xl sm:rounded-3xl overflow-hidden [&>div]:border-none"></div>
              </div>
              <p className="text-center text-slate-500 mt-4 text-xs sm:text-sm font-medium animate-pulse">Position QR code within the frame</p>
            </div>
          )}

          {kioskState === 'CONFIRMING' && validationData && (
            <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 animate-in slide-in-from-right-6 duration-300 py-2">
              {/* Employee Details Panel */}
              <div className="bg-white rounded-2xl sm:rounded-[2rem] shadow-md border border-slate-100 p-4 sm:p-6 flex flex-col">
                <div className="inline-flex items-center px-3 py-1 sm:px-4 sm:py-1.5 rounded-full bg-blue-50 text-blue-700 font-bold text-xs sm:text-sm tracking-wide uppercase self-start mb-4 sm:mb-6 border border-blue-100">
                  {validationData.action === 'CHECK_IN' ? 'Check In Request' : 'Check Out Request'}
                </div>
                
                <div className="flex-1 flex flex-col justify-center space-y-4 sm:space-y-5">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 sm:w-6 sm:h-6 text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">Employee Name</p>
                      <h2 className="text-base sm:text-xl font-bold text-slate-900 truncate">{validationData.staff_name}</h2>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                      <QrCode className="w-5 h-5 sm:w-6 sm:h-6 text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">Employee ID</p>
                      <p className="text-sm sm:text-base font-semibold text-slate-800 truncate">{validationData.employee_id}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                      <Briefcase className="w-5 h-5 sm:w-6 sm:h-6 text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">Designation</p>
                      <p className="text-sm sm:text-base font-semibold text-slate-800 truncate">{validationData.designation || 'Staff'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Camera & Actions Panel */}
              <div className="flex flex-col gap-4">
                <div className="bg-black rounded-2xl sm:rounded-[2rem] overflow-hidden relative aspect-video md:aspect-[4/3] shadow-lg ring-2 sm:ring-4 ring-slate-900/5">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                  
                  {/* Overlay instructions */}
                  <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4 bg-gradient-to-t from-black/80 to-transparent">
                    <p className="text-white font-medium text-center text-xs sm:text-sm">
                      Please look at the camera to verify your identity.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <button 
                    onClick={resetKiosk}
                    disabled={isSubmitting}
                    className="py-3 sm:py-3.5 bg-white border border-slate-200 text-slate-700 rounded-xl sm:rounded-2xl font-bold text-sm sm:text-base hover:bg-slate-50 hover:border-slate-300 transition-all focus:ring-2 focus:ring-slate-100"
                  >
                    Decline
                  </button>
                  <button 
                    onClick={captureAndSubmit}
                    disabled={isSubmitting}
                    className="py-3 sm:py-3.5 bg-blue-600 text-white rounded-xl sm:rounded-2xl font-bold text-sm sm:text-base shadow-md shadow-blue-600/30 hover:bg-blue-700 transition-all focus:ring-2 focus:ring-blue-600/20 flex justify-center items-center gap-2 hover:scale-[1.01] active:scale-[0.99]"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        Proceed <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {kioskState === 'SUCCESS' && (
            <div className="text-center animate-in zoom-in duration-300 flex flex-col items-center max-w-sm py-6">
              <div className="w-20 h-20 sm:w-28 sm:h-28 bg-green-50 rounded-full flex items-center justify-center mb-4 sm:mb-6 relative">
                <div className="absolute inset-0 bg-green-400 rounded-full animate-ping opacity-20"></div>
                <CheckCircle className="w-10 h-10 sm:w-14 sm:h-14 text-green-500 relative z-10" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2 tracking-tight">Success!</h2>
              <p className="text-sm sm:text-base text-slate-600 font-medium">
                {validationData?.action === 'CHECK_IN' ? 'Check-in' : 'Check-out'} recorded for <br/>
                <span className="text-slate-900 font-bold mt-1 inline-block">{validationData?.staff_name}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

