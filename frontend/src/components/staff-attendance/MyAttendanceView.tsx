"use client";

import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import api from '@/lib/axios';
import { toast } from 'react-hot-toast';
import { Loader2, QrCode, X, CheckCircle, Clock } from 'lucide-react';

export default function MyAttendanceView() {
  const [status, setStatus] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [showQr, setShowQr] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    fetchStatus();
    fetchHistory();
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showQr && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (showQr && timeLeft === 0) {
      // Auto-regenerate or close
      generateQr();
    }
    return () => clearInterval(timer);
  }, [showQr, timeLeft]);

  const fetchStatus = async () => {
    try {
      const res = await api.get('staff-attend/my-status/');
      setStatus(res.data);
    } catch (err: any) {
      toast.error('Failed to load status');
    } finally {
      setLoadingStatus(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await api.get('staff-attend/my-history/');
      setHistory(res.data.results || []);
    } catch (err: any) {
      toast.error('Failed to load history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const generateQr = async () => {
    try {
      const res = await api.get('staff-attend/qr/generate/');
      setQrData(res.data.qr_data);
      setTimeLeft(res.data.expires_in);
      setShowQr(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to generate QR');
      setShowQr(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My Attendance</h1>

      {/* Status Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Today's Status</h2>
        {loadingStatus ? (
          <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
        ) : status ? (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-gray-600 mb-1">{status.date}</p>
              <div className="flex items-center gap-2">
                {status.status === 'NOT_CHECKED_IN' && <Clock className="w-5 h-5 text-gray-400" />}
                {status.status === 'CHECKED_IN' && <CheckCircle className="w-5 h-5 text-green-500" />}
                {status.status === 'CHECKED_OUT' && <CheckCircle className="w-5 h-5 text-blue-500" />}
                <span className="font-medium text-gray-900 text-lg">{status.message}</span>
              </div>
              {(status.check_in_at || status.check_out_at) && (
                <div className="mt-3 text-sm text-gray-500 space-y-1">
                  {status.check_in_at && (
                    <p>Check-in: {new Date(status.check_in_at).toLocaleTimeString()}</p>
                  )}
                  {status.check_out_at && (
                    <p>Check-out: {new Date(status.check_out_at).toLocaleTimeString()}</p>
                  )}
                </div>
              )}
            </div>
            {status.can_generate_qr && (
              <button
                onClick={generateQr}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                <QrCode className="w-5 h-5" />
                <span>Show QR Code</span>
              </button>
            )}
          </div>
        ) : (
          <p className="text-gray-500">Could not load status.</p>
        )}
      </div>

      {/* History Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Attendance History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
              <tr>
                <th className="py-3 px-6 font-medium">Date</th>
                <th className="py-3 px-6 font-medium">Status</th>
                <th className="py-3 px-6 font-medium">Check In</th>
                <th className="py-3 px-6 font-medium">Check Out</th>
              </tr>
            </thead>
            <tbody>
              {loadingHistory ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" />
                  </td>
                </tr>
              ) : history.length > 0 ? (
                history.map((record) => (
                  <tr key={record.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-6">{record.date}</td>
                    <td className="py-3 px-6 font-medium">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        record.status === 'CHECKED_IN' ? 'bg-green-100 text-green-700' :
                        record.status === 'CHECKED_OUT' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {record.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-6">
                      {record.check_in_at ? new Date(record.check_in_at).toLocaleTimeString() : '--'}
                    </td>
                    <td className="py-3 px-6">
                      {record.check_out_at ? new Date(record.check_out_at).toLocaleTimeString() : '--'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-500">
                    No attendance records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* QR Modal */}
      {showQr && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Scan at Kiosk</h3>
              <button 
                onClick={() => {
                  setShowQr(false);
                  fetchStatus(); // Refresh status on close just in case
                }}
                className="p-1 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8 flex flex-col items-center">
              {qrData ? (
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                  <QRCodeSVG value={qrData} size={200} level="H" />
                </div>
              ) : (
                <div className="w-[200px] h-[200px] flex items-center justify-center bg-gray-50 rounded-xl">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              )}
              
              <p className="mt-6 text-sm text-gray-500 text-center">
                Hold this QR code up to the attendance device camera.
              </p>
              
              <div className="mt-4 w-full">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Expires in {timeLeft}s</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-blue-500 h-full transition-all duration-1000 ease-linear"
                    style={{ width: `${(timeLeft / 15) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
