import MasterDataCRUD from '@/components/staff/MasterDataCRUD';

export default function StaffCategoriesPage() {
  return (
    <MasterDataCRUD
      title="Staff Categories"
      description="Manage top-level classifications like Teaching Staff, Administration, etc."
      endpoint="staff-categories/"
      columns={[
        { 
          key: 'is_teaching_role', 
          label: 'Role Type',
          render: (val) => (
            <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${val ? 'bg-violet-50 text-violet-600 border border-violet-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
              {val ? 'TEACHING' : 'NON-TEACHING'}
            </span>
          )
        }
      ]}
      extraFields={[
        { key: 'is_teaching_role', label: 'Is Teaching Role?', type: 'checkbox' }
      ]}
    />
  );
}
