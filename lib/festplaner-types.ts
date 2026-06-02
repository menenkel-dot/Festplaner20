export type ReservationStatus = "Ausstehend" | "Bestätigt" | "Storniert";
export type FinancialType = "expense" | "revenue";
export type FinancialStatus = "Bezahlt" | "Offen" | "Erhalten";

export interface ProgramItem {
  id: string;
  time: string;
  title: string;
  location: string;
  description: string;
  reservationUsesTentPlan?: boolean;
  reservationTableLimit?: number;
}

export interface ChecklistItem {
  id: string;
  dueDate?: string;
  task: string;
  completed: boolean;
  assignedTo?: string;
}

export interface Protocol {
  id: string;
  title: string;
  date: string;
  attendees: string;
  topics: string;
  decisions: string;
}

export interface Shift {
  id: string;
  day: string;
  time: string;
  role: string;
  needed: number;
  helpers: string[];
  notes?: string;
}

export interface Reservation {
  id: string;
  tableId: number;
  tableIds?: number[];
  tableCount?: number;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  guestType?: "private" | "club";
  clubName?: string;
  clubReservationNotes?: string;
  guests: number;
  date: string;
  time: string;
  status: ReservationStatus;
}

export interface FinancialItem {
  id: string;
  type: FinancialType;
  category: string;
  description: string;
  amount: number;
  status: FinancialStatus;
  attachmentName?: string;
  attachmentData?: string;
}

export interface FestDay {
  id: string;
  name: string;
  reservationsEnabled: boolean;
  tableCount: number;
  gridCols: number;
  reservationTimes?: string[];
}

export interface FestInfo {
  name: string;
  date: string;
  startDate?: string;
  endDate?: string;
  location: string;
  description: string;
  daysConfig: FestDay[];
}
