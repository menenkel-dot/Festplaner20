'use client';

import * as React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { 
  Calendar, Clock, MapPin, Users, Plus, Trash2, CheckSquare, 
  Square, FileText, ClipboardList, Euro, Check, X, Share2, 
  ExternalLink, Menu, TrendingDown, TrendingUp, HelpCircle,
  Copy, Armchair, ChevronRight, AlertCircle, Sparkles, Paperclip, FileDown,
  Lock, LogIn, BarChart3, UserCog, ShieldCheck
} from "lucide-react";
import { jsPDF } from "jspdf";
import type { User } from "@supabase/supabase-js";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  type FestPlanerSnapshot,
  loadLatestFestivalFromSupabase,
  saveActiveFestivalToSupabase,
  saveFinancialItemsToSupabase,
} from "@/lib/festplaner-supabase";

// --- Types & Interfaces ---
interface ProgramItem {
  id: string;
  time: string;
  title: string;
  location: string;
  description: string;
  reservationUsesTentPlan?: boolean;
  reservationTableLimit?: number;
}

interface ChecklistItem {
  id: string;
  dueDate?: string;
  task: string;
  completed: boolean;
  assignedTo?: string;
}

interface Protocol {
  id: string;
  title: string;
  date: string;
  attendees: string;
  topics: string;
  decisions: string;
  attachmentName?: string;
  attachmentData?: string;
}

interface Shift {
  id: string;
  day: string;
  time: string;
  role: string;
  needed: number;
  helpers: string[];
  notes?: string;
}

interface Reservation {
  id: string;
  tableId: number;
  tableIds?: number[];
  tableCount?: number;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  guestType?: 'private' | 'club';
  clubName?: string;
  clubReservationNotes?: string;
  guests: number;
  date: string;
  time: string;
  status: 'Ausstehend' | 'Bestätigt' | 'Storniert';
}

interface FinancialItem {
  id: string;
  type: 'expense' | 'revenue';
  category: string;
  description: string;
  amount: number;
  status: 'Bezahlt' | 'Offen' | 'Erhalten';
  attachmentName?: string;
  attachmentData?: string;
}

interface FestDay {
  id: string;
  name: string;
  reservationsEnabled: boolean;
  tableCount: number;
  gridCols: number;
  reservationTimes?: string[];
}

interface FestInfo {
  name: string;
  date: string;
  startDate?: string;
  endDate?: string;
  location: string;
  description: string;
  daysConfig: FestDay[];
}

// --- Empty Default Data ---
const DEFAULT_FEST_INFO: FestInfo = {
  name: "",
  date: "",
  startDate: "",
  endDate: "",
  location: "",
  description: "",
  daysConfig: [
    { id: "d1", name: "Festtag 1", reservationsEnabled: true, tableCount: 16, gridCols: 4 },
    { id: "d2", name: "Festtag 2", reservationsEnabled: true, tableCount: 16, gridCols: 4 },
    { id: "d3", name: "Festtag 3", reservationsEnabled: true, tableCount: 16, gridCols: 4 },
  ]
};

const DEFAULT_RESERVATION_TIMES = ["17:00 Uhr", "18:00 Uhr", "19:00 Uhr", "20:00 Uhr"];
const ADMIN_PERMISSIONS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "info", label: "Fest-Programm" },
  { id: "meetings", label: "Sitzungsberichte" },
  { id: "shifts", label: "Helfer & Schichtplan" },
  { id: "reservations", label: "Reservierungen" },
  { id: "costs", label: "Finanzen & Kosten" },
  { id: "users", label: "Benutzer & Rollen" },
];

const DASHBOARD_WIDGET_PERMISSIONS = [
  { id: "dashboard:reserved_tables", label: "Reservierte Tische" },
  { id: "dashboard:pending_reservations", label: "Offene Anfragen" },
  { id: "dashboard:open_shift_spots", label: "Offene Schichtplätze" },
  { id: "dashboard:checklist_progress", label: "Checkliste" },
  { id: "dashboard:reservations_by_day", label: "Reservierungen nach Tag" },
  { id: "dashboard:open_shifts_by_day", label: "Offene Schichtplätze nach Tag" },
  { id: "dashboard:next_tasks", label: "Nächste Aufgaben" },
];

const DASHBOARD_WIDGET_PERMISSION_IDS = DASHBOARD_WIDGET_PERMISSIONS.map((permission) => permission.id);

interface AppRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

interface AppUserProfile {
  user_id: string;
  email: string;
  full_name: string;
  role_id: string | null;
}

const normalizeMojibakeText = (value: string) => {
  const cc = (...codes: number[]) => String.fromCharCode(...codes);
  const replacements: Array<[string, string]> = [
    [cc(0x00c3, 0x00a4), "ä"],
    [cc(0x00c3, 0x00b6), "ö"],
    [cc(0x00c3, 0x00bc), "ü"],
    [cc(0x00c3, 0x0084), "Ä"],
    [cc(0x00c3, 0x0096), "Ö"],
    [cc(0x00c3, 0x009c), "Ü"],
    [cc(0x00c3, 0x009f), "ß"],
    [cc(0x00c3, 0x0178), "ß"],
    [cc(0x00c3, 0x0153), "Ü"],
    [cc(0x00c3, 0x201e), "Ä"],
    [cc(0x00e2, 0x201a, 0x00ac), "€"],
    [cc(0x00e2, 0x20ac, 0x00a2), "·"],
    [cc(0x00e2, 0x2013, 0x00b2), "▲"],
    [cc(0x00e2, 0x0153, 0x201c), "✓"],
  ];

  return replacements.reduce((text, [from, to]) => text.split(from).join(to), value);
};

const normalizeStoredData = <T,>(value: T): T => {
  if (typeof value === "string") return normalizeMojibakeText(value) as T;
  if (Array.isArray(value)) return value.map((item) => normalizeStoredData(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeStoredData(item)]),
    ) as T;
  }
  return value;
};

const LOCAL_STORAGE_DATA_KEYS = [
  "vfp_fest_info",
  "vfp_program_items",
  "vfp_checklist_items",
  "vfp_protocols",
  "vfp_shifts",
  "vfp_reservations",
  "vfp_finances",
  "vfp_budget",
  "vfp_active_festival_id",
];

const LEGACY_AI_STUDIO_MOCK_MARKERS = [
  "125 Jahre Freiwillige Feuerwehr Altdorf",
  "Stammstammtisch Altdorf",
  "Altdorfer Urbräu",
  "Gipfelstürmer",
  "Christian (Vorstand)",
  "stammtisch.altdorf@gmx.de",
];

const removeLegacyAiStudioMockData = () => {
  const hasLegacyMockData = LOCAL_STORAGE_DATA_KEYS.some((key) => {
    const value = localStorage.getItem(key);
    return value ? LEGACY_AI_STUDIO_MOCK_MARKERS.some((marker) => value.includes(marker)) : false;
  });

  if (!hasLegacyMockData) return;
  LOCAL_STORAGE_DATA_KEYS.forEach((key) => localStorage.removeItem(key));
  localStorage.setItem("vfp_ai_studio_mock_data_removed", "true");
};

const parseLocalDate = (value?: string) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatFestDayLabel = (value: string) => {
  const date = parseLocalDate(value);
  if (!date) return value;
  const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(date).replace(".", "");
  const day = new Intl.DateTimeFormat("de-DE", { day: "numeric" }).format(date);
  const month = new Intl.DateTimeFormat("de-DE", { month: "long" }).format(date);
  return `${weekday}, ${day}. ${month}`;
};

const formatDateLong = (value: string) => {
  const date = parseLocalDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric" }).format(date);
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const parseTimeLabel = (value: string) => {
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return { hours, minutes };
};

const formatDateTimeShort = (value: Date) => {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
};

const formatFestDateRange = (startDate?: string, endDate?: string) => {
  if (!startDate && !endDate) return "";
  if (startDate && !endDate) return formatDateLong(startDate);
  if (!startDate && endDate) return formatDateLong(endDate);
  if (startDate && endDate && startDate === endDate) return formatDateLong(startDate);

  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (!start || !end) return [startDate, endDate].filter(Boolean).join(" - ");

  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    const startDay = new Intl.DateTimeFormat("de-DE", { day: "numeric" }).format(start);
    const endLabel = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric" }).format(end);
    return `${startDay}. - ${endLabel}`;
  }

  return startDate && endDate ? `${formatDateLong(startDate)} - ${formatDateLong(endDate)}` : "";
};

const buildFestDaysFromRange = (startDate?: string, endDate?: string, existingDays: FestDay[] = []) => {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate || startDate);
  if (!start || !end || end < start) return existingDays.length ? existingDays : DEFAULT_FEST_INFO.daysConfig;

  const days: FestDay[] = [];
  const cursor = new Date(start);
  let index = 0;

  while (cursor <= end && days.length < 14) {
    const iso = toIsoDate(cursor);
    const previous = existingDays[index] || existingDays.find((day) => day.id === `d_${iso}`);
    days.push({
      id: `d_${iso}`,
      name: formatFestDayLabel(iso),
      reservationsEnabled: previous?.reservationsEnabled ?? true,
      tableCount: previous?.tableCount ?? 16,
      gridCols: previous?.gridCols ?? 4,
      reservationTimes: previous?.reservationTimes?.length ? previous.reservationTimes : DEFAULT_RESERVATION_TIMES,
    });
    cursor.setDate(cursor.getDate() + 1);
    index += 1;
  }

  return days;
};

const hasMeaningfulPlanData = (snapshot: FestPlanerSnapshot) => {
  return Boolean(
    snapshot.festInfo.name.trim() ||
    snapshot.festInfo.location.trim() ||
    snapshot.festInfo.description.trim() ||
    snapshot.program.length ||
    snapshot.checklist.length ||
    snapshot.protocols.length ||
    snapshot.shifts.length ||
    snapshot.reservations.length ||
    snapshot.finances.length ||
    snapshot.budget > 0,
  );
};

const DEFAULT_PROGRAM: ProgramItem[] = [];
const DEFAULT_CHECKLIST: ChecklistItem[] = [];
const DEFAULT_PROTOCOLS: Protocol[] = [];
const DEFAULT_SHIFTS: Shift[] = [];
const DEFAULT_RESERVATIONS: Reservation[] = [];
const DEFAULT_FINANCES: FinancialItem[] = [];

export default function Page() {
  // --- Global App States with Client-Side Hydration ---
  type AdminTab = "dashboard" | "info" | "meetings" | "shifts" | "reservations" | "costs" | "users";
  const [activeTab, setActiveTab] = React.useState<AdminTab>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [isMounted, setIsMounted] = React.useState(false);

  // --- Core Application Data ---
  const [festInfo, setFestInfo] = React.useState(DEFAULT_FEST_INFO);
  const [program, setProgram] = React.useState<ProgramItem[]>(DEFAULT_PROGRAM);
  const [checklist, setChecklist] = React.useState<ChecklistItem[]>(DEFAULT_CHECKLIST);
  const [protocols, setProtocols] = React.useState<Protocol[]>(DEFAULT_PROTOCOLS);
  const [shifts, setShifts] = React.useState<Shift[]>(DEFAULT_SHIFTS);
  const [reservations, setReservations] = React.useState<Reservation[]>(DEFAULT_RESERVATIONS);
  const [finances, setFinances] = React.useState<FinancialItem[]>(DEFAULT_FINANCES);
  const [budget, setBudget] = React.useState<number>(0);

  // --- Public Mode State ---
  // "admin" | "helfer" (Members/Helpers) | "reservierung" (Guests)
  const [appMode, setAppMode] = React.useState<"admin" | "helfer" | "reservierung">("admin");
  const [notification, setNotification] = React.useState<{message: string; type: "success" | "info" | "error"} | null>(null);

  // --- Dynamic Forms State ---
  const [showProgForm, setShowProgForm] = React.useState(false);
  const [showCheckForm, setShowCheckForm] = React.useState(false);
  const [showProtoForm, setShowProtoForm] = React.useState(false);
  const [showShiftForm, setShowShiftForm] = React.useState(false);
  const [showResForm, setShowResForm] = React.useState(false);
  const [showFinForm, setShowFinForm] = React.useState(false);

  // Fest Info Edit Modal/State
  const [isEditingFest, setIsEditingFest] = React.useState(false);
  const [editedFest, setEditedFest] = React.useState(DEFAULT_FEST_INFO);

  // Program Form
  const [newProgDay, setNewProgDay] = React.useState(DEFAULT_FEST_INFO.daysConfig[0]?.name ?? "");
  const [newProgClock, setNewProgClock] = React.useState("");
  const [newProgTitle, setNewProgTitle] = React.useState("");
  const [newProgLoc, setNewProgLoc] = React.useState("");
  const [newProgDesc, setNewProgDesc] = React.useState("");

  // Checklist Form
  const [newCheckTask, setNewCheckTask] = React.useState("");
  const [newCheckDueDate, setNewCheckDueDate] = React.useState("");
  const [newCheckUser, setNewCheckUser] = React.useState("");

  // Protocol Form
  const [newProtoTitle, setNewProtoTitle] = React.useState("");
  const [newProtoDate, setNewProtoDate] = React.useState("");
  const [newProtoAttendees, setNewProtoAttendees] = React.useState("");
  const [newProtoTopics, setNewProtoTopics] = React.useState("");
  const [newProtoDecisions, setNewProtoDecisions] = React.useState("");
  const [newProtoAttachmentName, setNewProtoAttachmentName] = React.useState("");
  const [newProtoAttachmentData, setNewProtoAttachmentData] = React.useState("");

  // Shift Form
  const [newShiftDay, setNewShiftDay] = React.useState(DEFAULT_FEST_INFO.daysConfig[0]?.name ?? "");
  const [newShiftTime, setNewShiftTime] = React.useState("");
  const [newShiftRole, setNewShiftRole] = React.useState("");
  const [newShiftNeeded, setNewShiftNeeded] = React.useState(3);
  const [newShiftNotes, setNewShiftNotes] = React.useState("");
  const [shiftDayFilter, setShiftDayFilter] = React.useState("Alle");

  // Reservierung Admin Form
  const [newResTableId, setNewResTableId] = React.useState(1);
  const [adminResDayId, setAdminResDayId] = React.useState("d1");
  const [adminResTime, setAdminResTime] = React.useState("");
  const [newResName, setNewResName] = React.useState("");
  const [newResFirstName, setNewResFirstName] = React.useState("");
  const [newResLastName, setNewResLastName] = React.useState("");
  const [newResEmail, setNewResEmail] = React.useState("");
  const [newResPhone, setNewResPhone] = React.useState("");
  const [newResGuestType, setNewResGuestType] = React.useState<'private' | 'club'>('private');
  const [newResClubName, setNewResClubName] = React.useState("");
  const [newResTableCount, setNewResTableCount] = React.useState(1);
  const [newResDate, setNewResDate] = React.useState(DEFAULT_FEST_INFO.daysConfig[0]?.name ?? "");
  const [newResTime, setNewResTime] = React.useState("");

  // Finances Form
  const [newFinType, setNewFinType] = React.useState<'expense' | 'revenue'>('expense');
  const [newFinCat, setNewFinCat] = React.useState("");
  const [newFinDesc, setNewFinDesc] = React.useState("");
  const [newFinAmount, setNewFinAmount] = React.useState("");
  const [newFinStatus, setNewFinStatus] = React.useState<'Bezahlt' | 'Offen' | 'Erhalten'>('Offen');
  const [newFinAttachmentName, setNewFinAttachmentName] = React.useState("");
  const [newFinAttachmentData, setNewFinAttachmentData] = React.useState("");
  const [dragActive, setDragActive] = React.useState(false);
  const [financePaymentConfirmId, setFinancePaymentConfirmId] = React.useState<string | null>(null);

  // --- Public Helper Sign-Up Forms State ---
  const [publicSelectedShiftId, setPublicSelectedShiftId] = React.useState<string | null>(null);
  const [publicHelperName, setPublicHelperName] = React.useState("");
  const [publicPortalLoading, setPublicPortalLoading] = React.useState(false);

  // --- Public Guest Reservation Form State ---
  const [publicResSelectedTables, setPublicResSelectedTables] = React.useState<number[]>([]);
  const [publicResFirstName, setPublicResFirstName] = React.useState("");
  const [publicResLastName, setPublicResLastName] = React.useState("");
  const [publicResEmail, setPublicResEmail] = React.useState("");
  const [publicResPhone, setPublicResPhone] = React.useState("");
  const [publicResGuestType, setPublicResGuestType] = React.useState<'private' | 'club'>('private');
  const [publicResClubName, setPublicResClubName] = React.useState("");
  const [publicResClubNotes, setPublicResClubNotes] = React.useState("");
  const [publicResDate, setPublicResDate] = React.useState(DEFAULT_FEST_INFO.daysConfig[0]?.name ?? "");
  const [publicResTime, setPublicResTime] = React.useState("");
  const [publicResTableCount, setPublicResTableCount] = React.useState<number | "">(1);
  const [publicPrivacyAccepted, setPublicPrivacyAccepted] = React.useState(false);

  // --- Supabase Auth State ---
  const supabase = React.useMemo(() => {
    try {
      return isSupabaseConfigured() ? createClient() : null;
    } catch (error) {
      console.error("Supabase client setup failed", error);
      return null;
    }
  }, []);
  const [supabaseUser, setSupabaseUser] = React.useState<User | null>(null);
  const [authEmail, setAuthEmail] = React.useState("");
  const [authPassword, setAuthPassword] = React.useState("");
  const [authLoading, setAuthLoading] = React.useState(false);
  const [authMessage, setAuthMessage] = React.useState("");
  const [syncMessage, setSyncMessage] = React.useState("");
  const [activeFestivalId, setActiveFestivalId] = React.useState<string | null>(null);
  const [authReady, setAuthReady] = React.useState(() => !isSupabaseConfigured());
  const [appRoles, setAppRoles] = React.useState<AppRole[]>([]);
  const [appUsers, setAppUsers] = React.useState<AppUserProfile[]>([]);
  const [currentPermissions, setCurrentPermissions] = React.useState<string[]>(ADMIN_PERMISSIONS.map((permission) => permission.id));
  const [newRoleName, setNewRoleName] = React.useState("");
  const [newRoleDescription, setNewRoleDescription] = React.useState("");
  const [newRolePermissions, setNewRolePermissions] = React.useState<string[]>(["dashboard", ...DASHBOARD_WIDGET_PERMISSION_IDS]);
  const [editingRoleId, setEditingRoleId] = React.useState<string | null>(null);
  const [editingRoleName, setEditingRoleName] = React.useState("");
  const [editingRoleDescription, setEditingRoleDescription] = React.useState("");
  const [editingRolePermissions, setEditingRolePermissions] = React.useState<string[]>([]);
  const [newUserEmail, setNewUserEmail] = React.useState("");
  const [newUserPassword, setNewUserPassword] = React.useState("");
  const [newUserFullName, setNewUserFullName] = React.useState("");
  const [newUserRoleId, setNewUserRoleId] = React.useState("");
  const [userAdminLoading, setUserAdminLoading] = React.useState(false);
  const remoteSyncReadyRef = React.useRef(false);
  const applyingRemoteSnapshotRef = React.useRef(false);
  const syncTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedPayloadRef = React.useRef("");
  const currentSnapshotRef = React.useRef<FestPlanerSnapshot | null>(null);

  // --- Toast/Notification helper ---
  const showToast = (message: string, type: "success" | "info" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // --- Load and Save State ---
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setIsMounted(true);
      
      // Check URL path and legacy query parameters
      const params = new URLSearchParams(window.location.search);
      const modeParam = params.get("mode");
      const path = window.location.pathname.replace(/\/$/, "");
      if (path === "/helfer" || modeParam === "helfer") {
        setAppMode("helfer");
      } else if (path === "/reservierung" || modeParam === "reservierung") {
        setAppMode("reservierung");
      } else {
        setAppMode("admin");
      }

      // Load from LocalStorage
      removeLegacyAiStudioMockData();
      const storedFest = localStorage.getItem("vfp_fest_info");
      const storedProg = localStorage.getItem("vfp_program_items");
      const storedCheck = localStorage.getItem("vfp_checklist_items");
      const storedProtocols = localStorage.getItem("vfp_protocols");
      const storedShifts = localStorage.getItem("vfp_shifts");
      const storedReservations = localStorage.getItem("vfp_reservations");
      const storedFinances = localStorage.getItem("vfp_finances");
      const storedBudget = localStorage.getItem("vfp_budget");

      if (storedFest) {
        try {
          const parsed = normalizeStoredData(JSON.parse(storedFest));
          if (!parsed.daysConfig) {
            parsed.daysConfig = DEFAULT_FEST_INFO.daysConfig;
          }
          parsed.daysConfig = parsed.daysConfig.map((day: FestDay) => ({
            ...day,
            reservationTimes: day.reservationTimes?.length ? day.reservationTimes : DEFAULT_RESERVATION_TIMES,
          }));
          setFestInfo(parsed);
          setEditedFest(parsed);
          const firstConfiguredDay = parsed.daysConfig?.[0];
          if (firstConfiguredDay) {
            setNewShiftDay(firstConfiguredDay.name);
            setNewProgDay(firstConfiguredDay.name);
            setNewResDate(firstConfiguredDay.name);
            setPublicResDate(firstConfiguredDay.name);
            setAdminResDayId(firstConfiguredDay.id);
          }
        } catch(e) {
          console.error(e);
        }
      }
      if (storedProg) setProgram(normalizeStoredData(JSON.parse(storedProg)));
      if (storedCheck) setChecklist(normalizeStoredData(JSON.parse(storedCheck)));
      if (storedProtocols) setProtocols(normalizeStoredData(JSON.parse(storedProtocols)));
      if (storedShifts) setShifts(normalizeStoredData(JSON.parse(storedShifts)));
      if (storedReservations) setReservations(normalizeStoredData(JSON.parse(storedReservations)));
      if (storedFinances) setFinances(normalizeStoredData(JSON.parse(storedFinances)));
      if (storedBudget && !Number.isNaN(Number(storedBudget))) setBudget(Number(storedBudget));
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    if (!supabase) return;

    let active = true;

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active) {
          setSupabaseUser(data.user);
          setAuthReady(true);
        }
      })
      .catch((error) => {
        if (!active) return;
        console.error("Supabase session lookup failed", error);
        setAuthMessage("Supabase-Session konnte nicht geladen werden. Login ist weiterhin möglich.");
        setAuthReady(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupabaseUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const saveToStorage = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  const getCurrentSnapshot = React.useCallback((): FestPlanerSnapshot => ({
    festInfo,
    program,
    checklist,
    protocols,
    shifts,
    reservations,
    finances,
    budget,
  }), [budget, checklist, festInfo, finances, program, protocols, reservations, shifts]);

  React.useEffect(() => {
    currentSnapshotRef.current = getCurrentSnapshot();
  }, [getCurrentSnapshot]);

  const applyRemoteSnapshot = React.useCallback((snapshot: FestPlanerSnapshot) => {
    applyingRemoteSnapshotRef.current = true;
    setFestInfo(snapshot.festInfo);
    setEditedFest(snapshot.festInfo);
    const firstConfiguredDay = snapshot.festInfo.daysConfig?.[0];
    if (firstConfiguredDay) {
      const firstProgram = snapshot.program.find((item) => item.time.startsWith(`${firstConfiguredDay.name} - `));
      const firstTime = firstProgram ? firstProgram.time.split(" - ")[1] || firstProgram.time : "";
      setNewShiftDay(firstConfiguredDay.name);
      setNewProgDay(firstConfiguredDay.name);
      setNewResDate(firstConfiguredDay.name);
      setNewResTime(firstTime);
      setPublicResDate(firstConfiguredDay.name);
      setPublicResTime(firstTime);
      setAdminResDayId(firstConfiguredDay.id);
      setPublicResSelectedTables([]);
    }
    setProgram(snapshot.program);
    setChecklist(snapshot.checklist);
    setProtocols(snapshot.protocols);
    setShifts(snapshot.shifts);
    setReservations(snapshot.reservations);
    setFinances(snapshot.finances);
    setBudget(snapshot.budget);

    saveToStorage("vfp_fest_info", snapshot.festInfo);
    saveToStorage("vfp_program_items", snapshot.program);
    saveToStorage("vfp_checklist_items", snapshot.checklist);
    saveToStorage("vfp_protocols", snapshot.protocols);
    saveToStorage("vfp_shifts", snapshot.shifts);
    saveToStorage("vfp_reservations", snapshot.reservations);
    saveToStorage("vfp_finances", snapshot.finances);
    saveToStorage("vfp_budget", snapshot.budget);
    lastSyncedPayloadRef.current = JSON.stringify(snapshot);
    window.setTimeout(() => {
      applyingRemoteSnapshotRef.current = false;
    }, 0);
  }, []);

  React.useEffect(() => {
    if (!supabase || !supabaseUser || !isMounted) {
      remoteSyncReadyRef.current = false;
      return;
    }

    let active = true;
    remoteSyncReadyRef.current = false;
    const messageTimer = setTimeout(() => {
      if (active) setSyncMessage("Lade Planungsdaten...");
    }, 0);

    loadLatestFestivalFromSupabase(supabase, supabaseUser)
      .then(async (remote) => {
        if (!active) return;

        if (remote) {
          const localSnapshot = currentSnapshotRef.current;
          if (localSnapshot && hasMeaningfulPlanData(localSnapshot) && !hasMeaningfulPlanData(remote.snapshot)) {
            const festivalId = await saveActiveFestivalToSupabase(supabase, supabaseUser, localSnapshot, remote.festivalId);
            if (!active) return;
            setActiveFestivalId(festivalId);
            localStorage.setItem("vfp_active_festival_id", festivalId);
            lastSyncedPayloadRef.current = JSON.stringify(localSnapshot);
            setSyncMessage("Lokaler Plan nach Supabase übertragen");
            return;
          }

          applyRemoteSnapshot(remote.snapshot);
          setActiveFestivalId(remote.festivalId);
          localStorage.setItem("vfp_active_festival_id", remote.festivalId);
          setSyncMessage("Datenbank online");
          return;
        }

        const snapshot = currentSnapshotRef.current;
        if (!snapshot) return;
        const festivalId = await saveActiveFestivalToSupabase(supabase, supabaseUser, snapshot);
        if (!active) return;
        setActiveFestivalId(festivalId);
        localStorage.setItem("vfp_active_festival_id", festivalId);
        lastSyncedPayloadRef.current = JSON.stringify(snapshot);
        setSyncMessage("Plan in Supabase angelegt");
      })
      .catch((error) => {
        if (!active) return;
        console.error("Supabase plan load failed", error);
        setSyncMessage("Supabase-Sync fehlgeschlagen");
      })
      .finally(() => {
        if (active) remoteSyncReadyRef.current = true;
      });

    return () => {
      active = false;
      clearTimeout(messageTimer);
    };
  }, [applyRemoteSnapshot, isMounted, supabase, supabaseUser]);

  React.useEffect(() => {
    if (!supabase || !supabaseUser || !remoteSyncReadyRef.current || applyingRemoteSnapshotRef.current) return;

    const snapshot = getCurrentSnapshot();
    const payload = JSON.stringify(snapshot);
    if (payload === lastSyncedPayloadRef.current) return;

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    setSyncMessage("Speichere...");

    syncTimerRef.current = setTimeout(() => {
      const savePromise =
        !currentPermissions.includes("users") && currentPermissions.includes("costs") && activeFestivalId
          ? saveFinancialItemsToSupabase(supabase, activeFestivalId, {
              finances: snapshot.finances,
              budget: snapshot.budget,
            }).then(() => activeFestivalId)
          : saveActiveFestivalToSupabase(supabase, supabaseUser, snapshot, activeFestivalId);

      savePromise
        .then((festivalId) => {
          setActiveFestivalId(festivalId);
          localStorage.setItem("vfp_active_festival_id", festivalId);
          lastSyncedPayloadRef.current = payload;
          setSyncMessage("Gespeichert");
        })
        .catch((error) => {
          console.error("Supabase autosave failed", error);
          setSyncMessage("Speichern fehlgeschlagen");
        });
    }, 900);

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [activeFestivalId, currentPermissions, getCurrentSnapshot, supabase, supabaseUser]);

  const hasPermission = (permission: string) => {
    return currentPermissions.includes(permission);
  };

  const hasDashboardWidgetPermission = (permission: string) => {
    if (!hasPermission("dashboard")) return false;
    const explicitWidgetPermissions = currentPermissions.filter((item) => item.startsWith("dashboard:"));
    if (explicitWidgetPermissions.length === 0) return true;
    return currentPermissions.includes(permission);
  };

  const toggleRolePermission = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    permissionId: string,
    checked: boolean,
  ) => {
    setter((current) => {
      if (checked) {
        const next = Array.from(new Set([...current, permissionId]));
        if (permissionId === "dashboard") {
          return Array.from(new Set([...next, ...DASHBOARD_WIDGET_PERMISSION_IDS]));
        }
        return next;
      }

      const next = current.filter((item) => item !== permissionId);
      if (permissionId === "dashboard") {
        return next.filter((item) => !item.startsWith("dashboard:"));
      }
      return next;
    });
  };

  const openTab = (tab: AdminTab) => {
    if (!hasPermission(tab)) {
      showToast("Für diesen Bereich fehlen die Berechtigungen.", "error");
      return;
    }
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const loadUserAdminData = React.useCallback(async () => {
    if (!supabase || !supabaseUser) return;

    const [rolesResult, usersResult, currentProfileResult] = await Promise.all([
      supabase.from("app_roles").select("id,name,description,permissions").order("name"),
      supabase.from("app_user_profiles").select("user_id,email,full_name,role_id").order("created_at", { ascending: false }),
      supabase
        .from("app_user_profiles")
        .select("role:app_roles(permissions)")
        .eq("user_id", supabaseUser.id)
        .maybeSingle(),
    ]);

    if (rolesResult.error) throw rolesResult.error;
    if (usersResult.error) throw usersResult.error;

    const roles = (rolesResult.data ?? []).map((role) => ({
      id: String(role.id),
      name: String(role.name),
      description: String(role.description ?? ""),
      permissions: Array.isArray(role.permissions) ? role.permissions.map(String) : [],
    }));
    setAppRoles(roles);
    setAppUsers((usersResult.data ?? []).map((user) => ({
      user_id: String(user.user_id),
      email: String(user.email),
      full_name: String(user.full_name ?? ""),
      role_id: user.role_id ? String(user.role_id) : null,
    })));
    setNewUserRoleId((current) => current || roles[0]?.id || "");

    const profilePermissions = (currentProfileResult.data as any)?.role?.permissions;
    setCurrentPermissions(Array.isArray(profilePermissions) && profilePermissions.length
      ? profilePermissions.map(String)
      : ADMIN_PERMISSIONS.map((permission) => permission.id));
  }, [supabase, supabaseUser]);

  React.useEffect(() => {
    if (!supabaseUser) return;
    const timer = setTimeout(() => {
      loadUserAdminData().catch((error) => {
        console.error("User admin data failed", error);
        setCurrentPermissions(ADMIN_PERMISSIONS.map((permission) => permission.id));
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [loadUserAdminData, supabaseUser]);

  React.useEffect(() => {
    if (currentPermissions.includes(activeTab)) return;
    const timer = setTimeout(() => {
      setActiveTab((currentPermissions[0] as AdminTab) || "dashboard");
    }, 0);
    return () => clearTimeout(timer);
  }, [activeTab, currentPermissions]);

  React.useEffect(() => {
    if (!supabase || !isMounted || (appMode !== "helfer" && appMode !== "reservierung")) return;

    let active = true;
    const loadingTimer = setTimeout(() => {
      if (active) setPublicPortalLoading(true);
    }, 0);

    supabase.functions.invoke("public-festival")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        if (!data?.festInfo) return;

        setFestInfo(data.festInfo);
        setProgram(Array.isArray(data.program) ? data.program : []);
        setShifts(Array.isArray(data.shifts) ? data.shifts : []);
        setReservations(Array.isArray(data.reservations) ? data.reservations : []);

        const firstConfiguredDay = data.festInfo.daysConfig?.[0];
        if (firstConfiguredDay) {
          const loadedProgram = Array.isArray(data.program) ? data.program : [];
          const firstProgram = loadedProgram.find((item: ProgramItem) => item.time.startsWith(`${firstConfiguredDay.name} - `));
          const firstTime = firstProgram ? firstProgram.time.split(" - ")[1] || firstProgram.time : "";
          setPublicResDate(firstConfiguredDay.name);
          setPublicResTime(firstTime);
          setPublicResSelectedTables([]);
          setPublicResTableCount(1);
        }
      })
      .catch((error) => {
        console.error("Public festival load failed", error);
        showToast("Öffentliche Daten konnten nicht geladen werden.", "error");
      })
      .finally(() => {
        if (active) setPublicPortalLoading(false);
      });

    return () => {
      active = false;
      clearTimeout(loadingTimer);
    };
  }, [appMode, isMounted, supabase]);

  const getDayConfigByName = (dayName: string) => {
    return (festInfo.daysConfig || []).find((day) => day.name === dayName);
  };

  const getReservationTableIds = (reservation: Reservation) => {
    return reservation.tableIds?.length ? reservation.tableIds : [reservation.tableId];
  };

  const getReservationDisplayName = (reservation: Reservation) => {
    if (reservation.guestType === "club" && reservation.clubName) return reservation.clubName;
    const personName = [reservation.firstName, reservation.lastName].filter(Boolean).join(" ").trim();
    return personName || reservation.name;
  };

  const getProgramForDay = (dayName: string) => {
    return program.filter((item) => item.time.startsWith(`${dayName} - `));
  };

  const getProgramTimeLabel = (item: ProgramItem) => {
    return item.time.split(" - ")[1] || item.time;
  };

  const getReservationOptionsForDay = (dayName: string) => {
    const dayProgram = getProgramForDay(dayName);
    return dayProgram.map((item) => getProgramTimeLabel(item));
  };

  const getReservationProgram = (dayName: string, timeLabel: string) => {
    return getProgramForDay(dayName).find((item) => getProgramTimeLabel(item) === timeLabel);
  };

  const getFestDayDate = (dayName: string) => {
    const startDate = parseLocalDate(festInfo.startDate);
    if (!startDate) return null;
    const dayIndex = (festInfo.daysConfig || []).findIndex((day) => day.name === dayName);
    if (dayIndex < 0) return null;
    return addDays(startDate, dayIndex);
  };

  const getReservationCutoffDate = (dayName: string, timeLabel: string) => {
    const dayDate = getFestDayDate(dayName);
    const time = parseTimeLabel(timeLabel);
    if (!dayDate || !time) return null;
    const startsAt = new Date(dayDate);
    startsAt.setHours(time.hours, time.minutes, 0, 0);
    return new Date(startsAt.getTime() - 2 * 60 * 60 * 1000);
  };

  const isReservationSlotOpen = (dayName: string, timeLabel: string) => {
    const cutoff = getReservationCutoffDate(dayName, timeLabel);
    return cutoff ? new Date() <= cutoff : false;
  };

  const getReservationCutoffText = (dayName: string, timeLabel: string) => {
    const cutoff = getReservationCutoffDate(dayName, timeLabel);
    if (!cutoff) return "Für diesen Programmpunkt ist keine Reservierungsfrist hinterlegt.";
    return `Reservierungen sind bis spätestens ${formatDateTimeShort(cutoff)} Uhr möglich.`;
  };

  const getReservationUsesTentPlan = (dayName: string, timeLabel: string) => {
    return getReservationProgram(dayName, timeLabel)?.reservationUsesTentPlan !== false;
  };

  const getReservationTableLimit = (dayName: string, timeLabel: string) => {
    const day = getDayConfigByName(dayName);
    const programItem = getReservationProgram(dayName, timeLabel);
    return Math.max(1, programItem?.reservationTableLimit ?? day?.tableCount ?? 16);
  };

  const getReservedTableCountForSlot = (dayName: string, timeLabel: string) => {
    return reservations
      .filter((reservation) => reservation.date === dayName && reservation.time === timeLabel && reservation.status !== "Storniert")
      .reduce((sum, reservation) => sum + Math.max(1, reservation.tableCount ?? getReservationTableIds(reservation).length), 0);
  };

  const findAvailableTables = (dayName: string, timeLabel: string, requestedCount: number, tableLimit?: number) => {
    const maxTables = tableLimit ?? getReservationTableLimit(dayName, timeLabel);
    const blocked = new Set(
      reservations
        .filter((reservation) => reservation.date === dayName && reservation.time === timeLabel && reservation.status !== "Storniert")
        .flatMap(getReservationTableIds),
    );
    const available: number[] = [];

    for (let tableId = 1; tableId <= maxTables && available.length < requestedCount; tableId += 1) {
      if (!blocked.has(tableId)) available.push(tableId);
    }

    return available;
  };

  const updateFestDay = (dayId: string, patch: Partial<FestDay>) => {
    const updated = {
      ...festInfo,
      daysConfig: (festInfo.daysConfig || []).map((day) =>
        day.id === dayId ? { ...day, ...patch } : day,
      ),
    };
    setFestInfo(updated);
    setEditedFest(updated);
    saveToStorage("vfp_fest_info", updated);
  };

  const handleAuthSubmit = async (mode: "signin" | "signup") => {
    if (!supabase) {
      setAuthMessage("Supabase ist noch nicht konfiguriert.");
      return;
    }
    if (!authEmail.trim() || authPassword.length < 6) {
      setAuthMessage("Bitte E-Mail und ein Passwort mit mindestens 6 Zeichen eingeben.");
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");

    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({
            email: authEmail.trim(),
            password: authPassword,
          })
        : await supabase.auth.signUp({
            email: authEmail.trim(),
            password: authPassword,
          });

    setAuthLoading(false);

    if (result.error) {
      setAuthMessage(result.error.message);
      return;
    }

    setAuthPassword("");
    const message =
      mode === "signin"
        ? "Login erfolgreich."
        : "Registrierung angelegt. Falls E-Mail-Bestätigung aktiv ist, bitte Postfach prüfen.";
    setAuthMessage(message);
    showToast(message, "success");
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSupabaseUser(null);
    setActiveFestivalId(null);
    setSyncMessage("");
    remoteSyncReadyRef.current = false;
    setAuthMessage("Abgemeldet.");
    showToast("Von Supabase abgemeldet.", "info");
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !newRoleName.trim()) return;
    setUserAdminLoading(true);
    try {
      const { error } = await supabase.from("app_roles").insert({
        name: newRoleName.trim(),
        description: newRoleDescription.trim(),
        permissions: newRolePermissions,
      });
      if (error) throw error;
      setNewRoleName("");
      setNewRoleDescription("");
      setNewRolePermissions(["dashboard", ...DASHBOARD_WIDGET_PERMISSION_IDS]);
      await loadUserAdminData();
      showToast("Rolle wurde angelegt.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Rolle konnte nicht angelegt werden.", "error");
    } finally {
      setUserAdminLoading(false);
    }
  };

  const startEditingRole = (role: AppRole) => {
    setEditingRoleId(role.id);
    setEditingRoleName(role.name);
    setEditingRoleDescription(role.description);
    setEditingRolePermissions(role.permissions);
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !editingRoleId || !editingRoleName.trim() || editingRolePermissions.length === 0) return;
    setUserAdminLoading(true);
    try {
      const { error } = await supabase
        .from("app_roles")
        .update({
          name: editingRoleName.trim(),
          description: editingRoleDescription.trim(),
          permissions: editingRolePermissions,
        })
        .eq("id", editingRoleId);

      if (error) throw error;
      setEditingRoleId(null);
      await loadUserAdminData();
      showToast("Rolle wurde aktualisiert.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Rolle konnte nicht aktualisiert werden.", "error");
    } finally {
      setUserAdminLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !newUserEmail.trim() || !newUserPassword || !newUserRoleId) return;
    setUserAdminLoading(true);
    try {
      const { error } = await supabase.functions.invoke("admin-users", {
        body: {
          email: newUserEmail.trim(),
          password: newUserPassword,
          fullName: newUserFullName.trim(),
          roleId: newUserRoleId,
        },
      });
      if (error) throw error;
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserFullName("");
      await loadUserAdminData();
      showToast("Benutzer wurde angelegt.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Benutzer konnte nicht angelegt werden. Edge Function deployed?", "error");
    } finally {
      setUserAdminLoading(false);
    }
  };

  const handleUpdateUserRole = async (userId: string, roleId: string) => {
    if (!supabase) return;
    const { error } = await supabase.from("app_user_profiles").update({ role_id: roleId }).eq("user_id", userId);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    await loadUserAdminData();
    showToast("Benutzerrolle aktualisiert.", "success");
  };

  // --- Copy Link Generator Utility ---
  const getShareableLink = (mode: "helfer" | "reservierung") => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/${mode}`;
    }
    return `/${mode}`;
  };

  const copyLink = (mode: "helfer" | "reservierung") => {
    const url = getShareableLink(mode);
    navigator.clipboard.writeText(url);
    showToast(`Teilnahmelink kopiert! (${mode === "helfer" ? "Helfer-Anmeldung" : "Tisch-Reservierung"})`, "success");
  };

  // --- Data Modification Functions ---

  // Festival Info
  const handleUpdateFest = () => {
    const normalizedFest: FestInfo = {
      ...editedFest,
      date: formatFestDateRange(editedFest.startDate, editedFest.endDate) || editedFest.date,
      daysConfig: buildFestDaysFromRange(editedFest.startDate, editedFest.endDate, editedFest.daysConfig),
    };
    const firstConfiguredDay = normalizedFest.daysConfig[0];
    setFestInfo(normalizedFest);
    setEditedFest(normalizedFest);
    if (firstConfiguredDay) {
      const firstProgram = program.find((item) => item.time.startsWith(`${firstConfiguredDay.name} - `));
      const firstTime = firstProgram ? getProgramTimeLabel(firstProgram) : "";
      setAdminResDayId(firstConfiguredDay.id);
      setNewShiftDay(firstConfiguredDay.name);
      setNewProgDay(firstConfiguredDay.name);
      setNewResDate(firstConfiguredDay.name);
      setNewResTime(firstTime);
      setPublicResDate(firstConfiguredDay.name);
      setPublicResTime(firstTime);
      setPublicResSelectedTables([]);
    }
    saveToStorage("vfp_fest_info", normalizedFest);
    setIsEditingFest(false);
    showToast("Festinformationen erfolgreich aktualisiert!", "success");
  };

  // Program Items
  const handleAddProgram = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProgDay || !newProgClock || !newProgTitle) {
      showToast("Bitte Festtag, Uhrzeit und Titel eingeben.", "error");
      return;
    }
    const newItem: ProgramItem = {
      id: "p_" + Date.now().toString(),
      time: `${newProgDay} - ${newProgClock} Uhr`,
      title: newProgTitle,
      location: newProgLoc || "Zeltplatz",
      description: newProgDesc,
      reservationUsesTentPlan: true,
      reservationTableLimit: getDayConfigByName(newProgDay)?.tableCount ?? 16,
    };
    const updated = [...program, newItem];
    setProgram(updated);
    saveToStorage("vfp_program_items", updated);
    const newTimeLabel = getProgramTimeLabel(newItem);
    if (newResDate === newProgDay && !newResTime) setNewResTime(newTimeLabel);
    if (publicResDate === newProgDay && !publicResTime) setPublicResTime(newTimeLabel);
    if ((festInfo.daysConfig || []).find((day) => day.id === adminResDayId)?.name === newProgDay && !adminResTime) {
      setAdminResTime(newTimeLabel);
    }
    setNewProgClock("");
    setNewProgTitle("");
    setNewProgLoc("");
    setNewProgDesc("");
    setShowProgForm(false);
    showToast("Programmpunkt hinzugefügt!");
  };

  const handleDeleteProgram = (id: string) => {
    const updated = program.filter(item => item.id !== id);
    setProgram(updated);
    saveToStorage("vfp_program_items", updated);
    showToast("Programmpunkt entfernt.", "info");
  };

  const updateProgramReservationSettings = (id: string, patch: Pick<Partial<ProgramItem>, "reservationUsesTentPlan" | "reservationTableLimit">) => {
    const updated = program.map((item) => item.id === id ? { ...item, ...patch } : item);
    setProgram(updated);
    saveToStorage("vfp_program_items", updated);
  };

  // Checklist Items
  const handleAddChecklist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCheckTask) return;
    const newItem: ChecklistItem = {
      id: "c_" + Date.now().toString(),
      dueDate: newCheckDueDate,
      task: newCheckTask,
      completed: false,
      assignedTo: newCheckUser || undefined
    };
    const updated = [...checklist, newItem];
    setChecklist(updated);
    saveToStorage("vfp_checklist_items", updated);
    setNewCheckTask("");
    setNewCheckUser("");
    setShowCheckForm(false);
    showToast("Checklisten-Aufgabe hinzugefügt!");
  };

  const toggleChecklist = (id: string) => {
    const updated = checklist.map(item => {
      if (item.id === id) {
        return { ...item, completed: !item.completed };
      }
      return item;
    });
    setChecklist(updated);
    saveToStorage("vfp_checklist_items", updated);
    showToast("Aufgabenstatus aktualisiert!", "info");
  };

  const handleDeleteChecklist = (id: string) => {
    const updated = checklist.filter(item => item.id !== id);
    setChecklist(updated);
    saveToStorage("vfp_checklist_items", updated);
    showToast("Aufgabe entfernt.", "info");
  };

  // Protocols
  const handleAddProtocol = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProtoTitle || !newProtoDate) {
      showToast("Bitte Titel und Datum ausfüllen.", "error");
      return;
    }
    const newItem: Protocol = {
      id: "pr_" + Date.now().toString(),
      title: newProtoTitle,
      date: newProtoDate,
      attendees: newProtoAttendees,
      topics: newProtoTopics,
      decisions: newProtoDecisions,
      attachmentName: newProtoAttachmentName || undefined,
      attachmentData: newProtoAttachmentData || undefined,
    };
    const updated = [...protocols, newItem];
    setProtocols(updated);
    saveToStorage("vfp_protocols", updated);
    setNewProtoTitle("");
    setNewProtoDate("");
    setNewProtoAttendees("");
    setNewProtoTopics("");
    setNewProtoDecisions("");
    setNewProtoAttachmentName("");
    setNewProtoAttachmentData("");
    setShowProtoForm(false);
    showToast("Besprechungsprotokoll gespeichert!");
  };

  const handleDeleteProtocol = (id: string) => {
    const updated = protocols.filter(p => p.id !== id);
    setProtocols(updated);
    saveToStorage("vfp_protocols", updated);
    showToast("Protokoll gelöscht.", "info");
  };

  const handleProtocolAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setNewProtoAttachmentName(file.name);
      setNewProtoAttachmentData(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Shifts (Schichten)
  const handleAddShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShiftTime || !newShiftRole) {
      showToast("Bitte Arbeitszeit und Rolle ausfüllen.", "error");
      return;
    }
    const newItem: Shift = {
      id: "s_" + Date.now().toString(),
      day: newShiftDay,
      time: newShiftTime,
      role: newShiftRole,
      needed: Number(newShiftNeeded),
      helpers: [],
      notes: newShiftNotes || undefined
    };
    const updated = [...shifts, newItem];
    setShifts(updated);
    saveToStorage("vfp_shifts", updated);
    setNewShiftTime("");
    setNewShiftRole("");
    setNewShiftNotes("");
    setShowShiftForm(false);
    showToast("Neue Schicht ausgeschrieben!");
  };

  const handleDeleteShift = (id: string) => {
    const updated = shifts.filter(s => s.id !== id);
    setShifts(updated);
    saveToStorage("vfp_shifts", updated);
    showToast("Ausschreibung gelöscht.", "info");
  };

  // In-dashboard Manual Helper Adding
  const handleManualAddHelper = (shiftId: string, helperName: string) => {
    if (!helperName.trim()) return;
    const updated = shifts.map(s => {
      if (s.id === shiftId) {
        if (s.helpers.includes(helperName.trim())) return s;
        return { ...s, helpers: [...s.helpers, helperName.trim()] };
      }
      return s;
    });
    setShifts(updated);
    saveToStorage("vfp_shifts", updated);
    showToast(`${helperName} zur Schicht eingetragen!`);
  };

  const handleRemoveHelper = (shiftId: string, helperName: string) => {
    const updated = shifts.map(s => {
      if (s.id === shiftId) {
        return { ...s, helpers: s.helpers.filter(h => h !== helperName) };
      }
      return s;
    });
    setShifts(updated);
    saveToStorage("vfp_shifts", updated);
    showToast("Helfer aus Schicht ausgetragen.", "info");
  };

  // Reservations
  const handleAddReservation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newResTime) {
      showToast("Bitte zuerst einen Programmpunkt für die Reservierung anlegen.", "error");
      return;
    }
    if (!newResFirstName.trim() || !newResLastName.trim() || !newResEmail.trim() || !newResPhone.trim()) {
      showToast("Bitte Vorname, Name, E-Mail und Telefonnummer eingeben.", "error");
      return;
    }
    if (newResGuestType === "club" && !newResClubName.trim()) {
      showToast("Bitte Vereinsname eingeben.", "error");
      return;
    }
    const usesTentPlan = getReservationUsesTentPlan(newResDate, newResTime);
    const requestedTableCount = newResGuestType === "club" ? Math.max(1, newResTableCount) : 1;
    const selectedTableIds = usesTentPlan
      ? newResGuestType === "club"
        ? findAvailableTables(newResDate, newResTime, requestedTableCount)
        : [Number(newResTableId)]
      : findAvailableTables(newResDate, newResTime, requestedTableCount, getReservationTableLimit(newResDate, newResTime));
    if (selectedTableIds.length < requestedTableCount) {
      showToast("Nicht genug freie Tische für diese Reservierung verfügbar.", "error");
      return;
    }
    const displayName = newResGuestType === "club" ? newResClubName.trim() : `${newResFirstName.trim()} ${newResLastName.trim()}`;
    const newItem: Reservation = {
      id: "r_" + Date.now().toString(),
      tableId: selectedTableIds[0],
      tableIds: selectedTableIds,
      tableCount: selectedTableIds.length,
      name: displayName,
      firstName: newResFirstName.trim(),
      lastName: newResLastName.trim(),
      email: newResEmail,
      phone: newResPhone.trim(),
      guestType: newResGuestType,
      clubName: newResGuestType === "club" ? newResClubName.trim() : undefined,
      guests: selectedTableIds.length * 10,
      date: newResDate,
      time: newResTime,
      status: "Bestätigt"
    };
    const updated = [...reservations, newItem];
    setReservations(updated);
    saveToStorage("vfp_reservations", updated);
    setNewResName("");
    setNewResFirstName("");
    setNewResLastName("");
    setNewResEmail("");
    setNewResPhone("");
    setNewResClubName("");
    setNewResTableCount(1);
    setShowResForm(false);
    showToast("Reservierung erfolgreich eingetragen!");
  };

  const handleUpdateReservationStatus = (id: string, status: 'Ausstehend' | 'Bestätigt' | 'Storniert') => {
    const updated = reservations.map(r => r.id === id ? { ...r, status } : r);
    setReservations(updated);
    saveToStorage("vfp_reservations", updated);
    showToast(`Status auf "${status}" geändert.`, "info");
  };

  const handleDeleteReservation = (id: string) => {
    const updated = reservations.filter(r => r.id !== id);
    setReservations(updated);
    saveToStorage("vfp_reservations", updated);
    showToast("Reservierung gelöscht.", "info");
  };

  // Finances
  const handleAddFinance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFinCat || !newFinDesc || !newFinAmount) {
      showToast("Bitte füllen Sie Kategorie, Beschreibung und Betrag aus.", "error");
      return;
    }
    const newItem: FinancialItem = {
      id: "f_" + Date.now().toString(),
      type: newFinType,
      category: newFinCat,
      description: newFinDesc,
      amount: Number(newFinAmount),
      status: newFinType === 'expense' ? (newFinStatus === 'Erhalten' ? 'Offen' : newFinStatus) : 'Erhalten',
      attachmentName: newFinAttachmentName || undefined,
      attachmentData: newFinAttachmentData || undefined
    };
    const updated = [...finances, newItem];
    setFinances(updated);
    saveToStorage("vfp_finances", updated);
    setNewFinCat("");
    setNewFinDesc("");
    setNewFinAmount("");
    setNewFinAttachmentName("");
    setNewFinAttachmentData("");
    setShowFinForm(false);
    showToast("Finanzbuchung erfolgreich erfasst!");
  };

  const handleDeleteFinance = (id: string) => {
    const updated = finances.filter(f => f.id !== id);
    setFinances(updated);
    saveToStorage("vfp_finances", updated);
    showToast("Buchungssatz gelöscht.", "info");
  };

  const handleUpdateFinanceStatus = (id: string, status: FinancialItem["status"]) => {
    const updated = finances.map((item) => item.id === id ? { ...item, status } : item);
    setFinances(updated);
    saveToStorage("vfp_finances", updated);
    setFinancePaymentConfirmId(null);
    showToast(`Finanzposition auf "${status}" gesetzt.`, "info");
  };

  // Drag and drop attachment helper actions
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setNewFinAttachmentName(file.name);
      setNewFinAttachmentData(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewFinAttachmentName(file.name);
        setNewFinAttachmentData(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // PDF Export Logic for Shifts
  const exportShiftsToPDF = () => {
    const doc = new jsPDF();
    
    // Title & Header setup
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text("SCHICHTPLANUNG & HELFERBESTAND", 14, 22);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`FEST: ${festInfo.name}`, 14, 30);
    doc.text(`DATUM: ${festInfo.date}  |  FESTORT: ${festInfo.location.split(",")[0]}`, 14, 35);
    doc.text(`STAND VOM: ${new Date().toLocaleDateString("de-DE")} - ${new Date().toLocaleTimeString("de-DE", {hour: '2-digit', minute:'2-digit'})} Uhr`, 14, 40);
    
    // Table Header Background
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(14, 48, 182, 9, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text("TAG / SCHICHTZEIT", 16, 54);
    doc.text("TÄTIGKEITSBEREICH / ROLLE", 65, 54);
    doc.text("STATUS", 130, 54);
    doc.text("EINGETEILTE HELFER", 150, 54);
    
    // Rows
    let y = 57;
    doc.setFontSize(9);
    
    shifts.forEach((s) => {
      if (y > 265) {
        doc.addPage();
        y = 20;
        
        // Redraw Table Header on new page
        doc.setFillColor(241, 245, 249);
        doc.rect(14, y, 182, 9, "F");
        doc.setFont("helvetica", "bold");
        doc.setTextColor(71, 85, 105);
        doc.text("TAG / SCHICHTZEIT", 16, y + 6);
        doc.text("TÄTIGKEITSBEREICH / ROLLE", 65, y + 6);
        doc.text("STATUS", 130, y + 6);
        doc.text("EINGETEILTE HELFER", 150, y + 6);
        y += 9;
      }
      
      // Draw grid line
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.line(14, y, 196, y);
      y += 6;
      
      // Print Tag / Zeit
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`${s.day}`, 16, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(`${s.time}`, 16, y + 4);
      
      // Print Tätigkeitsbereich / Rolle
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`${s.role}`, 65, y);
      if (s.notes) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`${s.notes}`, 65, y + 4, { maxWidth: 62 });
        doc.setFontSize(9);
      }
      
      // Print Status badge info
      doc.setFont("helvetica", "normal");
      const filled = s.helpers.length;
      if (filled >= s.needed) {
        doc.setTextColor(22, 163, 74); // green-600
        doc.text(`BESETZT (${filled}/${s.needed})`, 130, y);
      } else {
        doc.setTextColor(220, 38, 38); // red-600
        doc.text(`OFFEN (${filled}/${s.needed})`, 130, y);
      }
      
      // Print Helpers
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "normal");
      const helpersStr = s.helpers.length > 0 ? s.helpers.join(", ") : "- Dringend gesucht -";
      doc.text(helpersStr, 150, y, { maxWidth: 44 });
      
      y += 12; // Advance cursor
    });
    
    // Add border to outer canvas
    doc.setDrawColor(203, 213, 225);
    doc.line(14, y, 196, y);
    
    doc.save(`Helferplan_${festInfo.name.replace(/\s+/g, "_")}.pdf`);
    showToast("Schichtplan PDF erfolgreich generiert!", "success");
  };

  // PDF Export Logic for Reservations
  const exportReservationsToPDF = () => {
    const doc = new jsPDF();
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42);
    doc.text("FESTZELT RESERVIERUNGSLISTE", 14, 22);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`FEST: ${festInfo.name}`, 14, 30);
    const confirmedCount = reservations.filter(r => r.status === "Bestätigt").length;
    doc.text(`STAND VOM: ${new Date().toLocaleDateString("de-DE")}  |  BESTÄTIGTE TISCHE: ${confirmedCount} von 16`, 14, 35);
    doc.text("HINWEIS: Ein reservierter Tisch entspricht einem unteilbaren Kontingent von 10 Personen.", 14, 40);
    
    // Table Header Background
    doc.setFillColor(241, 245, 249);
    doc.rect(14, 48, 182, 9, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("TISCH-NR.", 16, 54);
    doc.text("RESERVIERUNGSNAME / TRÄGER", 38, 54);
    doc.text("DATUM / UHRZEIT", 122, 54);
    doc.text("KAPAZITÄT", 158, 54);
    doc.text("STATUS", 178, 54);
    
    let y = 57;
    doc.setFontSize(9);
    
    const sortedRes = reservations
      .flatMap((reservation) =>
        getReservationTableIds(reservation).map((tableId) => ({
          reservation,
          tableId,
        })),
      )
      .sort((a, b) => {
        if (a.reservation.date !== b.reservation.date) return a.reservation.date.localeCompare(b.reservation.date);
        if (a.reservation.time !== b.reservation.time) return a.reservation.time.localeCompare(b.reservation.time);
        return a.tableId - b.tableId;
      });
    
    sortedRes.forEach(({ reservation: r, tableId }) => {
      if (y > 265) {
        doc.addPage();
        y = 20;
        
        doc.setFillColor(241, 245, 249);
        doc.rect(14, y, 182, 9, "F");
        doc.setFont("helvetica", "bold");
        doc.setTextColor(71, 85, 105);
        doc.text("TISCH-NR.", 16, y + 6);
        doc.text("RESERVIERUNGSNAME / TRÄGER", 38, y + 6);
        doc.text("DATUM / UHRZEIT", 122, y + 6);
        doc.text("KAPAZITÄT", 158, y + 6);
        doc.text("STATUS", 178, y + 6);
        y += 9;
      }
      
      doc.setDrawColor(226, 232, 240);
      doc.line(14, y, 196, y);
      y += 6;
      
      // Tisch-Nr
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`Tisch #${tableId}`, 16, y);
      
      // Reservierungname
      doc.setFont("helvetica", "bold");
      doc.text(`${r.name}`, 38, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(`${r.email}`, 38, y + 4, { maxWidth: 78 });
      doc.text(r.phone ? `Tel.: ${r.phone}` : "Tel.: -", 38, y + 8, { maxWidth: 78 });
      if (r.clubReservationNotes) {
        doc.text(`Marken: ${r.clubReservationNotes}`, 38, y + 12, { maxWidth: 78 });
      }
      
      // Datum & Uhrzeit
      doc.setTextColor(15, 23, 42);
      doc.text(`${r.date}`, 122, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(`${r.time}`, 122, y + 4);
      
      // Kapazität
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.text("10 Plätze", 158, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text("(1 Tisch)", 158, y + 4);
      
      // Status
      if (r.status === "Bestätigt") {
        doc.setTextColor(22, 163, 74);
        doc.text("BESTÄTIGT", 178, y);
      } else if (r.status === "Ausstehend") {
        doc.setTextColor(217, 119, 6); // amber-600
        doc.text("OFFEN", 178, y);
      } else {
        doc.setTextColor(100, 116, 139);
        doc.text("STORNIERT", 178, y);
      }
      
      y += r.clubReservationNotes ? 18 : 14;
    });
    
    doc.setDrawColor(203, 213, 225);
    doc.line(14, y, 196, y);
    
    doc.save(`Reservierungen_${festInfo.name.replace(/\s+/g, "_")}.pdf`);
    showToast("Reservierungsliste PDF erfolgreich generiert!", "success");
  };

  // --- Public Workflow Actions ---

  // Public shift sign-up
  const handlePublicHelperSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicSelectedShiftId) {
      showToast("Bitte wählen Sie zuerst eine Schicht aus.", "error");
      return;
    }
    if (!publicHelperName.trim()) {
      showToast("Bitte tragen Sie Ihren Namen ein.", "error");
      return;
    }

    if (supabase) {
      setPublicPortalLoading(true);
      const { error } = await supabase.functions.invoke("public-helper-signup", {
        body: {
          shiftId: publicSelectedShiftId,
          helperName: publicHelperName.trim(),
        },
      });
      setPublicPortalLoading(false);

      if (error) {
        showToast(error.message || "Eintragung konnte nicht gespeichert werden.", "error");
        return;
      }
    }

    const updated = shifts.map(s => {
      if (s.id === publicSelectedShiftId) {
        if (s.helpers.includes(publicHelperName.trim())) return s;
        return { ...s, helpers: [...s.helpers, publicHelperName.trim()] };
      }
      return s;
    });

    setShifts(updated);
    saveToStorage("vfp_shifts", updated);
    setPublicHelperName("");
    setPublicSelectedShiftId(null);
    showToast(`Vielen Dank! Du wurdest erfolgreich eingetragen.`, "success");
  };

  const getNormalizedPublicTableCount = () => Math.max(1, Number(publicResTableCount) || 1);

  // Public guest table booking request
  const handlePublicReservationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicResTime) {
      showToast("Bitte wählen Sie einen Programmpunkt aus.", "error");
      return;
    }
    if (!isReservationSlotOpen(publicResDate, publicResTime)) {
      showToast("Die Reservierungsfrist für diesen Programmpunkt ist abgelaufen.", "error");
      return;
    }
    const usesTentPlan = getReservationUsesTentPlan(publicResDate, publicResTime);
    const requestedTableCount = publicResGuestType === "club" ? getNormalizedPublicTableCount() : 1;
    const selectedTableIds = usesTentPlan
      ? publicResSelectedTables
      : findAvailableTables(publicResDate, publicResTime, requestedTableCount, getReservationTableLimit(publicResDate, publicResTime));
    if (usesTentPlan && selectedTableIds.length === 0) {
      showToast("Bitte wählen Sie mindestens einen Tisch auf dem Plan aus.", "error");
      return;
    }
    if (!publicResFirstName.trim() || !publicResLastName.trim() || !publicResEmail.trim() || !publicResPhone.trim()) {
      showToast("Bitte Vorname, Name, E-Mail-Adresse und Telefonnummer eingeben.", "error");
      return;
    }
    if (publicResGuestType === "club" && !publicResClubName.trim()) {
      showToast("Bitte Vereinsname eingeben.", "error");
      return;
    }
    if (publicResGuestType === "private" && selectedTableIds.length > 1) {
      showToast("Privatpersonen können einen Tisch reservieren. Für mehrere Tische bitte Verein auswählen.", "error");
      return;
    }
    if (selectedTableIds.length < requestedTableCount) {
      showToast("Für diesen Programmpunkt sind nicht mehr genug freie Tische verfügbar.", "error");
      return;
    }
    if (!publicPrivacyAccepted) {
      showToast("Bitte bestätigen Sie die Datenschutzhinweise.", "error");
      return;
    }

    const displayName = publicResGuestType === "club" ? publicResClubName.trim() : `${publicResFirstName.trim()} ${publicResLastName.trim()}`;

    if (supabase) {
      setPublicPortalLoading(true);
      const { error } = await supabase.functions.invoke("public-reservation-submit", {
        body: {
          firstName: publicResFirstName.trim(),
          lastName: publicResLastName.trim(),
          email: publicResEmail.trim(),
          phone: publicResPhone.trim(),
          guestType: publicResGuestType,
          clubName: publicResGuestType === "club" ? publicResClubName.trim() : "",
          clubReservationNotes: publicResGuestType === "club" ? publicResClubNotes.trim() : "",
          date: publicResDate,
          time: publicResTime,
          tableIds: selectedTableIds,
          tableCount: selectedTableIds.length,
        },
      });
      setPublicPortalLoading(false);

      if (error) {
        showToast(error.message || "Reservierung konnte nicht gespeichert werden.", "error");
        return;
      }
    }

    const newRes: Reservation = {
      id: "r_g_" + Date.now().toString(),
      tableId: selectedTableIds[0],
      tableIds: selectedTableIds,
      tableCount: selectedTableIds.length,
      name: displayName,
      firstName: publicResFirstName.trim(),
      lastName: publicResLastName.trim(),
      email: publicResEmail,
      phone: publicResPhone.trim(),
      guestType: publicResGuestType,
      clubName: publicResGuestType === "club" ? publicResClubName.trim() : undefined,
      clubReservationNotes: publicResGuestType === "club" ? publicResClubNotes.trim() : undefined,
      guests: selectedTableIds.length * 10,
      date: publicResDate,
      time: publicResTime,
      status: "Ausstehend"
    };

    const updated = [...reservations, newRes];
    setReservations(updated);
    saveToStorage("vfp_reservations", updated);

    setPublicResFirstName("");
    setPublicResLastName("");
    setPublicResEmail("");
    setPublicResPhone("");
    setPublicResClubName("");
    setPublicResClubNotes("");
    setPublicResSelectedTables([]);
    setPublicResTableCount(1);
    setPublicPrivacyAccepted(false);
    showToast("Anfrage übermittelt! Der Festausschuss wird sich in Kürze melden.", "success");
  };

  // --- Derived Values / Statistics calculation ---
  const totalExpenses = finances.filter(f => f.type === "expense").reduce((sum, f) => sum + f.amount, 0);
  const totalRevenues = finances.filter(f => f.type === "revenue").reduce((sum, f) => sum + f.amount, 0);
  const netBalance = totalRevenues - totalExpenses;
  const checklistProgress = checklist.length > 0 
    ? Math.round((checklist.filter(c => c.completed).length / checklist.length) * 100) 
    : 0;
  const totalTables = (festInfo.daysConfig || []).reduce((sum, day) => sum + day.tableCount, 0);
  const reservedTableIds = reservations
    .filter((reservation) => reservation.status !== "Storniert")
    .flatMap(getReservationTableIds);
  const reservedTables = reservedTableIds.length;
  const openTables = Math.max(0, totalTables - reservedTables);
  const pendingReservations = reservations.filter((reservation) => reservation.status === "Ausstehend").length;
  const confirmedReservations = reservations.filter((reservation) => reservation.status === "Bestätigt").length;
  const openShiftSpots = shifts.reduce((sum, shift) => sum + Math.max(0, shift.needed - shift.helpers.length), 0);
  const visibleDashboardMetrics = [
    {
      id: "dashboard:reserved_tables",
      label: "Reservierte Tische",
      value: `${reservedTables}/${totalTables}`,
      hint: `${openTables} Tische frei`,
    },
    {
      id: "dashboard:pending_reservations",
      label: "Offene Anfragen",
      value: pendingReservations,
      hint: `${confirmedReservations} bestätigt`,
    },
    {
      id: "dashboard:open_shift_spots",
      label: "Offene Schichtplätze",
      value: openShiftSpots,
      hint: `${shifts.length} Schichten angelegt`,
    },
    {
      id: "dashboard:checklist_progress",
      label: "Checkliste",
      value: `${checklistProgress}%`,
      hint: `${checklist.filter(c => !c.completed).length} Aufgaben offen`,
    },
  ].filter((metric) => hasDashboardWidgetPermission(metric.id));

  // Render standard Loader while loading localstorage safely
  if (!isMounted) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans antialiased">
        <div className="text-center space-y-3">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest animate-pulse">FestPlaner</div>
          <p className="text-slate-700 text-sm font-semibold">Lade Dashboard...</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW MODE 1: PUBLIC HELPER SIGNUP PORTAL (?mode=helfer)
  // ==========================================
  if (appMode === "helfer") {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-905 font-sans pb-12 antialiased">
        {/* Header Visual - Clean Minimalism */}
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-4xl mx-auto px-4 py-10">
            <div className="mb-5 flex justify-center sm:justify-start">
              <div className="h-32 w-64">
                <Image
                  src="/logo.png"
                  alt="FestPlaner Logo"
                  width={320}
                  height={192}
                  className="h-full w-full object-contain"
                  priority
                />
              </div>
            </div>
            <div className="flex items-center space-x-2 text-blue-605 text-xs tracking-widest uppercase font-bold mb-2">
              <Sparkles className="w-4 h-4 text-blue-500" />
              <span>Mitglieder & Helferportal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-2 leading-tight">
              Schichtplan-Eintragung
            </h1>
            <p className="text-slate-500 text-sm font-medium max-w-2xl">
              Für das Fest: <strong className="text-slate-900 font-bold">{festInfo.name || "Ihr Vereinsfest"}</strong> · Datum: <span className="text-slate-700 font-semibold">{festInfo.date || "noch offen"}</span> · Ort: <span className="text-slate-700 font-semibold">{festInfo.location || "noch offen"}</span>
            </p>
          </div>
        </div>

        {/* Floating Notification */}
        {notification && (
          <div className="fixed bottom-5 right-5 z-50 bg-slate-950 text-white py-3 px-5 rounded-lg shadow-lg flex items-center space-x-3 text-xs max-w-sm border border-slate-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-450 animate-pulse"></span>
            <span className="font-semibold">{notification.message}</span>
          </div>
        )}

        <main className="max-w-4xl mx-auto px-4 mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Direct signup form */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm">
                <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-5 flex items-center space-x-2">
                  <CheckSquare className="w-4 h-4 text-blue-600" />
                  <span>Schicht auswählen & eintragen</span>
                </h3>

                <form onSubmit={handlePublicHelperSubmit} className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Schritt 1: Freie Schicht auswählen
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                      <button
                        type="button"
                        onClick={() => setShiftDayFilter("Alle")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          shiftDayFilter === "Alle" 
                            ? "bg-blue-600 text-white" 
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        Alle Tage
                      </button>
                      {Array.from(new Set(shifts.map(s => s.day))).map((dayName) => (
                        <button
                          key={dayName}
                          type="button"
                          onClick={() => setShiftDayFilter(dayName)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            shiftDayFilter === dayName 
                              ? "bg-slate-800 text-white" 
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {dayName}
                        </button>
                      ))}
                    </div>

                    {publicPortalLoading && (
                      <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                        Lade aktuelle Schichten...
                      </div>
                    )}

                    <div className="space-y-6 max-h-[380px] overflow-y-auto pr-1">
                      {!publicPortalLoading && shifts.length === 0 && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs font-semibold text-slate-500">
                          Aktuell sind noch keine Schichten veröffentlicht.
                        </div>
                      )}
                      {Object.entries(
                        shifts
                          .filter(shift => shiftDayFilter === "Alle" || shift.day === shiftDayFilter)
                          .reduce((acc, shift) => {
                            if (!acc[shift.day]) acc[shift.day] = [];
                            acc[shift.day].push(shift);
                            return acc;
                          }, {} as Record<string, Shift[]>)
                      ).map(([day, dayShifts]) => (
                        <div key={day} className="space-y-3">
                          <h4 className="font-bold text-slate-800 text-sm border-b border-slate-200 pb-1.5 flex items-center space-x-2">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            <span>{day}</span>
                          </h4>
                          <div className="space-y-2.5">
                            {dayShifts.map((s) => {
                              const filled = s.helpers.length;
                              const spotsLeft = Math.max(0, s.needed - filled);
                              const isSelected = publicSelectedShiftId === s.id;
                              
                              return (
                                <div 
                                  key={s.id}
                                  onClick={() => spotsLeft > 0 && setPublicSelectedShiftId(s.id)}
                                  className={`p-3.5 rounded-lg border text-left transition-all ${
                                    spotsLeft === 0 
                                      ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed' 
                                      : isSelected
                                      ? 'bg-white border-blue-600 ring-2 ring-blue-100 cursor-pointer'
                                      : 'bg-white border-slate-200 hover:border-slate-300 cursor-pointer'
                                  }`}
                                >
                                  <div className="flex justify-between items-start mb-1">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                      spotsLeft === 0 
                                        ? 'bg-slate-100 text-slate-400' 
                                        : spotsLeft === 1
                                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    }`}>
                                      {spotsLeft === 0 ? 'Belegt' : `${spotsLeft} von ${s.needed} frei`}
                                    </span>
                                  </div>
                                  
                                  <h4 className="font-bold text-slate-900 text-sm leading-tight mt-1">
                                    {s.role}
                                  </h4>

                                  <div className="flex items-center space-x-4 mt-2 text-[11px] text-slate-500 font-medium">
                                    <span className="flex items-center space-x-1">
                                      <Clock className="w-3.5 h-3.5 text-blue-500" />
                                      <span>{s.time}</span>
                                    </span>
                                    {s.notes && (
                                      <span className="text-slate-450 truncate max-w-[180px]">
                                        · {s.notes}
                                      </span>
                                    )}
                                  </div>

                                  {s.helpers.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-slate-150 flex flex-wrap gap-1 items-center">
                                      <span className="text-[10px] uppercase font-bold text-slate-400 mr-1.5">Eingetragen:</span>
                                      {s.helpers.map((h, i) => (
                                        <span key={i} className="text-[10px] bg-slate-50 text-slate-700 border border-slate-200 py-0.5 px-2 rounded font-medium">
                                          {h}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5" htmlFor="h_name">
                      Schritt 2: Dein vollständiger Name
                    </label>
                    <input
                      id="h_name"
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-xs font-medium text-slate-850 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:bg-white transition-all"
                      placeholder="z.B. Franz Huber"
                      value={publicHelperName}
                      onChange={(e) => setPublicHelperName(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!publicSelectedShiftId || !publicHelperName || publicPortalLoading}
                    className="w-full bg-blue-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors text-xs uppercase tracking-wider"
                  >
                    {publicPortalLoading ? "Bitte warten..." : "In den Schichtplan eintragen"}
                  </button>
                </form>
              </div>
            </div>

            {/* Sidebar with program highlights */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h3 className="text-xs font-bold text-slate-400 mb-4 tracking-wider uppercase flex items-center space-x-1.5">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <span>Festprogramm Überblick</span>
                </h3>
                <div className="space-y-4">
                  {program.map((p) => (
                    <div key={p.id} className="border-l-2 border-slate-200 pl-3 py-0.5 relative">
                      <div className="absolute w-1.5 h-1.5 rounded-full bg-blue-600 -left-[4px] top-1.5"></div>
                      <span className="text-[9px] text-blue-600 font-bold tracking-wider uppercase block">{p.time}</span>
                      <strong className="text-slate-850 text-xs font-semibold block mt-0.5 leading-tight">{p.title}</strong>
                      <span className="text-[11px] text-slate-500 block leading-normal mt-0.5">{p.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ==========================================
  // VIEW MODE 2: PUBLIC GUEST RESERVATION PORTAL (?mode=reservierung)
  // ==========================================
  if (appMode === "reservierung") {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-12 antialiased">
        {/* Header Visual - Clean Minimalism */}
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-4xl mx-auto px-4 py-10">
            <div className="mb-5 flex justify-center sm:justify-start">
              <div className="h-32 w-64">
                <Image
                  src="/logo.png"
                  alt="FestPlaner Logo"
                  width={320}
                  height={192}
                  className="h-full w-full object-contain"
                  priority
                />
              </div>
            </div>
            <div className="flex items-center space-x-2 text-emerald-600 text-xs tracking-widest uppercase font-bold mb-2">
              <Armchair className="w-4 h-4 text-emerald-500" />
              <span>Gäste Reservierungsportal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-2 leading-tight">
              Tischreservierung anfragen
            </h1>
            <p className="text-slate-500 text-sm font-medium max-w-2xl font-sans">
              Sichere dir einen Tisch auf dem Fest: <strong className="text-slate-900 font-bold">{festInfo.name || "Ihr Vereinsfest"}</strong>.
              Wählen einen Termin aus und füllen Sie die Kontaktdaten aus.
            </p>
          </div>
        </div>

        {/* Floating Notification */}
        {notification && (
          <div className="fixed bottom-5 right-5 z-50 bg-slate-950 text-white py-3 px-5 rounded-lg shadow-lg flex items-center space-x-3 text-xs max-w-sm border border-slate-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-450 animate-pulse"></span>
            <span className="font-semibold">{notification.message}</span>
          </div>
        )}

        <main className="max-w-4xl mx-auto px-4 mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Seating map layout selection */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center space-x-1.5">
                  <Armchair className="w-4.5 h-4.5 text-emerald-600" />
                  <span>Schritt 1: Reservierung auswählen</span>
                </h3>

                <p className="text-xs text-slate-500 mb-4 font-sans leading-relaxed">
                  Ein Standardtisch bietet Platz für bis zu 8-10 Personen. Je nach Programmpunkt wähle deinen Tisch im Zeltplan oder reserviere ihn direkt aus dem verfügbaren Kontingent.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      Festtag auswählen
                    </label>
                    <select
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-700 focus:bg-white"
                      value={publicResDate}
                      onChange={(e) => {
                        const nextDate = e.target.value;
                        setPublicResDate(nextDate);
                        setPublicResSelectedTables([]);
                        setPublicResTableCount(1);
                        const times = getReservationOptionsForDay(nextDate);
                        setPublicResTime(times[0] || "");
                      }}
                    >
                      {(festInfo.daysConfig || []).map((day) => (
                        <option key={day.id} value={day.name}>{day.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      Programmpunkt auswählen
                    </label>
                    <select
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-700 focus:bg-white"
                      value={publicResTime}
                      onChange={(e) => {
                        setPublicResTime(e.target.value);
                        setPublicResSelectedTables([]);
                        setPublicResTableCount(1);
                      }}
                      disabled={getReservationOptionsForDay(publicResDate).length === 0}
                    >
                      {getReservationOptionsForDay(publicResDate).map((time) => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {publicResTime ? (
                  <div className={`mb-4 rounded-lg border p-3 text-xs font-medium leading-relaxed ${
                    isReservationSlotOpen(publicResDate, publicResTime)
                      ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                      : "border-red-100 bg-red-50 text-red-800"
                  }`}>
                    {getReservationCutoffText(publicResDate, publicResTime)}
                    {!isReservationSlotOpen(publicResDate, publicResTime) && (
                      <span className="block mt-1 font-bold">Diese Reservierung ist nicht mehr möglich.</span>
                    )}
                  </div>
                ) : (
                  <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs font-medium leading-relaxed text-amber-800">
                    Für diesen Festtag ist noch kein Programmpunkt angelegt. Tischreservierungen sind erst möglich, wenn ein Programmpunkt mit Startzeit existiert.
                  </div>
                )}

                {/* Grid representation */}
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="text-center font-mono text-[9px] text-slate-500 uppercase tracking-widest mb-4 py-1.5 border-y border-slate-200/50 font-bold bg-white/70">
                    · FESTZELT BÜHNE ·
                  </div>
                  
                  {(() => {
                    const activeDay = (festInfo.daysConfig || []).find(d => d.name === publicResDate) || { tableCount: 16, gridCols: 4, reservationsEnabled: true };
                    const dayProgram = getProgramForDay(publicResDate);
                    const usesTentPlan = getReservationUsesTentPlan(publicResDate, publicResTime);
                    const tableLimit = getReservationTableLimit(publicResDate, publicResTime);
                    const reservedForSlot = getReservedTableCountForSlot(publicResDate, publicResTime);
                    const freeForSlot = Math.max(0, tableLimit - reservedForSlot);
                    const slotOpen = publicResTime ? isReservationSlotOpen(publicResDate, publicResTime) : false;
                    
                    if (!activeDay.reservationsEnabled) {
                      return (
                        <div className="text-center py-10 px-4 bg-white rounded-lg border border-slate-200">
                          <p className="text-slate-600 font-medium text-sm">Für diesen Festtag sind aktuell keine Tischreservierungen möglich.</p>
                          <p className="text-slate-400 text-xs mt-2">Bitte wählen Sie ein anderes Datum aus.</p>
                        </div>
                      );
                    }

                    if (!publicResTime) {
                      return (
                        <div className="text-center py-10 px-4 bg-white rounded-lg border border-slate-200">
                          <p className="text-slate-600 font-medium text-sm">Für diesen Festtag ist noch kein Programmpunkt angelegt.</p>
                          <p className="text-slate-400 text-xs mt-2">Tischreservierungen werden an die Startzeit eines Programmpunktes gekoppelt.</p>
                        </div>
                      );
                    }

                    if (!slotOpen) {
                      return (
                        <div className="text-center py-10 px-4 bg-red-50 rounded-lg border border-red-100">
                          <p className="text-red-800 font-bold text-sm">Die Reservierungsfrist ist abgelaufen.</p>
                          <p className="text-red-700 text-xs mt-2">{getReservationCutoffText(publicResDate, publicResTime)}</p>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-4">
                        {dayProgram.length > 0 && (
                          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-blue-700 mb-2">Programm an diesem Tag</h4>
                            <div className="space-y-1.5">
                              {dayProgram.map((item) => (
                                <div key={item.id} className="flex items-start justify-between gap-3 text-xs">
                                  <span className="font-semibold text-slate-800">{item.title}</span>
                                  <span className="text-blue-700 font-bold shrink-0">{item.time.split(" - ")[1]}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {usesTentPlan ? (
                          <div className="-mx-3 sm:mx-0">
                            <div className="overflow-x-auto px-3 pb-3 sm:px-0 sm:pb-0 overscroll-x-contain">
                              <div
                                className="grid gap-3"
                                style={{
                                  gridTemplateColumns: `repeat(${activeDay.gridCols}, minmax(5.75rem, 1fr))`,
                                  minWidth: `${activeDay.gridCols * 6.5}rem`,
                                }}
                              >
                                {Array.from({ length: activeDay.tableCount }, (_, i) => {
                                  const tableNo = i + 1;
                                  const matches = reservations.filter(r => r.date === publicResDate && r.time === publicResTime && getReservationTableIds(r).includes(tableNo));
                                  const isReserved = matches.some(r => r.status === "Bestätigt" || r.status === "Ausstehend");
                                  const isSelected = publicResSelectedTables.includes(tableNo);

                                  let btnStyle = "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100";
                                  if (isReserved) btnStyle = "bg-slate-100 border-slate-205 text-slate-400 cursor-not-allowed pointer-events-none";
                                  else if (isSelected) btnStyle = "bg-white border-blue-600 text-blue-600 font-bold ring-2 ring-blue-100 shadow-sm";

                                  return (
                                    <button
                                      key={tableNo}
                                      type="button"
                                      disabled={isReserved || !slotOpen}
                                      onClick={() => {
                                        setPublicResSelectedTables((current) => {
                                          if (current.includes(tableNo)) {
                                            return current.filter((id) => id !== tableNo);
                                          }
                                          if (publicResGuestType === "private") {
                                            return [tableNo];
                                          }
                                          return [...current, tableNo].sort((a, b) => a - b);
                                        });
                                      }}
                                      className={`min-h-16 py-3.5 px-2 rounded-lg border text-center transition-all touch-manipulation ${btnStyle}`}
                                    >
                                      <span className="block font-bold text-xs">Tisch {tableNo}</span>
                                      <span className="block text-[8px] font-bold uppercase mt-0.5 opacity-80 tracking-wider">
                                        {isReserved ? 'Belegt' : 'Frei'}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-3 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:hidden">
                              <span>{activeDay.gridCols} Spalten im Zeltplan</span>
                              <span className="inline-flex items-center gap-1">
                                <span>Nach rechts wischen</span>
                                <ChevronRight className="h-3.5 w-3.5" />
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-4 text-center">
                            <p className="text-xs font-bold text-emerald-900">Für diesen Programmpunkt ist kein Zeltplan aktiv.</p>
                            <p className="text-xs text-emerald-700 mt-1">{freeForSlot} von {tableLimit} Tisch(en) sind noch verfügbar.</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {publicResTime && getReservationUsesTentPlan(publicResDate, publicResTime) && (
                    <div className="flex justify-center space-x-4 mt-4 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                      <span className="flex items-center space-x-1.5">
                        <span className="w-2.5 h-2.5 rounded bg-slate-50 border border-slate-200 inline-block"></span>
                        <span>Frei</span>
                      </span>
                      <span className="flex items-center space-x-1.5">
                        <span className="w-2.5 h-2.5 rounded bg-slate-100 border border-slate-200 inline-block"></span>
                        <span>Belegt</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Guest form sidebar */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center space-x-1.5">
                  <Calendar className="w-4.5 h-4.5 text-emerald-600" />
                  <span>Schritt 2: Buchungsdaten eintragen</span>
                </h3>

                {(() => {
                  const usesTentPlan = getReservationUsesTentPlan(publicResDate, publicResTime);
                  const tableLimit = getReservationTableLimit(publicResDate, publicResTime);
                  const freeForSlot = Math.max(0, tableLimit - getReservedTableCountForSlot(publicResDate, publicResTime));
                  const selectedCount = usesTentPlan ? publicResSelectedTables.length : getNormalizedPublicTableCount();

                  return selectedCount > 0 && (!usesTentPlan || publicResSelectedTables.length > 0) ? (
                  <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center space-x-2 text-xs text-emerald-800 font-semibold">
                    <span className="p-1 bg-emerald-600 text-white rounded">✓</span>
                    <span>{usesTentPlan ? (publicResSelectedTables.length === 1 ? `Tisch ${publicResSelectedTables[0]} wurde ausgewählt.` : `${publicResSelectedTables.length} Tische wurden ausgewählt.`) : `${selectedCount} Tisch(e) aus ${freeForSlot} freien Tisch(en) ausgewählt.`}</span>
                  </div>
                  ) : (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center space-x-2 text-xs text-amber-805 font-medium">
                    <AlertCircle className="w-4 h-4 text-amber-650 shrink-0" />
                    <span>{usesTentPlan ? "Zeltplan links anklicken, um Tisch zu wählen!" : "Bitte gewünschte Tischanzahl auswählen."}</span>
                  </div>
                  );
                })()}

                <form onSubmit={handlePublicReservationSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      Reservierung als *
                    </label>
                    <select
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 placeholder-slate-400 focus:bg-white transition-all"
                      value={publicResGuestType}
                      onChange={(e) => {
                        const value = e.target.value as 'private' | 'club';
                        setPublicResGuestType(value);
                        if (value === "private" && publicResSelectedTables.length > 1) {
                          setPublicResSelectedTables(publicResSelectedTables.slice(0, 1));
                        }
                        if (value === "private") {
                          setPublicResTableCount(1);
                        }
                      }}
                    >
                      <option value="private">Privatperson</option>
                      <option value="club">Verein</option>
                    </select>
                  </div>

                  {publicResGuestType === "club" && (
                    <>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                          Vereinsname *
                        </label>
                        <input
                          type="text"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 placeholder-slate-400 focus:bg-white transition-all"
                          placeholder="z.B. Trachtenverein Neustadt"
                          value={publicResClubName}
                          onChange={(e) => setPublicResClubName(e.target.value)}
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                          Bemerkung zu Bier- und Essensmarken und Fahnen
                        </label>
                        <textarea
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 placeholder-slate-400 focus:bg-white transition-all"
                          rows={3}
                          placeholder="z.B. Wir benötigen 40 Biermarken, 25 Essensmarken + 1x Fahne"
                          value={publicResClubNotes}
                          onChange={(e) => setPublicResClubNotes(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                        Vorname *
                      </label>
                      <input
                        type="text"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 placeholder-slate-400 focus:bg-white transition-all"
                        value={publicResFirstName}
                        onChange={(e) => setPublicResFirstName(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                        Name *
                      </label>
                      <input
                        type="text"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 placeholder-slate-400 focus:bg-white transition-all"
                        value={publicResLastName}
                        onChange={(e) => setPublicResLastName(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1" htmlFor="res_email">
                      E-Mail-Adresse *
                    </label>
                    <input
                      id="res_email"
                      type="email"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 placeholder-slate-400 focus:bg-white transition-all"
                      placeholder="deine@mailadresse.de"
                      value={publicResEmail}
                      onChange={(e) => setPublicResEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      Telefonnummer *
                    </label>
                    <input
                      type="tel"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 placeholder-slate-400 focus:bg-white transition-all"
                      placeholder="+49 ..."
                      value={publicResPhone}
                      onChange={(e) => setPublicResPhone(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                        Auswahl
                      </label>
                      <div className="w-full bg-emerald-50/70 border border-emerald-100 text-emerald-800 rounded-lg px-3 py-2 text-xs font-bold leading-normal select-none">
                        {getReservationUsesTentPlan(publicResDate, publicResTime) ? publicResSelectedTables.length || 0 : getNormalizedPublicTableCount()} Tisch(e)
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                        Programmpunkt
                      </label>
                      <div className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold leading-normal text-slate-700 select-none">
                        {publicResTime || "-"}
                      </div>
                    </div>
                  </div>

                  {!getReservationUsesTentPlan(publicResDate, publicResTime) && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                        Anzahl Tische *
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, getReservationTableLimit(publicResDate, publicResTime) - getReservedTableCountForSlot(publicResDate, publicResTime))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 focus:bg-white transition-all"
                        value={publicResTableCount}
                        onChange={(e) => {
                          const freeForSlot = Math.max(1, getReservationTableLimit(publicResDate, publicResTime) - getReservedTableCountForSlot(publicResDate, publicResTime));
                          if (e.target.value === "") {
                            setPublicResTableCount("");
                            return;
                          }
                          const value = Math.min(freeForSlot, Math.max(1, Number(e.target.value) || 1));
                          setPublicResTableCount(publicResGuestType === "private" ? 1 : value);
                        }}
                        onBlur={() => {
                          if (publicResTableCount === "") {
                            setPublicResTableCount(1);
                          }
                        }}
                        disabled={publicResGuestType === "private"}
                      />
                    </div>
                  )}

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <div className="flex items-start space-x-2">
                      <input
                        id="privacy_accepted"
                        type="checkbox"
                        className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                        checked={publicPrivacyAccepted}
                        onChange={(e) => setPublicPrivacyAccepted(e.target.checked)}
                        required
                      />
                      <label htmlFor="privacy_accepted" className="text-[11px] text-slate-600 leading-relaxed font-medium">
                        Ich bestätige, dass meine Angaben zur Bearbeitung der Reservierungsanfrage gespeichert und durch den Veranstalter verarbeitet werden dürfen.
                      </label>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Datenschutz: Verarbeitet werden Name, Vorname, E-Mail-Adresse, Telefonnummer, Reservierungsdetails und bei Vereinen der Vereinsname. Die Daten werden ausschließlich zur Organisation und Rückmeldung zur Tischreservierung genutzt und nach Abschluss der Veranstaltung bzw. nach Ablauf gesetzlicher Aufbewahrungsfristen gelöscht. Eine Weitergabe an Dritte erfolgt nur, soweit dies zur Durchführung der Veranstaltung oder aufgrund rechtlicher Pflichten erforderlich ist.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={publicPortalLoading || !publicResTime || !isReservationSlotOpen(publicResDate, publicResTime) || (getReservationUsesTentPlan(publicResDate, publicResTime) ? !publicResSelectedTables.length : getNormalizedPublicTableCount() < 1) || !publicResFirstName || !publicResLastName || !publicResEmail || !publicResPhone || !publicPrivacyAccepted || (publicResGuestType === "club" && !publicResClubName)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg shadow-sm transition-colors text-xs uppercase tracking-wider mt-2"
                  >
                    {publicPortalLoading ? "Reservierung wird gesendet..." : "Reservierungsanfrage Senden"}
                  </button>
                </form>
              </div>
            </div>

          </div>
        </main>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans antialiased">
        <div className="text-center space-y-3">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest animate-pulse">FestPlaner</div>
          <p className="text-slate-700 text-sm font-semibold">Prüfe Anmeldung...</p>
        </div>
      </div>
    );
  }

  if (!supabaseUser) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-4 font-sans antialiased">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-6">
          <div className="space-y-2 text-center">
            <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-sm">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">FestPlaner Admin</h1>
              <p className="text-xs text-slate-500 mt-1">
                Bitte anmelden, um das Planungsdashboard zu öffnen.
              </p>
            </div>
          </div>

          {!supabase ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs font-medium leading-normal">
              Supabase ist nicht konfiguriert. Bitte `.env.local` mit den Supabase-Werten anlegen und den Dev-Server neu starten.
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAuthSubmit("signin");
              }}
              className="space-y-3"
            >
              <input
                type="email"
                placeholder="E-Mail-Adresse"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                autoComplete="email"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:ring-1 focus:ring-blue-600 focus:outline-none"
              />
              <input
                type="password"
                placeholder="Passwort"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:ring-1 focus:ring-blue-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500 text-white font-bold py-3 rounded-lg transition-colors text-xs uppercase tracking-wider flex items-center justify-center space-x-2"
              >
                <LogIn className="w-4 h-4" />
                <span>{authLoading ? "Anmelden..." : "Anmelden"}</span>
              </button>
            </form>
          )}

          {authMessage && (
            <p className="text-xs text-slate-500 leading-normal bg-slate-50 border border-slate-200 rounded-lg p-3">
              {authMessage}
            </p>
          )}

          <div className="pt-2 border-t border-slate-100 text-center text-[11px] text-slate-400 leading-normal">
            Reservierung und Schichtpläne sind öffentlich erreichbar.
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW MODE 3: STANDARD EXECUTIVE ADMIN PLANNER (MAIN VIEW)
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans transition-all antialiased">
      
      {/* Top navigation header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 py-4 px-4 md:px-8 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="h-16 w-24">
            <Image
              src="/logo.png"
              alt="FestPlaner Logo"
              width={192}
              height={128}
              className="h-full w-full object-contain"
              priority
            />
          </div>
          <div>
            <h1 className="text-sm md:text-md font-bold text-slate-900 tracking-tight leading-tight">
              {festInfo.name || "Vereinsfest Planer"}
            </h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
              Festverwaltung
            </p>
          </div>
        </div>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-650 rounded-lg transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Floating notifications for actions - Clean Minimalism */}
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-950 text-white py-3 px-5 rounded-lg shadow-lg flex items-center space-x-3 text-xs max-w-sm border border-slate-800">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
          <span className="font-semibold">{notification.message}</span>
        </div>
      )}

      <AnimatePresence>
        {financePaymentConfirmId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/30 px-4"
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ scale: 0.97, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: 8 }}
              className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
            >
              <h3 className="text-sm font-bold text-slate-900">Position auf bezahlt setzen?</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Möchten Sie diese offene Finanzposition wirklich als bezahlt markieren?
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdateFinanceStatus(financePaymentConfirmId, "Bezahlt")}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-emerald-700"
                >
                  Ja
                </button>
                <button
                  type="button"
                  onClick={() => setFinancePaymentConfirmId(null)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50"
                >
                  Nein
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar layouts */}
      <div className="flex flex-1 relative">
        
        {/* Navigation Sidebar Drawer */}
        <aside className={`fixed inset-y-0 left-0 z-40 transform lg:static lg:translate-x-0 w-64 bg-white border-r border-slate-200 flex flex-col p-6 space-y-1.5 shrink-0 transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-3 pb-2">
            PLANUNGSTOOLS
          </div>

          <button
            onClick={() => openTab("dashboard")}
            className={`${!hasPermission("dashboard") ? "hidden" : "flex"} items-center justify-between px-3.5 py-2.5 rounded-lg font-semibold text-xs text-left transition-all ${
              activeTab === "dashboard" 
                ? "bg-blue-50 text-blue-700 font-bold" 
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center space-x-3">
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>Dashboard</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          </button>

          <button
            onClick={() => openTab("info")}
            className={`${!hasPermission("info") ? "hidden" : "flex"} items-center justify-between px-3.5 py-2.5 rounded-lg font-semibold text-xs text-left transition-all ${
              activeTab === "info" 
                ? "bg-blue-50 text-blue-700 font-bold" 
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center space-x-3">
              <Calendar className="w-4 h-4 shrink-0" />
              <span>Fest-Programm</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          </button>

          <button
            onClick={() => openTab("meetings")}
            className={`${!hasPermission("meetings") ? "hidden" : "flex"} items-center justify-between px-3.5 py-2.5 rounded-lg font-semibold text-xs text-left transition-all ${
              activeTab === "meetings" 
                ? "bg-blue-50 text-blue-700 font-bold" 
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center space-x-3">
              <ClipboardList className="w-4 h-4 shrink-0" />
              <span>Sitzungsberichte</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          </button>

          <button
            onClick={() => openTab("shifts")}
            className={`${!hasPermission("shifts") ? "hidden" : "flex"} items-center justify-between px-3.5 py-2.5 rounded-lg font-semibold text-xs text-left transition-all ${
              activeTab === "shifts" 
                ? "bg-blue-50 text-blue-700 font-bold" 
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center space-x-3">
              <Users className="w-4 h-4 shrink-0" />
              <span>Helfer & Schichtplan</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          </button>

          <button
            onClick={() => openTab("reservations")}
            className={`${!hasPermission("reservations") ? "hidden" : "flex"} items-center justify-between px-3.5 py-2.5 rounded-lg font-semibold text-xs text-left transition-all ${
              activeTab === "reservations" 
                ? "bg-blue-50 text-blue-700 font-bold" 
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center space-x-3">
              <Armchair className="w-4 h-4 shrink-0" />
              <span>Reservierungen</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          </button>

          <button
            onClick={() => openTab("costs")}
            className={`${!hasPermission("costs") ? "hidden" : "flex"} items-center justify-between px-3.5 py-2.5 rounded-lg font-semibold text-xs text-left transition-all ${
              activeTab === "costs" 
                ? "bg-blue-50 text-blue-700 font-bold" 
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center space-x-3">
              <Euro className="w-4 h-4 shrink-0" />
              <span>Finanzen & Kosten</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          </button>

          <button
            onClick={() => openTab("users")}
            className={`${!hasPermission("users") ? "hidden" : "flex"} mt-auto items-center justify-between px-3.5 py-2.5 rounded-lg font-semibold text-xs text-left transition-all ${
              activeTab === "users" 
                ? "bg-blue-50 text-blue-700 font-bold" 
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center space-x-3">
              <UserCog className="w-4 h-4 shrink-0" />
              <span>Benutzer & Rollen</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          </button>

          <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
            <p className="text-[11px] text-slate-500 leading-normal break-all">
              Angemeldet als <span className="font-bold text-slate-800">{supabaseUser.email}</span>
            </p>
            {syncMessage && (
              <p className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1.5 font-bold uppercase tracking-wider">
                {syncMessage}
              </p>
            )}
            <button
              onClick={handleSignOut}
              className="w-full border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-2 rounded-lg transition-colors text-[10px] uppercase tracking-wider"
            >
              Abmelden
            </button>
          </div>
        </aside>

        {/* Overlay when sidebar open on mobile */}
        {mobileMenuOpen && (
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/20 z-30 lg:hidden"
          ></div>
        )}

        {/* Main Workspace Frame */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto space-y-6">

          <AnimatePresence mode="wait">
            {activeTab === "dashboard" && (
              <motion.div
                key="dashboard-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                    <div>
                      <span className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">Admin Dashboard</span>
                      <h2 className="text-2xl font-bold text-slate-900 mt-1">{festInfo.name}</h2>
                      <p className="text-sm text-slate-500 mt-1">{festInfo.date} · {festInfo.location}</p>
                    </div>
                    {hasPermission("reservations") && (
                      <button
                        onClick={() => setActiveTab("reservations")}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors"
                      >
                        Reservierungen prüfen
                      </button>
                    )}
                  </div>
                </div>

                {visibleDashboardMetrics.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {visibleDashboardMetrics.map((metric) => (
                    <div key={metric.label} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{metric.label}</span>
                      <strong className="text-2xl font-bold text-slate-900 block mt-2">{metric.value}</strong>
                      <p className="text-xs text-slate-500 mt-1 font-medium">{metric.hint}</p>
                    </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {hasDashboardWidgetPermission("dashboard:reservations_by_day") && (
                    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Reservierungen nach Tag</h3>
                      <div className="space-y-3">
                        {(festInfo.daysConfig || []).map((day) => {
                          const count = reservations
                            .filter((reservation) => reservation.date === day.name && reservation.status !== "Storniert")
                            .flatMap(getReservationTableIds).length;
                          const pct = day.tableCount > 0 ? Math.round((count / day.tableCount) * 100) : 0;
                          return (
                            <div key={day.id} className="space-y-1">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                                <span>{day.name}</span>
                                <span>{count}/{day.tableCount}</span>
                              </div>
                              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {hasDashboardWidgetPermission("dashboard:open_shifts_by_day") && (
                    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Offene Schichtplätze nach Tag</h3>
                      <div className="space-y-3">
                        {(festInfo.daysConfig || []).map((day) => {
                          const dayShifts = shifts.filter((shift) => shift.day === day.name);
                          const needed = dayShifts.reduce((sum, shift) => sum + shift.needed, 0);
                          const filled = dayShifts.reduce((sum, shift) => sum + shift.helpers.length, 0);
                          const open = Math.max(0, needed - filled);
                          const pct = needed > 0 ? Math.round((filled / needed) * 100) : 0;
                          return (
                            <div key={day.id} className="space-y-1">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                                <span>{day.name}</span>
                                <span>{open} offen</span>
                              </div>
                              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }}></div>
                              </div>
                              <p className="text-[10px] text-slate-400 font-medium">
                                {filled}/{needed} Plätze besetzt · {dayShifts.length} Schicht(en)
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {hasDashboardWidgetPermission("dashboard:next_tasks") && (
                    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm lg:col-span-2">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Nächste Aufgaben</h3>
                      <div className="space-y-2">
                        {checklist.filter((item) => !item.completed).slice(0, 5).map((item) => (
                          <div key={item.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50/60">
                            <p className="text-xs font-bold text-slate-800">{item.task}</p>
                            <p className="text-[10px] text-slate-500 mt-1">{item.assignedTo || "Noch nicht zugewiesen"}{item.dueDate ? ` · ${new Date(item.dueDate).toLocaleDateString("de-DE")}` : ""}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
            
            {/* TABS 1: FESTINFOMATION & PROGRAMM */}
            {activeTab === "info" && (
              <motion.div
                key="info-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Festival Details Header - Clean Minimalism */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 relative">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                    <div className="space-y-2">
                      <div className="inline-flex items-center space-x-1.5 bg-blue-50 text-blue-700 py-1 px-2.5 rounded text-xs font-bold uppercase tracking-wider">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Hier Fest planen:</span>
                      </div>
                      
                      {isEditingFest ? (
                        <div className="space-y-3 mt-2 pr-4">
                          <input
                            type="text"
                            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-full text-sm font-bold focus:ring-1 focus:ring-blue-600 focus:outline-none focus:bg-white"
                            value={editedFest.name}
                            onChange={(e) => setEditedFest({ ...editedFest, name: e.target.value })}
                            placeholder="Name des Fests"
                          />
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label className="space-y-1">
                              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Startdatum</span>
                              <input
                                type="date"
                                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-full text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none focus:bg-white"
                                value={editedFest.startDate || ""}
                                onChange={(e) => setEditedFest({
                                  ...editedFest,
                                  startDate: e.target.value,
                                  endDate: editedFest.endDate && editedFest.endDate < e.target.value ? e.target.value : editedFest.endDate,
                                })}
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Enddatum</span>
                              <input
                                type="date"
                                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-full text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none focus:bg-white"
                                min={editedFest.startDate || undefined}
                                value={editedFest.endDate || ""}
                                onChange={(e) => setEditedFest({ ...editedFest, endDate: e.target.value })}
                              />
                            </label>
                          </div>
                          <input
                            type="text"
                            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-full text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none focus:bg-white"
                            value={editedFest.location}
                            onChange={(e) => setEditedFest({ ...editedFest, location: e.target.value })}
                            placeholder="Adresse"
                          />
                          <textarea
                            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-full text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none focus:bg-white"
                            rows={3}
                            value={editedFest.description}
                            onChange={(e) => setEditedFest({ ...editedFest, description: e.target.value })}
                            placeholder="Beschreibung"
                          />
                          <div className="flex space-x-2 pt-1">
                            <button
                              onClick={handleUpdateFest}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-colors"
                            >
                              Speichern
                            </button>
                            <button
                              onClick={() => { setIsEditingFest(false); setEditedFest(festInfo); }}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs transition-all"
                            >
                              Abbrechen
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                            {festInfo.name || "Neues Vereinsfest"}
                          </h2>
                          <p className="text-slate-500 text-xs sm:text-sm font-medium leading-relaxed max-w-2xl">
                            {festInfo.description}
                          </p>

                          {/* Quick Info Strips */}
                          <div className="flex flex-wrap gap-4 pt-3 text-slate-500 text-xs font-semibold">
                            <div className="flex items-center space-x-1.5">
                              <Calendar className="w-4 h-4 text-slate-400" />
                              <span>Datum: {festInfo.date || "noch offen"}</span>
                            </div>
                            <div className="flex items-center space-x-1.5">
                              <MapPin className="w-4 h-4 text-slate-400" />
                              <span>Ort: {festInfo.location || "noch offen"}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {!isEditingFest && (
                      <button
                        onClick={() => setIsEditingFest(true)}
                        className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 self-start sm:self-center"
                      >
                        Details bearbeiten
                      </button>
                    )}
                  </div>
                </div>

                {/* Festprogramm Header & Manager */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  
                  {/* Program Lineups */}
                  <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase flex items-center space-x-2">
                      <Clock className="w-4.5 h-4.5 text-blue-600" />
                      <span>Fest-Programm & Ablaufplan</span>
                    </h3>

                    <div className="space-y-4 pt-2">
                      {program.map((item) => (
                        <div key={item.id} className="group flex justify-between items-start border-l-2 border-blue-500 pl-4 py-1.5 bg-slate-50/40 rounded-r-lg pr-3 transition-colors hover:bg-slate-50">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="text-[10px] bg-blue-50 text-blue-800 font-bold px-2 py-0.5 rounded">
                                {item.time}
                              </span>
                              <span className="text-[11px] text-slate-450 font-medium">
                                | {item.location}
                              </span>
                            </div>
                            <h4 className="text-xs font-bold text-slate-900">{item.title}</h4>
                            <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
                          </div>

                          <button
                            onClick={() => handleDeleteProgram(item.id)}
                            className="text-slate-405 hover:text-red-500 p-1 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Add Program Item Sidebar */}
                  <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                    {!showProgForm ? (
                      <button
                        onClick={() => setShowProgForm(true)}
                        className="w-full h-full min-h-[120px] aspect-none border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-600 transition-all space-y-2 group"
                      >
                        <div className="w-10 h-10 bg-slate-100 group-hover:bg-blue-100 rounded-full flex items-center justify-center transition-colors">
                          <Plus className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                        </div>
                        <span className="font-bold text-xs uppercase tracking-wider">Festtag/Programmpunkt hinzufügen</span>
                      </button>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                            <Plus className="w-4 h-4 text-blue-600" />
                            <span>Programmpunkt hinzufügen</span>
                          </h3>
                          <button 
                            onClick={() => setShowProgForm(false)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <form onSubmit={handleAddProgram} className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                                Festtag *
                              </label>
                              <select
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-650 focus:outline-none focus:bg-white transition-all"
                                value={newProgDay}
                                onChange={(e) => setNewProgDay(e.target.value)}
                              >
                                {(festInfo.daysConfig || []).map((day) => (
                                  <option key={day.id} value={day.name}>{day.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                                Uhrzeit *
                              </label>
                              <input
                                type="time"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-650 focus:outline-none focus:bg-white transition-all"
                                value={newProgClock}
                                onChange={(e) => setNewProgClock(e.target.value)}
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                              Titel *
                            </label>
                            <input
                              type="text"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-650 focus:outline-none focus:bg-white transition-all"
                              placeholder="z.B. Festgottesdienst"
                              value={newProgTitle}
                              onChange={(e) => setNewProgTitle(e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                              Austragungsort
                            </label>
                            <input
                              type="text"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-650 focus:outline-none focus:bg-white transition-all"
                              placeholder="z.B. Festbar, Hauptstraße"
                              value={newProgLoc}
                              onChange={(e) => setNewProgLoc(e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                              Kurzbeschreibung
                            </label>
                            <textarea
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-650 focus:outline-none focus:bg-white transition-all"
                              rows={3}
                              placeholder="z.B. Liveband, Kaffee/Kuchen und Seniorenspiele"
                              value={newProgDesc}
                              onChange={(e) => setNewProgDesc(e.target.value)}
                            />
                          </div>

                          <button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-750 text-white font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors text-xs uppercase"
                          >
                            Speichern
                          </button>
                        </form>
                      </div>
                    )}
                  </div>

                </div>
              </motion.div>
            )}

            {/* TABS 2: SITUATIONSPROTOKOLLE & CHECKLISTEN */}
            {activeTab === "meetings" && (
              <motion.div
                key="meetings-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-6"
              >
                
                {/* CHECKLISTS (LEFT OR CO-8) */}
                <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-2">
                      <ClipboardList className="w-4.5 h-4.5 text-blue-600" />
                      <span>Festausschuss-Checkliste ({checklistProgress}% gelöst)</span>
                    </h3>
                  </div>

                  {/* Checklist Table */}
                  <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                    {checklist.map((item) => (
                      <div 
                        key={item.id} 
                        className={`group flex items-center justify-between p-3 rounded-lg border transition-all ${
                          item.completed 
                            ? "bg-slate-50 border-slate-200 opacity-75" 
                            : "bg-white border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-start space-x-3 flex-1 min-w-0">
                          <button
                            onClick={() => toggleChecklist(item.id)}
                            className="text-slate-400 hover:text-blue-500 mt-0.5 shrink-0 transition-colors"
                          >
                            {item.completed ? (
                              <div className="p-1 bg-green-600 text-white rounded">
                                <Check className="w-3 h-3" />
                              </div>
                            ) : (
                              <div className="p-1 bg-white hover:bg-slate-50 rounded border border-slate-300">
                                <span className="block w-3 h-3"></span>
                              </div>
                            )}
                          </button>
                          
                          <div className="min-w-0">
                            {item.dueDate && (
                              <span className="inline-block text-[9px] uppercase tracking-wider font-bold text-red-500 mb-0.5">
                                Fällig bis: {new Date(item.dueDate).toLocaleDateString("de-DE")}
                              </span>
                            )}
                            <p className={`text-xs font-medium text-slate-800 truncate leading-snug ${
                              item.completed ? "line-through text-slate-400 font-normal" : ""
                            }`}>
                              {item.task}
                            </p>
                            {item.assignedTo && (
                              <span className="text-[10px] text-slate-400 font-medium"> Zuständig: {item.assignedTo}</span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeleteChecklist(item.id)}
                          className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add Checklist task mini form */}
                  {!showCheckForm ? (
                    <button
                      onClick={() => setShowCheckForm(true)}
                      className="w-full mt-4 py-3 border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 rounded-lg flex items-center justify-center space-x-2 text-slate-500 hover:text-blue-600 transition-all group"
                    >
                      <Plus className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                      <span className="font-bold text-xs uppercase tracking-wider">Aufgabe hinzufügen</span>
                    </button>
                  ) : (
                    <form onSubmit={handleAddChecklist} className="mt-4 pt-2 bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Schnellaufgabe hinzufügen:</span>
                        <button 
                          type="button"
                          onClick={() => setShowCheckForm(false)}
                          className="p-1 hover:bg-slate-200 rounded text-slate-400 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="sm:col-span-8">
                          <input
                            type="text"
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 focus:ring-1 focus:ring-blue-600 focus:outline-none transition-all"
                            placeholder="z.B. Sanitätsdienst einweisen"
                            value={newCheckTask}
                            onChange={(e) => setNewCheckTask(e.target.value)}
                          />
                        </div>
                        
                        <div className="sm:col-span-4 relative">
                          <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none">
                            {!newCheckDueDate && <span className="text-[10px] text-slate-400">Bis wann? *</span>}
                          </div>
                          <input
                            type="date"
                            className={`w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-600 focus:outline-none transition-all ${!newCheckDueDate ? 'text-transparent' : ''}`}
                            value={newCheckDueDate}
                            onChange={(e) => setNewCheckDueDate(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-1">
                        <input
                          type="text"
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 focus:ring-1 focus:ring-blue-600 focus:outline-none max-w-[170px] transition-all"
                          placeholder="Zuständige Person"
                          value={newCheckUser}
                          onChange={(e) => setNewCheckUser(e.target.value)}
                        />
                        <button
                          type="submit"
                          className="bg-blue-600 hover:bg-blue-750 text-white font-semibold px-4 py-2 rounded-lg text-xs uppercase"
                        >
                          Hinzufügen
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* PROTOCOLS & MINUTES RIGHT */}
                <div className="lg:col-span-5 space-y-6">
                  
                  {/* Meeting Minutes Cards */}
                  <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-2">
                      <FileText className="w-4.5 h-4.5 text-blue-600" />
                      <span>Sitzungsprotokolle</span>
                    </h3>

                    <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                      {protocols.map((p) => (
                        <div key={p.id} className="p-4 bg-slate-50/50 border border-slate-200 rounded-lg space-y-2 relative group">
                          <button
                            onClick={() => handleDeleteProtocol(p.id)}
                            className="absolute top-2 right-2 text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          
                          <div className="flex justify-between items-center text-[10px] text-slate-400">
                            <span className="font-bold text-blue-600 uppercase tracking-wider">{p.date}</span>
                            <span className="font-semibold">{p.attendees}</span>
                          </div>
                          
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">{p.title}</h4>
                          <p className="text-[11px] text-slate-500"><strong className="text-slate-700">Themen:</strong> {p.topics}</p>
                          <p className="text-[11px] text-slate-500"><strong className="text-slate-700">Beschlüsse:</strong> {p.decisions}</p>
                          {p.attachmentData && p.attachmentName && (
                            <a
                              href={p.attachmentData}
                              download={p.attachmentName}
                              className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                            >
                              <Paperclip className="w-3 h-3" />
                              <span>{p.attachmentName}</span>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Add Protocol Form */}
                  <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                    {!showProtoForm ? (
                      <button
                        onClick={() => setShowProtoForm(true)}
                        className="w-full h-full min-h-[120px] aspect-none border-2 border-dashed border-slate-200 hover:border-slate-400 hover:bg-slate-50/50 rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-slate-700 transition-all space-y-2 group"
                      >
                        <div className="w-10 h-10 bg-slate-100 group-hover:bg-slate-200 rounded-full flex items-center justify-center transition-colors">
                          <Plus className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                        </div>
                        <span className="font-bold text-xs uppercase tracking-wider">Sitzung dokumentieren</span>
                      </button>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sitzung dokumentieren</h3>
                          <button 
                            onClick={() => setShowProtoForm(false)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <form onSubmit={handleAddProtocol} className="space-y-2.5">
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none text-slate-705 placeholder-slate-400 focus:bg-white"
                              placeholder="Sitzung-Titel"
                              value={newProtoTitle}
                              onChange={(e) => setNewProtoTitle(e.target.value)}
                            />
                            <input
                              type="date"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none text-slate-705 focus:bg-white"
                              value={newProtoDate}
                              onChange={(e) => setNewProtoDate(e.target.value)}
                            />
                          </div>

                          <input
                            type="text"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none text-slate-705 placeholder-slate-400 focus:bg-white"
                            placeholder="Teilnehmer (Komma-separiert)"
                            value={newProtoAttendees}
                            onChange={(e) => setNewProtoAttendees(e.target.value)}
                          />

                          <input
                            type="text"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none text-slate-705 placeholder-slate-400 focus:bg-white"
                            placeholder="Besprochene Themen"
                            value={newProtoTopics}
                            onChange={(e) => setNewProtoTopics(e.target.value)}
                          />

                          <textarea
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none text-slate-705 placeholder-slate-400 focus:bg-white"
                            rows={2}
                            placeholder="Beschlossene Resultate / Vereinbarungen"
                            value={newProtoDecisions}
                            onChange={(e) => setNewProtoDecisions(e.target.value)}
                          />

                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                            <label className="flex items-center space-x-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              <Paperclip className="w-3.5 h-3.5 text-blue-600" />
                              <span>Dokument ans Protokoll anhängen</span>
                            </label>
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png"
                              className="w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-slate-700 hover:file:bg-slate-100"
                              onChange={handleProtocolAttachmentChange}
                            />
                            {newProtoAttachmentName && (
                              <div className="flex items-center justify-between gap-2 rounded-md border border-blue-100 bg-blue-50 px-2 py-1.5 text-[10px] font-semibold text-blue-800">
                                <span className="truncate">{newProtoAttachmentName}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNewProtoAttachmentName("");
                                    setNewProtoAttachmentData("");
                                  }}
                                  className="text-blue-600 hover:text-red-600"
                                >
                                  Entfernen
                                </button>
                              </div>
                            )}
                          </div>

                          <button
                            type="submit"
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
                          >
                            Sitzung archivieren
                          </button>
                        </form>
                      </div>
                    )}
                  </div>

                </div>

              </motion.div>
            )}

            {/* TABS 3: SCHICHTPLANER & VOLUNTEERS */}
            {activeTab === "shifts" && (
              <motion.div
                key="shifts-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Helferlink Generator */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="space-y-1 text-center sm:text-left">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center justify-center sm:justify-start space-x-1.5">
                      <Share2 className="w-4 h-4 text-blue-600" />
                      <span>Schichtplan für Mitglieder & Helfer freigeben</span>
                    </h3>
                    <p className="text-xs text-slate-500 max-w-xl font-medium leading-relaxed">
                      Kopiere diesen speziellen Link und versende ihn über WhatsApp or E-Mail an Ihre Mitglieder. 
                      Helfer können sich dort direkt eintragen! Es ist Keine Anmeldung nötig. Helfer können sich nur in von dir angelegte Schichten eintragen 
                    </p>
                  </div>
                  
                  <div className="flex space-x-2 shrink-0">
                    <button
                      onClick={() => copyLink("helfer")}
                      className="bg-blue-600 hover:bg-blue-750 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors flex items-center space-x-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Link Kopieren</span>
                    </button>
                    
                    <button
                      onClick={() => window.open(getShareableLink("helfer"), "_blank")}
                      className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-650 font-bold text-xs px-3.5 py-2 rounded-lg transition-colors flex items-center"
                      title="Link in neuem Tab öffnen"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Shifts Table */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  
                  {/* Shifts status and list */}
                  <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100 flex-wrap">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-2">
                        <Users className="w-4.5 h-4.5 text-blue-600" />
                        <span>Ausgeschriebene Schichten & Besetzung</span>
                      </h3>
                      
                      <button
                        onClick={exportShiftsToPDF}
                        type="button"
                        className="inline-flex items-center space-x-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-bold text-[11px] px-3 py-1.5 rounded-lg shadow-xs transition-all"
                        title="Schichtplanung als druckbereite PDF herunterladen"
                      >
                        <FileDown className="w-3.5 h-3.5 text-slate-500" />
                        <span>PDF Export</span>
                      </button>
                    </div>

                    <div className="space-y-6">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setShiftDayFilter("Alle")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            shiftDayFilter === "Alle" 
                              ? "bg-blue-600 text-white" 
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          Alle Tage
                        </button>
                        {Array.from(new Set(shifts.map(s => s.day))).map((dayName) => (
                          <button
                            key={dayName}
                            onClick={() => setShiftDayFilter(dayName)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                              shiftDayFilter === dayName 
                                ? "bg-slate-800 text-white" 
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            {dayName}
                          </button>
                        ))}
                      </div>

                      {Object.entries(
                        shifts
                          .filter(shift => shiftDayFilter === "Alle" || shift.day === shiftDayFilter)
                          .reduce((acc, shift) => {
                            if (!acc[shift.day]) acc[shift.day] = [];
                            acc[shift.day].push(shift);
                            return acc;
                          }, {} as Record<string, Shift[]>)
                      ).map(([day, dayShifts]) => (
                        <div key={day} className="space-y-3">
                          <h4 className="font-bold text-slate-800 text-sm border-b border-slate-200 pb-1.5 flex items-center space-x-2">
                            <Calendar className="w-5 h-5 text-slate-400" />
                            <span>{day}</span>
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {dayShifts.map((s) => {
                              const filled = s.helpers.length;
                              const spotsLeft = Math.max(0, s.needed - filled);
                              const progressPercent = Math.min(100, Math.round((filled / s.needed) * 100));

                              return (
                                <div key={s.id} className="p-4 bg-slate-50/50 border border-slate-200 rounded-lg space-y-3 relative group">
                                  
                                  <button
                                    onClick={() => handleDeleteShift(s.id)}
                                    className="absolute top-3 right-3 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 p-1"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>

                                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                    <span className="text-blue-600 flex items-center space-x-1">
                                      <Clock className="w-3 h-3" />
                                      <span>{s.time}</span>
                                    </span>
                                  </div>

                                  <div>
                                    <strong className="text-slate-800 text-xs font-bold block leading-tight">{s.role}</strong>
                                    {s.notes && <p className="text-[11px] text-slate-500 mt-0.5">{s.notes}</p>}
                                  </div>

                                  {/* Progress bar */}
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                      <span>Besetzung ({filled} / {s.needed})</span>
                                      <span>{progressPercent}%</span>
                                    </div>
                                    <div className="w-full bg-slate-250 h-1.5 rounded overflow-hidden">
                                      <div 
                                        className={`h-full transition-all ${
                                          progressPercent === 100 
                                            ? 'bg-green-600' 
                                            : progressPercent >= 50
                                            ? 'bg-blue-600'
                                            : 'bg-amber-500'
                                        }`} 
                                        style={{ width: `${progressPercent}%` }}
                                      ></div>
                                    </div>
                                  </div>

                                  {/* Helpers assignation */}
                                  <div className="space-y-2 pt-2 border-t border-slate-200">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Schichtkräfte:</span>
                                    
                                    <div className="flex flex-wrap gap-1">
                                      {s.helpers.map((name) => (
                                        <span key={name} className="inline-flex items-center space-x-0.5 bg-white border border-slate-200 pl-2 pr-1 py-0.5 rounded text-xs font-semibold text-slate-705">
                                          <span>{name}</span>
                                          <button 
                                            onClick={() => handleRemoveHelper(s.id, name)}
                                            className="text-slate-400 hover:text-red-500 p-0.5"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        </span>
                                      ))}

                                      {spotsLeft > 0 && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-dashed border-amber-200 animate-pulse">
                                          {spotsLeft} Platz frei
                                        </span>
                                      )}
                                    </div>

                                    {/* Simple quick field to add help */}
                                    {spotsLeft > 0 && (
                                      <div className="pt-1.5 flex items-center space-x-1">
                                        <input
                                          id={`input-helper-${s.id}`}
                                          type="text"
                                          placeholder="Name eintragen..."
                                          className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 flex-1 focus:ring-1 focus:ring-blue-600 focus:outline-none transition-all"
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              const val = (e.target as HTMLInputElement).value;
                                              handleManualAddHelper(s.id, val);
                                              (e.target as HTMLInputElement).value = "";
                                            }
                                          }}
                                        />
                                        <button
                                          onClick={() => {
                                            const inputEl = document.getElementById(`input-helper-${s.id}`) as HTMLInputElement;
                                            if (inputEl && inputEl.value.trim()) {
                                              handleManualAddHelper(s.id, inputEl.value);
                                              inputEl.value = "";
                                            }
                                          }}
                                          className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-1.5 rounded-lg text-xs"
                                        >
                                          +
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Add Shift Sidebar */}
                  <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                    {!showShiftForm ? (
                      <button
                        onClick={() => setShowShiftForm(true)}
                        className="w-full h-full min-h-[120px] aspect-none border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-600 transition-all space-y-2 group"
                      >
                        <div className="w-10 h-10 bg-slate-100 group-hover:bg-blue-100 rounded-full flex items-center justify-center transition-colors">
                          <Plus className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                        </div>
                        <span className="font-bold text-xs uppercase tracking-wider">Schicht ausschreiben</span>
                      </button>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                            <Plus className="w-4 h-4 text-blue-600" />
                            <span>Schicht ausschreiben</span>
                          </h3>
                          <button 
                            onClick={() => setShowShiftForm(false)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <form onSubmit={handleAddShift} className="space-y-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                              Wochentag / Datum *
                            </label>
                            <select
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none text-slate-705 focus:bg-white transition-all"
                              value={newShiftDay}
                              onChange={(e) => setNewShiftDay(e.target.value)}
                            >
                              {(festInfo.daysConfig || []).map((day) => (
                                <option key={day.id} value={day.name}>{day.name}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                              Uhrzeit-Spanne *
                            </label>
                            <input
                              type="text"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none text-slate-700 placeholder-slate-400 focus:bg-white transition-all"
                              placeholder="z.B. 17:00 - 21:00 Uhr"
                              value={newShiftTime}
                              onChange={(e) => setNewShiftTime(e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                              Rolle / Station *
                            </label>
                            <input
                              type="text"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none text-slate-700 placeholder-slate-400 focus:bg-white transition-all"
                              placeholder="z.B. Bierzelt-Bar"
                              value={newShiftRole}
                              onChange={(e) => setNewShiftRole(e.target.value)}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                                Personen *
                              </label>
                              <input
                                type="number"
                                min={1}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none text-slate-700 focus:bg-white transition-all"
                                value={newShiftNeeded}
                                onChange={(e) => setNewShiftNeeded(Number(e.target.value))}
                              />
                            </div>
                            <div className="flex items-end">
                              <span className="text-[10px] text-slate-400 leading-normal pb-1 font-medium">Standard sind meist 3 bis 4 Kräfte.</span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                              Schichtnotizen
                            </label>
                            <textarea
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none text-slate-700 placeholder-slate-400 focus:bg-white transition-all"
                              rows={2}
                              placeholder="z.B. Spezielle Schürzen tragen"
                              value={newShiftNotes}
                              onChange={(e) => setNewShiftNotes(e.target.value)}
                            />
                          </div>

                          <button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-750 text-white font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors text-xs uppercase"
                          >
                            Schicht veröffentlichen
                          </button>
                        </form>
                      </div>
                    )}
                  </div>

                </div>
              </motion.div>
            )}

            {/* TABS 4: TISCHRESERVIERUNGEN */}
            {activeTab === "reservations" && (
              <motion.div
                key="reservations-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Gäste Generator Link */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="space-y-1 text-center sm:text-left">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center justify-center sm:justify-start space-x-1.5">
                      <Share2 className="w-4 h-4 text-emerald-600" />
                      <span>Tischreservierungslink für Fest-Gäste</span>
                    </h3>
                    <p className="text-xs text-slate-500 max-w-xl font-medium leading-relaxed">
                      Veröffentliche diesen Link auf deiner Website oder teile ihn mit deinen Partnervereinen und Gästen. 
                      Reservierungsanfragen können hierüber digital vorreserviert werden und fließen direkt hier in deine Prüfungsliste! Privatpersonen können maximal einen Tisch anfragen, Vereine können mehrere Tische gleichzeitig reservieren.
					  
                    </p>
                  </div>
                  
                  <div className="flex space-x-2 shrink-0">
                    <button
                      onClick={() => copyLink("reservierung")}
                      className="bg-emerald-600 hover:bg-emerald-750 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors flex items-center space-x-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Link Kopieren</span>
                    </button>
                    
                    <button
                      onClick={() => window.open(getShareableLink("reservierung"), "_blank")}
                      className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-650 font-bold text-xs px-3.5 py-2 rounded-lg transition-colors flex items-center"
                      title="Link in neuem Tab öffnen"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Seating Layout Overview */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  
                  {/* Reservations checklist with approve action */}
                  <div className="lg:col-span-8 space-y-4">
                    
                    {/* Visual Floor Plan */}
                    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                          <Armchair className="w-4.5 h-4.5 text-emerald-600" />
                          <span>Einstellungen für Reservierung und Tischplan im Festzelt</span>
                        </h4>
                        
                        {/* Day Selector */}
                        <div className="flex space-x-2 bg-slate-100 p-1 rounded-lg">
                          {(festInfo.daysConfig || []).map((day) => (
                            <button
                              key={day.id}
                              onClick={() => {
                                setAdminResDayId(day.id);
                                setAdminResTime(getReservationOptionsForDay(day.name)[0] || "");
                              }}
                              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                                adminResDayId === day.id 
                                  ? "bg-white text-emerald-700 shadow-sm border border-slate-200" 
                                  : "text-slate-500 hover:text-slate-700"
                              }`}
                            >
                              {day.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      {(() => {
                        const currentDay = (festInfo.daysConfig || []).find(d => d.id === adminResDayId) || { id: "fallback", tableCount: 16, gridCols: 4, name: "Unbekannt", reservationsEnabled: true, reservationTimes: DEFAULT_RESERVATION_TIMES };
                        const reservationOptions = getReservationOptionsForDay(currentDay.name);
                        const selectedAdminTime = adminResTime && reservationOptions.includes(adminResTime)
                          ? adminResTime
                          : reservationOptions[0] || "";
                        const dayReservations = reservations.filter(r => r.date === currentDay.name && r.time === selectedAdminTime);
                        const dayProgram = getProgramForDay(currentDay.name);
                        const selectedProgramUsesTentPlan = getReservationUsesTentPlan(currentDay.name, selectedAdminTime);
                        const selectedProgramTableLimit = getReservationTableLimit(currentDay.name, selectedAdminTime);
                        const selectedProgramReservedTables = getReservedTableCountForSlot(currentDay.name, selectedAdminTime);
                        
                        return (
                          <div className="space-y-4">
                            {/* Admin Controls for the Day */}
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs flex flex-col sm:flex-row items-center gap-4">
                              <label className="flex items-center space-x-2 font-medium text-slate-700">
                                <input 
                                  type="checkbox" 
                                  className="rounded text-emerald-600 focus:ring-emerald-500"
                                  checked={currentDay.reservationsEnabled}
                                  onChange={(e) => {
                                    updateFestDay(adminResDayId, { reservationsEnabled: e.target.checked });
                                  }}
                                />
                                <span>Reservierungen an diesem Tag aktivieren</span>
                              </label>

                              <div className="h-4 w-px bg-slate-300 hidden sm:block"></div>

                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-slate-500">Tische gesamt:</span>
                                <input 
                                  type="number" 
                                  className="w-16 px-2 py-1 bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-500"
                                  value={currentDay.tableCount}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 16;
                                    updateFestDay(adminResDayId, { tableCount: val });
                                  }}
                                />
                              </div>

                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-slate-500">Reihen (Spalten):</span>
                                <select 
                                  className="px-2 py-1 bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-500"
                                  value={currentDay.gridCols}
                                  onChange={(e) => {
                                    updateFestDay(adminResDayId, { gridCols: parseInt(e.target.value) || 4 });
                                  }}
                                >
                                  <option value={2}>2 Spalten</option>
                                  <option value={4}>4 Spalten</option>
                                  <option value={6}>6 Spalten</option>
                                  <option value={8}>8 Spalten</option>
								  <option value={10}>10 Spalten</option>
                                </select>
                              </div>
                            </div>

                            <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-2">
                              <label className="block font-bold text-slate-500 uppercase tracking-widest">
                                Belegung anzeigen für Programmpunkt
                              </label>
                              <select
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-600"
                                value={selectedAdminTime}
                                onChange={(e) => setAdminResTime(e.target.value)}
                              >
                                {reservationOptions.map((time) => (
                                  <option key={time} value={time}>{time}</option>
                                ))}
                              </select>
                              <p className="text-[10px] text-slate-400 leading-normal">
                                {selectedProgramUsesTentPlan
                                  ? "Der interaktive Zeltplan ist für diesen Programmpunkt aktiv."
                                  : `${selectedProgramReservedTables}/${selectedProgramTableLimit} Tisch(en) sind für diesen Programmpunkt reserviert.`}
                              </p>
                            </div>

                            <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-3 text-xs">
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-bold text-blue-800 uppercase tracking-widest text-[10px]">Programm für {currentDay.name}</h5>
                                <span className="text-[10px] font-bold text-blue-600">{dayProgram.length} Programmpunkt(e)</span>
                              </div>
                              {dayProgram.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {dayProgram.map((item) => (
                                    <div key={item.id} className="bg-white/80 border border-blue-100 rounded-md px-3 py-2 space-y-2">
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="font-bold text-slate-800 truncate">{item.title}</span>
                                        <span className="text-blue-700 font-bold shrink-0">{item.time.split(" - ")[1]}</span>
                                      </div>
                                      {item.location && <p className="text-[10px] text-slate-500 mt-1 truncate">{item.location}</p>}
                                      <div className="flex flex-col gap-2 rounded-md border border-slate-100 bg-slate-50/80 p-2">
                                        <label className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                          <span>Zeltplan nutzen</span>
                                          <input
                                            type="checkbox"
                                            className="rounded text-emerald-600 focus:ring-emerald-500"
                                            checked={item.reservationUsesTentPlan !== false}
                                            onChange={(e) => updateProgramReservationSettings(item.id, { reservationUsesTentPlan: e.target.checked })}
                                          />
                                        </label>
                                        {item.reservationUsesTentPlan === false && (
                                          <label className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                            <span>Max. Tische</span>
                                            <input
                                              type="number"
                                              min={1}
                                              max={500}
                                              className="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:outline-none"
                                              value={item.reservationTableLimit ?? currentDay.tableCount}
                                              onChange={(e) => updateProgramReservationSettings(item.id, { reservationTableLimit: Math.max(1, Number(e.target.value) || 1) })}
                                            />
                                          </label>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-slate-500 leading-normal">Noch kein Programmpunkt für diesen Festtag angelegt.</p>
                              )}
                            </div>

                            <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-2">
                              <label className="block font-bold text-slate-500 uppercase tracking-widest">
                                Reservierungszeiten für {currentDay.name}
                              </label>
                              <p className="text-[10px] text-slate-500 leading-normal">
                                Gäste können zu den Startzeiten der Programmpunkte reservieren. Neue Zeiten legst du im Festprogramm über Programmpunkte an. Reservierungen schließen automatisch 2 Stunden vor Start.
                              </p>
                            </div>

                            {selectedProgramUsesTentPlan ? (
                              <div className="-mx-3 sm:mx-0">
                                <div className="overflow-x-auto px-3 pb-3 sm:px-0 sm:pb-0 overscroll-x-contain">
                                  <div
                                    className="grid gap-2 bg-slate-50/50 p-3 rounded-lg border border-slate-200 text-center text-[10px] font-bold"
                                    style={{
                                      gridTemplateColumns: `repeat(${currentDay.gridCols}, minmax(4.5rem, 1fr))`,
                                      minWidth: `${currentDay.gridCols * 5.1}rem`,
                                    }}
                                  >
                                    {Array.from({ length: currentDay.tableCount }, (_, i) => {
                                      const tableNo = i + 1;
                                      const matches = dayReservations.filter(r => getReservationTableIds(r).includes(tableNo));
                                      const isConfirmed = matches.some(r => r.status === "Bestätigt");
                                      const isPending = matches.some(r => r.status === "Ausstehend");
                                      const nameLabel = matches[0] ? getReservationDisplayName(matches[0]) : "";
                                      const tileStyle = isConfirmed
                                        ? 'bg-slate-100 border-slate-300 text-slate-500'
                                        : isPending
                                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                                        : 'bg-emerald-50 border-emerald-200 text-emerald-800';

                                      return (
                                        <div
                                          key={tableNo}
                                          className={`p-1.5 rounded border flex flex-col justify-between h-14 transition-all ${tileStyle}`}
                                          title={nameLabel ? `Reserviert für: ${nameLabel}` : "Tisch ist frei"}
                                        >
                                          <span>T {tableNo}</span>
                                          <span className={`text-[8px] truncate leading-none block ${isConfirmed ? 'font-normal text-slate-400' : 'text-slate-400'}`}>
                                            {isConfirmed ? 'Ja' : isPending ? 'Offen' : 'Frei'}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-3 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:hidden">
                                  <span>{currentDay.gridCols} Spalten im Zeltplan</span>
                                  <span className="inline-flex items-center gap-1">
                                    <span>Nach rechts wischen</span>
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-5 text-center">
                                <p className="text-sm font-bold text-emerald-900">Kontingentbuchung ohne Zeltplan</p>
                                <p className="text-xs text-emerald-700 mt-1">
                                  {Math.max(0, selectedProgramTableLimit - selectedProgramReservedTables)} von {selectedProgramTableLimit} Tisch(en) sind noch frei.
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Active reservations list */}
                    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100 flex-wrap">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Digital eingegangene Reservierungen</h3>
                        
                        <button
                          onClick={exportReservationsToPDF}
                          type="button"
                          className="inline-flex items-center space-x-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-bold text-[11px] px-3 py-1.5 rounded-lg shadow-xs transition-colors"
                          title="Gesamte Reservierungstabelle als druckbereite PDF herunterladen"
                        >
                          <FileDown className="w-3.5 h-3.5 text-slate-500" />
                          <span>PDF Export</span>
                        </button>
                      </div>
                      
                      <div className="space-y-3">
                        {reservations.map((r) => (
                          <div key={r.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-slate-200 rounded-lg bg-slate-50/50 gap-4 relative group">
                            
                            <button
                              onClick={() => handleDeleteReservation(r.id)}
                              className="absolute top-2 right-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 p-0.5"
                            >
                              <X className="w-4 h-4" />
                            </button>

                            <div className="space-y-1">
                              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                <span className="text-xs bg-slate-50 text-slate-700 font-bold px-2 py-0.5 rounded border border-slate-200">
                                  Tisch {r.tableId}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  r.status === "Bestätigt"
                                    ? "bg-emerald-50 text-emerald-800"
                                    : r.status === "Ausstehend"
                                    ? "bg-amber-50 text-amber-800 animate-pulse"
                                    : "bg-red-50 text-red-800"
                                }`}>
                                  {r.status}
                                </span>
                                <span className="text-xs text-slate-400">
                                  · {r.date} um {r.time}
                                </span>
                              </div>

                              <strong className="text-slate-800 text-xs font-bold block">{r.name}</strong>
                              <span className="text-xs text-slate-500 font-medium block">
                                {r.email} · Tel.: {r.phone || "-"} · {r.guests === 10 ? "1 Ganzer Tisch (10 Plätze)" : `${r.guests} Sitzplätze`}
                              </span>
                              {r.clubReservationNotes && (
                                <span className="text-xs text-slate-600 font-medium block rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1">
                                  Bier-/Essensmarken: {r.clubReservationNotes}
                                </span>
                              )}
                            </div>

                            {/* Actions */}
                            {r.status === "Ausstehend" && (
                              <div className="flex items-center space-x-1.5 shrink-0">
                                <button
                                  onClick={() => handleUpdateReservationStatus(r.id, "Bestätigt")}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-1.5 px-3 rounded-lg text-xs transition-colors"
                                >
                                  Akzeptieren
                                </button>
                                <button
                                  onClick={() => handleUpdateReservationStatus(r.id, "Storniert")}
                                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-1.5 px-3 rounded-lg text-xs transition-colors"
                                >
                                  Ablehnen
                                </button>
                              </div>
                            )}

                          </div>
                        ))}
                      </div>
                    </div>

                  </div>

                  {/* Add manual reservation Sidebar */}
                  <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                    {!showResForm ? (
                      <button
                        onClick={() => setShowResForm(true)}
                        className="w-full h-full min-h-[120px] aspect-none border-2 border-dashed border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-emerald-600 transition-all space-y-2 group"
                      >
                        <div className="w-10 h-10 bg-slate-100 group-hover:bg-emerald-100 rounded-full flex items-center justify-center transition-colors">
                          <Plus className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                        </div>
                        <span className="font-bold text-xs uppercase tracking-wider">Manuelle Reservierung</span>
                      </button>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                            <Plus className="w-4 h-4 text-emerald-600" />
                            <span>Manuelle Reservierung</span>
                          </h3>
                          <button 
                            onClick={() => setShowResForm(false)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <form onSubmit={handleAddReservation} className="space-y-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                              Datum *
                            </label>
                            <select
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-600 focus:outline-none text-slate-705 focus:bg-white transition-all"
                              value={newResDate}
                              onChange={(e) => {
                                setNewResDate(e.target.value);
                                setNewResTableId(1);
                                setNewResTableCount(1);
                                setNewResTime(getReservationOptionsForDay(e.target.value)[0] || "");
                              }}
                            >
                              {(festInfo.daysConfig || []).map((day) => (
                                <option key={day.id} value={day.name}>{day.name}</option>
                              ))}
                            </select>
                          </div>
                          
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                              Reservierung als *
                            </label>
                            <select
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-600 focus:outline-none text-slate-705 focus:bg-white transition-all"
                              value={newResGuestType}
                              onChange={(e) => {
                                const value = e.target.value as 'private' | 'club';
                                setNewResGuestType(value);
                                if (value === "private") setNewResTableCount(1);
                              }}
                            >
                              <option value="private">Privatperson</option>
                              <option value="club">Verein</option>
                            </select>
                          </div>

                          {getReservationUsesTentPlan(newResDate, newResTime) && newResGuestType === "private" ? (
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                                Tisch-Nummer *
                              </label>
                              <select
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-600 focus:outline-none text-slate-705 focus:bg-white transition-all"
                                value={newResTableId}
                                onChange={(e) => setNewResTableId(Number(e.target.value))}
                              >
                                {Array.from({ length: ((festInfo.daysConfig || []).find(d => d.name === newResDate)?.tableCount) || 16 }, (_, i) => (
                                  <option key={i+1} value={i+1}>Tisch {i+1}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                                Anzahl Tische *
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={Math.max(1, getReservationTableLimit(newResDate, newResTime) - getReservedTableCountForSlot(newResDate, newResTime))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-600 focus:outline-none text-slate-700 focus:bg-white transition-all"
                                value={newResTableCount}
                                onChange={(e) => {
                                  const freeForSlot = Math.max(1, getReservationTableLimit(newResDate, newResTime) - getReservedTableCountForSlot(newResDate, newResTime));
                                  const value = Math.min(freeForSlot, Math.max(1, Number(e.target.value) || 1));
                                  setNewResTableCount(newResGuestType === "private" ? 1 : value);
                                }}
                                disabled={newResGuestType === "private"}
                              />
                            </div>
                          )}

                          {newResGuestType === "club" && (
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                                Vereinsname *
                              </label>
                              <input
                                type="text"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-600 focus:outline-none text-slate-700 placeholder-slate-400 focus:bg-white transition-all"
                                value={newResClubName}
                                onChange={(e) => setNewResClubName(e.target.value)}
                              />
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                                Vorname *
                              </label>
                              <input
                                type="text"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-600 focus:outline-none text-slate-700 placeholder-slate-400 focus:bg-white transition-all"
                                value={newResFirstName}
                                onChange={(e) => setNewResFirstName(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                                Name *
                              </label>
                              <input
                                type="text"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-600 focus:outline-none text-slate-700 placeholder-slate-400 focus:bg-white transition-all"
                                value={newResLastName}
                                onChange={(e) => setNewResLastName(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="hidden">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                              Gruppenname / Reservierer *
                            </label>
                            <input
                              type="text"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-600 focus:outline-none text-slate-700 placeholder-slate-400 focus:bg-white transition-all"
                              placeholder="z.B. Vereinsname"
                              value={newResName}
                              onChange={(e) => setNewResName(e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                              E-Mail *
                            </label>
                            <input
                              type="email"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-600 focus:outline-none text-slate-700 placeholder-slate-400 focus:bg-white transition-all"
                              placeholder="mail@adresse.de"
                              value={newResEmail}
                              onChange={(e) => setNewResEmail(e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                              Telefonnummer *
                            </label>
                            <input
                              type="tel"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-600 focus:outline-none text-slate-700 placeholder-slate-400 focus:bg-white transition-all"
                              value={newResPhone}
                              onChange={(e) => setNewResPhone(e.target.value)}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                                Umfang
                              </label>
                              <div className="w-full bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-lg px-3 py-2 text-xs font-bold leading-normal select-none">
                                {newResGuestType === "club" ? `${newResTableCount} Tisch(e)` : "1 Tisch"}
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                                Uhrzeit
                              </label>
                              <select
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-600 focus:outline-none text-slate-700 focus:bg-white transition-all"
                                value={newResTime}
                                onChange={(e) => setNewResTime(e.target.value)}
                                disabled={getReservationOptionsForDay(newResDate).length === 0}
                              >
                                {getReservationOptionsForDay(newResDate).map((time) => (
                                  <option key={time} value={time}>{time}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <button
                            type="submit"
                            className="w-full bg-emerald-600 hover:bg-emerald-750 text-white font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors text-xs uppercase"
                          >
                            Eintragen
                          </button>
                        </form>
                      </div>
                    )}
                  </div>

                </div>
              </motion.div>
            )}

            {activeTab === "users" && (
              <motion.div
                key="users-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-start space-x-3">
                    <ShieldCheck className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Benutzer & Rollen</h2>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Benutzer werden direkt in der Datenbank angelegt. Rollen steuern, welche Bereiche sichtbar sind.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Neue Rolle</h3>
                    <form onSubmit={handleCreateRole} className="space-y-3">
                      <input
                        type="text"
                        placeholder="Rollenname"
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Beschreibung"
                        value={newRoleDescription}
                        onChange={(e) => setNewRoleDescription(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {ADMIN_PERMISSIONS.map((permission) => (
                          <label key={permission.id} className="flex items-center space-x-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                            <input
                              type="checkbox"
                              checked={newRolePermissions.includes(permission.id)}
                              onChange={(e) => {
                                toggleRolePermission(setNewRolePermissions, permission.id, e.target.checked);
                              }}
                            />
                            <span>{permission.label}</span>
                          </label>
                        ))}
                      </div>
                      {newRolePermissions.includes("dashboard") && (
                        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 space-y-2">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Sichtbare Dashboard-Kacheln</p>
                            <p className="text-[10px] text-blue-700/80 mt-0.5 leading-normal">
                              Diese Auswahl gilt nur, wenn die Rolle Zugriff auf das Dashboard hat.
                            </p>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {DASHBOARD_WIDGET_PERMISSIONS.map((permission) => (
                              <label key={permission.id} className="flex items-center space-x-2 text-xs text-slate-600 bg-white border border-blue-100 rounded-lg px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={newRolePermissions.includes(permission.id)}
                                  onChange={(e) => {
                                    toggleRolePermission(setNewRolePermissions, permission.id, e.target.checked);
                                  }}
                                />
                                <span>{permission.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={userAdminLoading || !newRoleName.trim() || newRolePermissions.length === 0}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500 text-white font-bold py-2.5 rounded-lg transition-colors text-xs uppercase tracking-wider"
                      >
                        Rolle anlegen
                      </button>
                    </form>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Neuer Benutzer</h3>
                    <form onSubmit={handleCreateUser} className="space-y-3">
                      <input
                        type="text"
                        placeholder="Vollständiger Name"
                        value={newUserFullName}
                        onChange={(e) => setNewUserFullName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none"
                      />
                      <input
                        type="email"
                        placeholder="E-Mail"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none"
                      />
                      <input
                        type="password"
                        placeholder="Initiales Passwort"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none"
                      />
                      <select
                        value={newUserRoleId}
                        onChange={(e) => setNewUserRoleId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none"
                      >
                        <option value="">Rolle auswählen</option>
                        {appRoles.map((role) => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        disabled={userAdminLoading || !newUserEmail || !newUserPassword || !newUserRoleId}
                        className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500 text-white font-bold py-2.5 rounded-lg transition-colors text-xs uppercase tracking-wider"
                      >
                        Benutzer anlegen
                      </button>
                    </form>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Benutzerübersicht</h3>
                  <div className="space-y-2">
                    {appUsers.map((user) => (
                      <div key={user.user_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-slate-200 rounded-lg p-3 bg-slate-50">
                        <div>
                          <p className="text-xs font-bold text-slate-800">{user.full_name || user.email}</p>
                          <p className="text-[11px] text-slate-500">{user.email}</p>
                        </div>
                        <select
                          value={user.role_id ?? ""}
                          onChange={(e) => handleUpdateUserRole(user.user_id, e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
                        >
                          <option value="">Keine Rolle</option>
                          {appRoles.map((role) => (
                            <option key={role.id} value={role.id}>{role.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                    {appUsers.length === 0 && (
                      <p className="text-xs text-slate-500">Noch keine Benutzerprofile vorhanden.</p>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rollenübersicht</h3>
                  <div className="space-y-3">
                    {appRoles.map((role) => {
                      const isEditing = editingRoleId === role.id;

                      return (
                        <div key={role.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          {isEditing ? (
                            <form onSubmit={handleUpdateRole} className="space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  value={editingRoleName}
                                  onChange={(e) => setEditingRoleName(e.target.value)}
                                  className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none"
                                />
                                <input
                                  type="text"
                                  value={editingRoleDescription}
                                  onChange={(e) => setEditingRoleDescription(e.target.value)}
                                  placeholder="Beschreibung"
                                  className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none"
                                />
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {ADMIN_PERMISSIONS.map((permission) => (
                                  <label key={permission.id} className="flex items-center space-x-2 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">
                                    <input
                                      type="checkbox"
                                      checked={editingRolePermissions.includes(permission.id)}
                                      onChange={(e) => {
                                        toggleRolePermission(setEditingRolePermissions, permission.id, e.target.checked);
                                      }}
                                    />
                                    <span>{permission.label}</span>
                                  </label>
                                ))}
                              </div>
                              {editingRolePermissions.includes("dashboard") && (
                                <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 space-y-2">
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Sichtbare Dashboard-Kacheln</p>
                                    <p className="text-[10px] text-blue-700/80 mt-0.5 leading-normal">
                                      Entfernte Kacheln werden für Benutzer dieser Rolle im Dashboard ausgeblendet.
                                    </p>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {DASHBOARD_WIDGET_PERMISSIONS.map((permission) => (
                                      <label key={permission.id} className="flex items-center space-x-2 text-xs text-slate-600 bg-white border border-blue-100 rounded-lg px-3 py-2">
                                        <input
                                          type="checkbox"
                                          checked={editingRolePermissions.includes(permission.id)}
                                          onChange={(e) => {
                                            toggleRolePermission(setEditingRolePermissions, permission.id, e.target.checked);
                                          }}
                                        />
                                        <span>{permission.label}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="submit"
                                  disabled={userAdminLoading || !editingRoleName.trim() || editingRolePermissions.length === 0}
                                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500 text-white font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-wider"
                                >
                                  Speichern
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingRoleId(null)}
                                  className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-wider"
                                >
                                  Abbrechen
                                </button>
                              </div>
                            </form>
                          ) : (
                            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                              <div className="space-y-2">
                                <div>
                                  <p className="text-xs font-bold text-slate-900">{role.name}</p>
                                  {role.description && <p className="text-[11px] text-slate-500 mt-0.5">{role.description}</p>}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {role.permissions.filter((permissionId) => !permissionId.startsWith("dashboard:")).map((permissionId) => {
                                    const permission = ADMIN_PERMISSIONS.find((item) => item.id === permissionId);
                                    return (
                                      <span key={permissionId} className="rounded bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                        {permission?.label ?? permissionId}
                                      </span>
                                    );
                                  })}
                                </div>
                                {role.permissions.includes("dashboard") && (
                                  <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Dashboard-Kacheln</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {DASHBOARD_WIDGET_PERMISSIONS
                                        .filter((permission) => role.permissions.includes(permission.id))
                                        .map((permission) => (
                                          <span key={permission.id} className="rounded bg-blue-50 border border-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                                            {permission.label}
                                          </span>
                                        ))}
                                      {role.permissions.filter((permissionId) => permissionId.startsWith("dashboard:")).length === 0 && (
                                        <span className="rounded bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                                          Alle Kacheln
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => startEditingRole(role)}
                                className="self-start border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold px-3 py-2 rounded-lg text-[10px] uppercase tracking-wider"
                              >
                                Bearbeiten
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {appRoles.length === 0 && (
                      <p className="text-xs text-slate-500">Noch keine Rollen vorhanden.</p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* TABS 5: FINANZEN & KOSTEN */}
            {activeTab === "costs" && (
              <motion.div
                key="costs-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Financial Overview Metrics Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">Erwartete Einnahmen</span>
                      <strong className="text-xl font-bold text-emerald-600 block mt-1">{totalRevenues} €</strong>
                    </div>
                    <div className="p-3 bg-white border border-slate-200 text-emerald-605 rounded-lg">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">Erwartete Ausgaben</span>
                      <strong className="text-xl font-bold text-rose-600 block mt-1">{totalExpenses} €</strong>
                    </div>
                    <div className="p-3 bg-white border border-slate-200 text-rose-605 rounded-lg">
                      <TrendingDown className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">Vorläufiger Gewinn</span>
                      <strong className={`text-xl font-bold block mt-1 ${netBalance >= 0 ? "text-blue-600" : "text-rose-600"}`}>
                        {netBalance} €
                      </strong>
                    </div>
                    <div className={`p-3 rounded-lg bg-white border border-slate-200 ${netBalance >= 0 ? "text-blue-600" : "text-rose-600"}`}>
                      <Euro className="w-5 h-5" />
                    </div>
                  </div>

                </div>

                {/* Ledger & Transactions layout */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  
                  {/* Ledger entries list */}
                  <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-200">Positionen</h3>

                    <div className="space-y-2.5 max-h-[450px] overflow-y-auto pr-1">
                      {finances.map((f) => (
                        <div key={f.id} className="flex justify-between items-center p-3.5 border border-slate-200 rounded-lg bg-slate-50/50 group hover:bg-slate-50 transition-colors">
                          <div className="space-y-0.5">
                            <span className={`inline-block text-[9px] uppercase tracking-wide font-extrabold px-1.5 py-0.5 rounded mr-1.5 ${
                              f.type === "expense" ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            }`}>
                              {f.type === "expense" ? "Ausgabe" : "Einnahme"}
                            </span>
                            <span className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">{f.category}</span>
                            <h4 className="text-xs font-bold text-slate-800 leading-tight">{f.description}</h4>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="text-[10px] text-slate-400 font-medium mr-1">Status: {f.status}</span>
                              {f.attachmentName && f.attachmentData ? (
                                <a 
                                  href={f.attachmentData}
                                  download={f.attachmentName}
                                  className="inline-flex items-center space-x-1 text-[9px] font-bold text-blue-600 bg-blue-50/70 border border-blue-200 hover:bg-blue-100 hover:text-blue-800 px-1.5 py-0.5 rounded transition-all cursor-pointer leading-none"
                                  title="Anhang/Beleg herunterladen"
                                >
                                  <Paperclip className="w-2.5 h-2.5" />
                                  <span className="truncate max-w-[120px]">{f.attachmentName}</span>
                                </a>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex items-center space-x-3 shrink-0">
                            <span className={`text-xs font-bold ${f.type === "expense" ? "text-rose-600" : "text-emerald-600"}`}>
                              {f.type === "expense" ? "-" : "+"}{f.amount} €
                            </span>
                            {f.type === "expense" && f.status === "Offen" && (
                              <button
                                onClick={() => setFinancePaymentConfirmId(f.id)}
                                className="inline-flex items-center space-x-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 hover:bg-emerald-100 transition-colors"
                                title="Offene Ausgabe als bezahlt markieren"
                              >
                                <Check className="w-3 h-3" />
                                <span>Bezahlt</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteFinance(f.id)}
                              className="text-slate-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Add manual transaction Sidebar */}
                  <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
                    
                    {/* Budget configuration box */}
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Geplanter Etat (Budget)</label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 font-bold text-slate-800 text-xs w-full focus:ring-1 focus:ring-blue-600 focus:outline-none transition-all"
                          value={Number.isNaN(budget) ? "" : budget}
                          onChange={(e) => {
                            const val = e.target.value === "" ? 0 : Number(e.target.value);
                            setBudget(val);
                            saveToStorage("vfp_budget", val);
                          }}
                        />
                        <span className="text-xs font-bold text-slate-500">€</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 leading-normal">Aktuelle Auslastung: {Math.round((totalExpenses / (budget || 1)) * 100)}% des Budgets verplant.</p>
                    </div>

                    {/* Form */}
                    <div className="space-y-4 pt-1">
                      {!showFinForm ? (
                        <button
                          onClick={() => setShowFinForm(true)}
                          className="w-full h-full min-h-[120px] aspect-none border-2 border-dashed border-slate-200 hover:border-slate-400 hover:bg-slate-50/50 rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-slate-700 transition-all space-y-2 group mt-4"
                        >
                          <div className="w-10 h-10 bg-slate-100 group-hover:bg-slate-200 rounded-full flex items-center justify-center transition-colors">
                            <Plus className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                          </div>
                          <span className="font-bold text-xs uppercase tracking-wider">Neue Position buchen</span>
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">Posten verbuchen</h3>
                            <button 
                              onClick={() => setShowFinForm(false)}
                              className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          
                          <form onSubmit={handleAddFinance} className="space-y-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Typ</label>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setNewFinType('expense')}
                                  className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                                    newFinType === 'expense' 
                                      ? 'bg-rose-50 border-rose-200 text-rose-700' 
                                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  Ausgabe
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setNewFinType('revenue')}
                                  className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                                    newFinType === 'revenue' 
                                      ? 'bg-emerald-50 border-emerald-250 text-emerald-800' 
                                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  Einnahme
                                </button>
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Kategorie *</label>
                              <input
                                type="text"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none text-slate-700 placeholder-slate-400 focus:bg-white transition-all"
                                placeholder="z.B. Festzelt, Gastro, Werbung"
                                value={newFinCat}
                                onChange={(e) => setNewFinCat(e.target.value)}
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Beschreibung *</label>
                              <input
                                type="text"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none text-slate-700 placeholder-slate-400 focus:bg-white transition-all"
                                placeholder="z.B. Bandanzahlung, Plakate"
                                value={newFinDesc}
                                onChange={(e) => setNewFinDesc(e.target.value)}
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Summe *</label>
                                <input
                                  type="number"
                                  min={1}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none text-slate-700 focus:bg-white transition-all"
                                  placeholder="in EUR"
                                  value={newFinAmount}
                                  onChange={(e) => setNewFinAmount(e.target.value)}
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Status</label>
                                <select
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none text-slate-700 focus:bg-white transition-all"
                                  value={newFinStatus}
                                  disabled={newFinType === 'revenue'}
                                  onChange={(e) => setNewFinStatus(e.target.value as any)}
                                >
                                  <option value="Bezahlt">Bezahlt</option>
                                  <option value="Offen">Offen</option>
                                </select>
                              </div>
                            </div>

                            {/* File Attachment Uploader */}
                            <div className="space-y-1">
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                                Anhang / Beleg (z.B. Rechnung oder Angebot)
                              </label>
                              <div
                                onDragEnter={handleDrag}
                                onDragOver={handleDrag}
                                onDragLeave={handleDrag}
                                onDrop={handleDrop}
                                className={`border border-dashed rounded-lg p-3 text-center transition-all relative cursor-pointer ${
                                  dragActive 
                                    ? 'border-blue-600 bg-blue-50/50' 
                                    : newFinAttachmentName 
                                    ? 'border-emerald-300 bg-emerald-50/20' 
                                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 hover:border-slate-300'
                                }`}
                              >
                                <input
                                  type="file"
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                  onChange={handleFileChange}
                                  title=""
                                />
                                
                                <div className="flex flex-col items-center space-y-1 pointer-events-none">
                                  <Paperclip className={`w-4 h-4 ${
                                    newFinAttachmentName ? 'text-emerald-600 animate-bounce' : 'text-slate-400'
                                  }`} />
                                  {newFinAttachmentName ? (
                                    <div className="space-y-0.5">
                                      <p className="text-[11px] font-bold text-emerald-800 truncate max-w-[200px] mx-auto">
                                        {newFinAttachmentName}
                                      </p>
                                      <p className="text-[10px] text-emerald-600 font-medium">
                                        Beleg bereit (Klicken zum Ändern)
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="space-y-0.5">
                                      <p className="text-[11px] font-bold text-slate-650 leading-tight">
                                        Datei per Drag-and-Drop reinlegen
                                      </p>
                                      <p className="text-[9px] text-slate-400">
                                        oder hier klicken zum Durchsuchen
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            <button
                              type="submit"
                              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 px-4 rounded-lg shadow-sm transition-colors text-xs uppercase"
                            >
                              Position verbuchen
                            </button>
                          </form>
                        </div>
                      )}
                    </div>

                  </div>

                </div>

              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>

    </div>
  );
}


