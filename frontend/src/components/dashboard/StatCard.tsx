"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LucideIcon, Info, X } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color: 'blue' | 'green' | 'amber' | 'red' | 'purple';
  trend?: {
    value: number;
    label: string;
  };
  details?: React.ReactNode;
}

const colorMap = {
  blue: 'bg-blue-50 text-blue-600 border-blue-100',
  green: 'bg-green-50 text-green-600 border-green-100',
  amber: 'bg-amber-50 text-amber-600 border-amber-100',
  red: 'bg-red-50 text-red-600 border-red-100',
  purple: 'bg-purple-50 text-purple-600 border-purple-100',
};

export default function StatCard({ title, value, icon: Icon, color, trend, details }: StatCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="esms-card p-6 group hover:border-slate-300 transition-colors flex flex-col h-full bg-white relative overflow-hidden"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-1.5 relative">
          <p className="text-slate-500 text-sm font-medium tracking-wide">{title}</p>
          {details && (
            <button 
              onClick={() => setIsFlipped(!isFlipped)}
              className="p-1 rounded-full hover:bg-slate-100 transition-colors focus:outline-none"
              title="View details"
            >
              {isFlipped ? (
                 <X size={14} className="text-slate-800 transition-colors" />
              ) : (
                 <Info size={14} className="text-slate-400 hover:text-slate-600 transition-colors" />
              )}
            </button>
          )}
        </div>
        <div className={`p-3 rounded-lg border shadow-sm ${colorMap[color]} transition-colors z-10`}>
          <Icon size={20} strokeWidth={2.5} />
        </div>
      </div>

      <div className="relative flex-1 flex flex-col" style={{ perspective: 1000 }}>
        <AnimatePresence mode="wait">
          {!isFlipped ? (
            <motion.div
              key="front"
              initial={{ rotateX: 90, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              exit={{ rotateX: -90, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col justify-end flex-1"
            >
              <p className="text-3xl font-semibold text-slate-900 tracking-tight">{value}</p>
              
              {trend && (
                <div className={`flex items-center gap-1 mt-3 text-sm ${trend.value >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  <span className="font-semibold px-2 py-0.5 rounded bg-slate-50 border border-slate-100">
                    {trend.value >= 0 ? '+' : ''}{trend.value}%
                  </span>
                  <span className="text-slate-500 font-medium ml-1">{trend.label}</span>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="back"
              initial={{ rotateX: -90, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              exit={{ rotateX: 90, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col justify-center flex-1 py-1"
            >
              <div className="w-full">
                {details}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
