"use client";

import MasterDataCRUD from '@/components/staff/MasterDataCRUD';
import { useApi } from '@/lib/hooks';

export default function StaffDesignationsPage() {
  const { data: categories } = useApi<any[]>('staff-categories/');
  
  return (
    <MasterDataCRUD
      title="Designations"
      description="Manage job titles and link them to categories."
      endpoint="staff-designations/"
      columns={[
        { key: 'category_name', label: 'Category' }
      ]}
      extraFields={[
        { 
          key: 'category', 
          label: 'Category', 
          type: 'select', 
          options: categories?.map(c => ({ label: c.name, value: c.id })) || []
        }
      ]}
    />
  );
}
