export type EmploymentType = 'Vollzeit' | 'Teilzeit' | 'Minijob' | 'Aushilfe'

export type Employee = {
  id: string
  name: string
  email: string
  role: 'admin' | 'manager' | 'employee'
  position: string
  color: string
  avatar?: string
  phone?: string
  employment_type?: EmploymentType | string | null
  start_date?: string | null
  personnel_number?: string | null
  notifications_enabled?: boolean | null
  auth_user_id?: string | null
  // Sensitive fields live in employee_private; merged in for management views only.
  hourly_wage?: number | null
  weekly_hours?: number | null
  vacation_days_per_year?: number | null
  birth_date?: string | null
  address?: string | null
  notes?: string | null
  created_at: string
}

export type EmployeeDocument = {
  id: string
  employee_id: string
  name: string
  category: string
  file_path: string
  size_bytes?: number | null
  uploaded_at: string
}

export type DayHours = { open: string; close: string; closed: boolean }
export type OpeningHours = Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', DayHours>

export type Shift = {
  id: string
  employee_id: string | null
  employee?: Employee
  date: string
  start_time: string
  end_time: string
  position: string
  note?: string
  status: 'scheduled' | 'confirmed' | 'absent'
  created_at: string
}

export type TimeEntry = {
  id: string
  employee_id: string
  employee?: Employee
  date: string
  clock_in: string
  clock_out?: string
  break_minutes: number
  total_hours?: number
  shift_revenue?: number | null
  auto_closed?: boolean
  created_at: string
}

export type WeekDay = {
  date: Date
  label: string
  isToday: boolean
}

export type MessageType = 'chat' | 'coverage_request' | 'coverage_offer' | 'coverage_filled'

export type Message = {
  id: string
  employee_id: string | null
  content: string
  type: MessageType
  meta?: CoverageMeta | null
  created_at: string
  employee?: Employee
}

export type CoverageMeta = {
  request_id?: string
  candidate_ids?: string[]
  suggested_id?: string | null
}

export type CoverageStatus = 'open' | 'filled' | 'cancelled'

export type CoverageRequest = {
  id: string
  shift_id: string | null
  absence_id: string | null
  original_employee_id: string | null
  date: string
  start_time?: string | null
  end_time?: string | null
  position?: string | null
  reason: string
  status: CoverageStatus
  suggested_employee_id?: string | null
  filled_by?: string | null
  approved_by?: string | null
  created_at: string
  offers?: CoverageOffer[]
}

export type CoverageOffer = {
  id: string
  request_id: string
  employee_id: string
  created_at: string
  employee?: Employee
}
