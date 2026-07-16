"use client";

import MasterDataCRUD from '@/components/staff/MasterDataCRUD';

export default function StaffSpecializationsPage() {
  return (
    <MasterDataCRUD
      title="Specializations"
      description="Manage subject areas or domain expertise (e.g., Mathematics, HR)."
      endpoint="staff-specializations/"
      columns={[]}
    />
  );
}
