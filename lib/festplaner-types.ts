export type ReservationStatus = "Ausstehend" | "Bestätigt" | "Storniert";
export type FinancialType = "expense" | "revenue";
export type FinancialStatus = "Bezahlt" | "Offen" | "Erhalten";
export type InvitationStatus = "Nicht versendet" | "Versendet" | "Zusage" | "Absage" | "Vielleicht" | "Keine Rückmeldung";

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
  categoryId?: string;
}

export interface ChecklistCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Protocol {
  id: string;
  title: string;
  date: string;
  attendees: string;
  topics: string;
  decisions: string;
  attachmentName?: string;
  attachmentData?: string;
}

export interface InvitationContact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  clubName: string;
  address: string;
  status?: InvitationStatus;
  sentAt?: string;
  respondedAt?: string;
  guestCount?: number;
  responseNote?: string;
}

export interface ClubContact {
  id: string;
  functionTitle: string;
  lastName: string;
  firstName: string;
  phone: string;
  email: string;
}

export type InventoryMovementType = "count" | "receipt" | "consumption";

export interface InventoryItem {
  id: string;
  festivalId: string;
  name: string;
  category: string;
  unit: string;
  minimumStock: number;
  notes: string;
  isActive: boolean;
}

export interface InventoryMovement {
  id: string;
  festivalId: string;
  itemId: string;
  dayDate?: string;
  dayLabel: string;
  type: InventoryMovementType;
  quantity: number;
  note?: string;
  createdBy?: string;
  createdAt: string;
}

export interface Shift {
  id: string;
  day: string;
  time: string;
  startTime?: string;
  endTime?: string;
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
  clubReservationAnswers?: ReservationFieldAnswer[];
  guests: number;
  date: string;
  time: string;
  status: ReservationStatus;
}

export type ReservationFieldType = "text" | "number" | "boolean";

export interface FestivalReservationField {
  id: string;
  label: string;
  fieldType: ReservationFieldType;
  helpText?: string;
  required: boolean;
  sortOrder: number;
}

export interface ReservationFieldAnswer {
  fieldId: string;
  label: string;
  fieldType: ReservationFieldType;
  value: string | number | boolean;
}

export interface FinancialItem {
  id: string;
  positionNumber?: number;
  type: FinancialType;
  bookingDate: string;
  category: string;
  description: string;
  amount: number;
  status: FinancialStatus;
  accountSplits?: FinanceAccountSplit[];
  attachmentName?: string;
  attachmentData?: string;
}

export interface FinanceAccount {
  id: string;
  name: string;
  bankName?: string;
  iban?: string;
  description?: string;
  isActive: boolean;
}

export interface FinanceAccountSplit {
  accountId: string;
  amount: number;
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
