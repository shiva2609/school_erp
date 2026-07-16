import MasterDataCRUD from '@/components/staff/MasterDataCRUD';

export default function StaffQualificationsPage() {
  return (
    <MasterDataCRUD
      title="Qualifications"
      description="Manage educational degrees (e.g., B.Ed, M.Sc, PhD)."
      endpoint="staff-qualifications/"
      columns={[]}
    />
  );
}
