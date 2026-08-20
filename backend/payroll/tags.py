"""
Attendance auto-tagging engine.
Computes a tag for each attendance day based on branch shift settings.
"""
from datetime import timedelta, datetime
from django.utils import timezone


# Tags
PRESENT = 'PRESENT'
LATE_IN = 'LATE_IN'
EARLY_OUT = 'EARLY_OUT'
HALF_DAY = 'HALF_DAY'
LEAVE = 'LEAVE'
ABSENT = 'ABSENT'


def get_attendance_tag(attendance, branch):
    """
    Given a StaffAttendance record and its Branch, return a tag string.
    attendance: StaffAttendance instance (may have check_in_at, check_out_at, status)
    branch: Branch instance (has shift_start_time, shift_end_time, grace period fields)
    """
    if attendance is None:
        return ABSENT

    status = attendance.status
    if status == 'ON_LEAVE':
        return LEAVE
    if status == 'ABSENT':
        return ABSENT

    check_in_at = attendance.check_in_at
    check_out_at = attendance.check_out_at

    if not check_in_at:
        return ABSENT

    # Get shift boundaries
    shift_start = branch.shift_start_time
    shift_end = branch.shift_end_time
    grace_in = branch.late_in_grace_minutes or 0
    grace_out = branch.early_out_grace_minutes or 0

    # Convert check_in_at (UTC datetime) to local time
    local_check_in = timezone.localtime(check_in_at).time()

    # Compute the effective late boundary: shift_start + grace
    def add_minutes_to_time(t, minutes):
        dt = datetime.combine(datetime.today(), t)
        dt += timedelta(minutes=minutes)
        return dt.time()

    late_boundary = add_minutes_to_time(shift_start, grace_in)
    early_boundary = add_minutes_to_time(shift_end, -grace_out)

    is_late_in = local_check_in > late_boundary

    is_early_out = False
    if check_out_at:
        local_check_out = timezone.localtime(check_out_at).time()
        is_early_out = local_check_out < early_boundary

    # Determine final tag
    if is_late_in and is_early_out:
        return HALF_DAY
    if is_late_in:
        return LATE_IN
    if is_early_out:
        return EARLY_OUT
    return PRESENT


def compute_monthly_summary(staff, year, month, branch):
    """
    Compute attendance summary for a staff member for a given month.
    Returns a dict with counts.
    """
    from staff_attendance.models import StaffAttendance
    import calendar

    # Get all working days in the month (Mon-Fri = 5 days, or you can count all calendar days)
    _, days_in_month = calendar.monthrange(year, month)
    total_working_days = days_in_month  # Use calendar days; can refine to exclude Sundays later

    # Fetch all attendance records for this staff in this month
    records = StaffAttendance.objects.filter(
        staff=staff,
        date__year=year,
        date__month=month,
    ).select_related('staff')

    records_by_date = {r.date: r for r in records}

    present = 0
    absent = 0
    late_in = 0
    early_out = 0
    leave = 0
    half_day = 0

    from datetime import date
    for day in range(1, days_in_month + 1):
        d = date(year, month, day)
        record = records_by_date.get(d)
        tag = get_attendance_tag(record, branch)

        if tag == PRESENT:
            present += 1
        elif tag == ABSENT:
            absent += 1
        elif tag == LATE_IN:
            present += 1  # Still present, just late
            late_in += 1
        elif tag == EARLY_OUT:
            present += 1  # Still present, just left early
            early_out += 1
        elif tag == HALF_DAY:
            half_day += 1
            late_in += 1
            early_out += 1
        elif tag == LEAVE:
            leave += 1

    return {
        'total_working_days': total_working_days,
        'present_days': present,
        'absent_days': absent,
        'late_in_count': late_in,
        'early_out_count': early_out,
        'leave_days': leave,
        'half_days': half_day,
    }
