"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';

interface BranchContextType {
  selectedBranch: string;
  setSelectedBranch: (id: string) => void;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

/**
 * Roles that operate across branches and use the global header branch selector.
 * Must stay in sync with backend: PLATFORM_OWNER_ROLES + TENANT_FULL_ACCESS_ROLES
 * + TENANT_FINANCE_ROLES + ZONE_SCOPED_ROLES.
 */
const GLOBAL_SELECTOR_ROLES = new Set([
  'OWNER',
  'SUPER_ADMIN',
  'CHIEF_ACCOUNTANT',
  'ZONAL_ADMIN',
]);

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [localBranch, setLocalBranch] = useState<string>('');

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('selectedBranch');
    if (saved) setLocalBranch(saved);
  }, []);

  const handleSetBranch = (id: string) => {
    setLocalBranch(id);
    localStorage.setItem('selectedBranch', id);
  };

  // Branch-scoped roles always use their own branch from the user profile.
  // Global roles use the localStorage-backed header selector.
  // While user is still loading (null), return '' — pages handle loading states.
  const isGlobalRole = GLOBAL_SELECTOR_ROLES.has(user?.role || '');
  const selectedBranch = user === null
    ? ''
    : isGlobalRole
      ? localBranch
      : (user?.branch_id || user?.branch || localBranch || '');

  return (
    <BranchContext.Provider value={{ selectedBranch, setSelectedBranch: handleSetBranch }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (context === undefined) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
}
