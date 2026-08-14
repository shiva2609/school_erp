"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import api from '@/lib/axios';
import { toast } from 'react-hot-toast';
import { Loader2, Camera, LogOut, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '@/components/common/AuthProvider';
import { useRouter } from 'next/navigation';

export default function KioskView() {
  const router = useRouter();
  const { logout } = useAuth();
  
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [kioskState, setKioskState] = useState<'READY' | 'CONFIRMING' | 'SUCCESS'>('READY');
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
    
    if (kioskState === 'READY' && deviceInfo) {
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
          // ignore scan errors (they happen every frame a QR is not found)
        }
      );
    }
    
    return () => {
      if (scanner) {
        scanner.clear().catch(console.error);
      }
    };
  }, [kioskState, deviceInfo]);

  // Idle timeout when confirming
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (kioskState === 'CONFIRMING' && !isSubmitting) {
      timeoutId = setTimeout(() => {
        toast.error('Session expired due to inactivity');
        setKioskState('READY');
        stopCamera();
        setPhotoBlob(null);
        setValidationData(null);
      }, 30000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [kioskState, photoBlob, isSubmitting]);

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
        setTimeout(() => setKioskState('READY'), 3000);
      } else {
        setKioskState('CONFIRMING');
        startCamera();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invalid QR Code');
      setTimeout(() => setKioskState('READY'), 2000);
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
      setKioskState('READY');
      setValidationData(null);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const capturePhoto = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          setPhotoBlob(blob);
        }, 'image/jpeg', 0.8);
      }
    }
  }, []);

  const retakePhoto = () => {
    setPhotoBlob(null);
  };

  const submitAttendance = async () => {
    if (!photoBlob || !validationData) return;
    
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('transaction_id', validationData.transaction_id);
    formData.append('action', validationData.action);
    formData.append('photo', photoBlob, 'photo.jpg');

    try {
      await api.post('staff-attend/mark/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setKioskState('SUCCESS');
      stopCamera();
      fetchDeviceInfo(); // refresh stats
      setTimeout(() => {
        setKioskState('READY');
        setValidationData(null);
        setPhotoBlob(null);
      }, 3000);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to mark attendance');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  if (loading) {
    return <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto" />;
  }

  return (
    <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col min-h-[80vh]">
      {/* Header */}
      <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{deviceInfo?.tenant_name || 'School ERP'}</h1>
          <p className="text-slate-300">Staff Attendance Kiosk • {deviceInfo?.branch_name}</p>
        </div>
        <button onClick={handleLogout} className="p-2 hover:bg-slate-800 rounded-full transition text-slate-300">
          <LogOut className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 flex flex-col p-6 items-center justify-center bg-gray-50">
        
        {kioskState === 'READY' && (
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-300">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-semibold text-gray-800">Scan Your QR Code</h2>
              <p className="text-gray-500 mt-1">Open "My Attendance" on your phone to generate a QR.</p>
            </div>
            
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
              <div id="reader" className="w-full overflow-hidden rounded-lg"></div>
            </div>

            <div className="mt-8 bg-blue-50 p-4 rounded-xl text-center text-sm text-blue-800">
              <p className="font-medium">Today's Stats</p>
              <div className="flex justify-center gap-6 mt-2">
                <span>Checked In: <b>{deviceInfo?.stats.checked_in}</b></span>
                <span>Checked Out: <b>{deviceInfo?.stats.checked_out}</b></span>
              </div>
            </div>
          </div>
        )}

        {kioskState === 'CONFIRMING' && validationData && (
          <div className="w-full max-w-lg animate-in slide-in-from-right-4 duration-300">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-6 text-center">
              <h2 className="text-xl font-bold text-gray-900">{validationData.staff_name}</h2>
              <p className="text-gray-500">{validationData.employee_id} • {validationData.designation}</p>
              
              <div className="mt-4 inline-block bg-blue-100 text-blue-800 px-4 py-1.5 rounded-full font-semibold">
                {validationData.action === 'CHECK_IN' ? 'Check In' : 'Check Out'}
              </div>
            </div>

            <div className="bg-black rounded-2xl overflow-hidden relative aspect-video flex items-center justify-center">
              {!photoBlob ? (
                <>
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <button 
                    onClick={capturePhoto}
                    className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white text-gray-900 p-4 rounded-full shadow-lg hover:scale-105 transition"
                  >
                    <Camera className="w-8 h-8" />
                  </button>
                </>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(photoBlob)} alt="Captured" className="w-full h-full object-cover" />
                  <button 
                    onClick={retakePhoto}
                    className="absolute top-4 right-4 bg-black/50 text-white px-4 py-2 rounded-lg hover:bg-black/70 transition backdrop-blur-sm text-sm"
                  >
                    Retake
                  </button>
                </>
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="flex gap-4 mt-6">
              <button 
                onClick={() => {
                  setKioskState('READY');
                  stopCamera();
                  setPhotoBlob(null);
                }}
                disabled={isSubmitting}
                className="flex-1 py-4 bg-gray-200 text-gray-800 rounded-xl font-semibold hover:bg-gray-300 transition"
              >
                Cancel
              </button>
              <button 
                onClick={submitAttendance}
                disabled={!photoBlob || isSubmitting}
                className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                Confirm
              </button>
            </div>
          </div>
        )}

        {kioskState === 'SUCCESS' && (
          <div className="text-center animate-in zoom-in duration-300 flex flex-col items-center">
            <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
              <CheckCircle className="w-12 h-12" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Success!</h2>
            <p className="text-lg text-gray-600">
              {validationData?.action === 'CHECK_IN' ? 'Checked in' : 'Checked out'} successfully.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
