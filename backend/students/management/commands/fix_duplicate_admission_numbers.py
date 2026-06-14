import logging
from django.core.management.base import BaseCommand
from django.db import models, transaction
from tenants.models import Tenant
from students.models import Student

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Finds duplicate admission numbers across branches within a tenant and re-assigns them.'

    def handle(self, *args, **options):
        tenants = Tenant.objects.all()
        total_fixed = 0

        for tenant in tenants:
            # Find admission numbers that appear more than once within the same tenant
            duplicates = Student.objects.filter(tenant=tenant).values('admission_number').annotate(
                count=models.Count('id')
            ).filter(count__gt=1)

            for dup in duplicates:
                adm_num = dup['admission_number']
                
                # Fetch all students sharing this duplicate number, ordered by creation date
                # The oldest student keeps the original number, others get a new one.
                students_with_dup = list(Student.objects.filter(
                    tenant=tenant, 
                    admission_number=adm_num
                ).order_by('created_at'))
                
                # Skip the first student (they keep the admission number)
                for student in students_with_dup[1:]:
                    self.stdout.write(f"Fixing duplicate for student ID {student.id} (Name: {student.first_name} {student.last_name}), current number: {student.admission_number}")
                    
                    try:
                        # Generate a new admission number within a transaction to utilize the tenant lock
                        with transaction.atomic():
                            new_no = Student.generate_admission_number(student.branch, student.academic_year)
                            student.admission_number = new_no
                            student.save(update_fields=['admission_number'])
                            
                        self.stdout.write(self.style.SUCCESS(f"  -> Reassigned to {new_no}"))
                        total_fixed += 1
                    except Exception as e:
                        self.stderr.write(self.style.ERROR(f"  -> Failed to reassign: {e}"))

        if total_fixed > 0:
            self.stdout.write(self.style.SUCCESS(f"\nSuccessfully resolved {total_fixed} duplicate admission numbers!"))
        else:
            self.stdout.write(self.style.SUCCESS("\nNo duplicate admission numbers found. Everything is clean!"))
