import MasterDataCRUD from '@/components/staff/MasterDataCRUD';

export default function StaffDepartmentsPage() {
  return (
    <MasterDataCRUD
      title="Departments"
      description="Manage organizational departments like Science, Humanities, IT, etc."
      endpoint="staff-departments/"
      columns={[]}
    />
  );
}
