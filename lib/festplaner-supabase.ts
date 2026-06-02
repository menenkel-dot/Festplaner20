import type { SupabaseClient, User } from "@supabase/supabase-js";
import type {
  ChecklistItem,
  FestInfo,
  FinancialItem,
  ProgramItem,
  Protocol,
  Reservation,
  Shift,
} from "./festplaner-types";

export interface FestPlanerSnapshot {
  festInfo: FestInfo;
  program: ProgramItem[];
  checklist: ChecklistItem[];
  protocols: Protocol[];
  shifts: Shift[];
  reservations: Reservation[];
  finances: FinancialItem[];
  budget: number;
}

interface FestivalRow {
  id: string;
  name: string;
  date_label: string;
  start_date: string | null;
  end_date: string | null;
  location: string;
  description: string;
  budget: number | string;
}

function mapReservationStatus(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("storni")) return "cancelled";
  if (normalized.includes("best")) return "confirmed";
  return "pending";
}

function mapFinancialStatus(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("bezahlt")) return "paid";
  if (normalized.includes("erhalten")) return "received";
  return "open";
}

function mapReservationStatusToUi(status: string) {
  if (status === "confirmed") return "Bestätigt";
  if (status === "cancelled") return "Storniert";
  return "Ausstehend";
}

function mapFinancialStatusToUi(status: string) {
  if (status === "paid") return "Bezahlt";
  if (status === "received") return "Erhalten";
  return "Offen";
}

async function replaceFestivalChildren(
  supabase: SupabaseClient,
  festivalId: string,
  snapshot: FestPlanerSnapshot,
) {
  const { data: existingShifts, error: shiftsLookupError } = await supabase
    .from("shifts")
    .select("id")
    .eq("festival_id", festivalId);

  if (shiftsLookupError) throw shiftsLookupError;

  const shiftIds = (existingShifts ?? []).map((shift) => String(shift.id));
  if (shiftIds.length > 0) {
    const { error } = await supabase.from("shift_helpers").delete().in("shift_id", shiftIds);
    if (error) throw error;
  }

  const childTables = [
    "festival_days",
    "program_items",
    "checklist_items",
    "protocols",
    "shifts",
    "reservations",
    "financial_items",
  ];

  for (const table of childTables) {
    const { error } = await supabase.from(table).delete().eq("festival_id", festivalId);
    if (error) throw error;
  }

  const days = snapshot.festInfo.daysConfig.map((day, index) => ({
    festival_id: festivalId,
    name: day.name,
    reservations_enabled: day.reservationsEnabled,
    table_count: day.tableCount,
    grid_cols: day.gridCols,
    reservation_times: day.reservationTimes ?? [],
    sort_order: index,
  }));

  if (days.length > 0) {
    const { error } = await supabase.from("festival_days").insert(days);
    if (error) throw error;
  }

  if (snapshot.program.length > 0) {
    const { error } = await supabase.from("program_items").insert(
      snapshot.program.map((item, index) => ({
        festival_id: festivalId,
        time_label: item.time,
        title: item.title,
        location: item.location,
        description: item.description,
        reservation_uses_tent_plan: item.reservationUsesTentPlan ?? true,
        reservation_table_limit: Math.max(1, item.reservationTableLimit ?? 16),
        sort_order: index,
      })),
    );
    if (error) throw error;
  }

  if (snapshot.checklist.length > 0) {
    const { error } = await supabase.from("checklist_items").insert(
      snapshot.checklist.map((item) => ({
        festival_id: festivalId,
        due_date: item.dueDate || null,
        task: item.task,
        completed: item.completed,
        assigned_to: item.assignedTo || null,
      })),
    );
    if (error) throw error;
  }

  if (snapshot.protocols.length > 0) {
    const { error } = await supabase.from("protocols").insert(
      snapshot.protocols.map((item) => ({
        festival_id: festivalId,
        title: item.title,
        protocol_date: item.date,
        attendees: item.attendees,
        topics: item.topics,
        decisions: item.decisions,
      })),
    );
    if (error) throw error;
  }

  const shiftIdMap = new Map<string, string>();

  for (const shift of snapshot.shifts) {
    const { data, error } = await supabase
      .from("shifts")
      .insert({
        festival_id: festivalId,
        day_label: shift.day,
        time_label: shift.time,
        role: shift.role,
        needed: shift.needed,
        notes: shift.notes || null,
      })
      .select("id")
      .single();

    if (error) throw error;
    if (data?.id) shiftIdMap.set(shift.id, data.id as string);
  }

  const helpers = snapshot.shifts.flatMap((shift) => {
    const shiftId = shiftIdMap.get(shift.id);
    if (!shiftId) return [];
    return shift.helpers.map((helperName) => ({
      shift_id: shiftId,
      helper_name: helperName,
    }));
  });

  if (helpers.length > 0) {
    const { error } = await supabase.from("shift_helpers").insert(helpers);
    if (error) throw error;
  }

  if (snapshot.reservations.length > 0) {
    const { error } = await supabase.from("reservations").insert(
      snapshot.reservations.map((item) => ({
        festival_id: festivalId,
        table_id: item.tableId,
        table_ids: item.tableIds?.length ? item.tableIds : [item.tableId],
        table_count: item.tableCount ?? item.tableIds?.length ?? 1,
        name: item.name,
        first_name: item.firstName || null,
        last_name: item.lastName || null,
        email: item.email,
        phone: item.phone || null,
        guest_type: item.guestType || "private",
        club_name: item.clubName || null,
        guests: item.guests,
        date_label: item.date,
        time_label: item.time,
        status: mapReservationStatus(item.status),
      })),
    );
    if (error) throw error;
  }

  if (snapshot.finances.length > 0) {
    const { error } = await supabase.from("financial_items").insert(
      snapshot.finances.map((item) => ({
        festival_id: festivalId,
        type: item.type,
        category: item.category,
        description: item.description,
        amount: item.amount,
        status: mapFinancialStatus(item.status),
        attachment_name: item.attachmentName || null,
        attachment_data: item.attachmentData || null,
      })),
    );
    if (error) throw error;
  }
}

export async function saveActiveFestivalToSupabase(
  supabase: SupabaseClient,
  user: User,
  snapshot: FestPlanerSnapshot,
  festivalId?: string | null,
) {
  let activeFestivalId = festivalId;

  if (!activeFestivalId) {
    const { data: existing, error: existingError } = await supabase
      .from("festivals")
      .select("id")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (existingError) throw existingError;
    activeFestivalId = existing?.id ?? null;
  }

  const festivalPayload = {
    owner_id: user.id,
    name: snapshot.festInfo.name,
    date_label: snapshot.festInfo.date,
    start_date: snapshot.festInfo.startDate || null,
    end_date: snapshot.festInfo.endDate || null,
    location: snapshot.festInfo.location,
    description: snapshot.festInfo.description,
    budget: snapshot.budget,
  };

  if (activeFestivalId) {
    const { error } = await supabase
      .from("festivals")
      .update(festivalPayload)
      .eq("id", activeFestivalId)
      .eq("owner_id", user.id);

    if (error) throw error;
  } else {
    const { data: festival, error } = await supabase
      .from("festivals")
      .insert(festivalPayload)
      .select("id")
      .single();

    if (error) throw error;
    if (!festival?.id) throw new Error("Supabase hat keine Festival-ID zurückgegeben.");
    activeFestivalId = festival.id as string;
  }

  await replaceFestivalChildren(supabase, activeFestivalId, snapshot);
  return activeFestivalId;
}

export async function importSnapshotToSupabase(
  supabase: SupabaseClient,
  user: User,
  snapshot: FestPlanerSnapshot,
) {
  const { data: festival, error: festivalError } = await supabase
    .from("festivals")
    .insert({
      owner_id: user.id,
      name: snapshot.festInfo.name,
      date_label: snapshot.festInfo.date,
      start_date: snapshot.festInfo.startDate || null,
      end_date: snapshot.festInfo.endDate || null,
      location: snapshot.festInfo.location,
      description: snapshot.festInfo.description,
      budget: snapshot.budget,
    })
    .select("id")
    .single();

  if (festivalError) throw festivalError;
  if (!festival?.id) throw new Error("Supabase hat keine Festival-ID zurückgegeben.");

  const festivalId = festival.id as string;
  await replaceFestivalChildren(supabase, festivalId, snapshot);

  return festivalId;
}

export async function loadLatestFestivalFromSupabase(
  supabase: SupabaseClient,
  user: User,
) {
  const { data: festival, error: festivalError } = await supabase
    .from("festivals")
    .select("id,name,date_label,start_date,end_date,location,description,budget")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<FestivalRow>();

  if (festivalError) throw festivalError;
  if (!festival) return null;

  const [
    daysResult,
    programResult,
    checklistResult,
    protocolsResult,
    shiftsResult,
    reservationsResult,
    financesResult,
  ] = await Promise.all([
    supabase
      .from("festival_days")
      .select("id,name,reservations_enabled,table_count,grid_cols,reservation_times,sort_order")
      .eq("festival_id", festival.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("program_items")
      .select("id,time_label,title,location,description,reservation_uses_tent_plan,reservation_table_limit,sort_order")
      .eq("festival_id", festival.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("checklist_items")
      .select("id,due_date,task,completed,assigned_to")
      .eq("festival_id", festival.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("protocols")
      .select("id,title,protocol_date,attendees,topics,decisions")
      .eq("festival_id", festival.id)
      .order("protocol_date", { ascending: true }),
    supabase
      .from("shifts")
      .select("id,day_label,time_label,role,needed,notes,shift_helpers(helper_name)")
      .eq("festival_id", festival.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("reservations")
      .select("id,table_id,table_ids,table_count,name,first_name,last_name,email,phone,guest_type,club_name,guests,date_label,time_label,status")
      .eq("festival_id", festival.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("financial_items")
      .select("id,type,category,description,amount,status,attachment_name,attachment_data")
      .eq("festival_id", festival.id)
      .order("created_at", { ascending: true }),
  ]);

  const results = [
    daysResult,
    programResult,
    checklistResult,
    protocolsResult,
    shiftsResult,
    reservationsResult,
    financesResult,
  ];
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;

  const snapshot: FestPlanerSnapshot = {
    festInfo: {
      name: festival.name,
      date: festival.date_label,
      startDate: festival.start_date ?? "",
      endDate: festival.end_date ?? "",
      location: festival.location,
      description: festival.description,
      daysConfig: (daysResult.data ?? []).map((day) => ({
        id: String(day.id),
        name: String(day.name),
        reservationsEnabled: Boolean(day.reservations_enabled),
        tableCount: Number(day.table_count),
        gridCols: Number(day.grid_cols),
        reservationTimes: Array.isArray(day.reservation_times)
          ? day.reservation_times.map((time) => String(time))
          : undefined,
      })),
    },
    program: (programResult.data ?? []).map((item) => ({
      id: String(item.id),
      time: String(item.time_label),
      title: String(item.title),
      location: String(item.location),
      description: String(item.description),
      reservationUsesTentPlan: item.reservation_uses_tent_plan !== false,
      reservationTableLimit: Number(item.reservation_table_limit ?? 16),
    })),
    checklist: (checklistResult.data ?? []).map((item) => ({
      id: String(item.id),
      dueDate: item.due_date ? String(item.due_date) : undefined,
      task: String(item.task),
      completed: Boolean(item.completed),
      assignedTo: item.assigned_to ? String(item.assigned_to) : undefined,
    })),
    protocols: (protocolsResult.data ?? []).map((item) => ({
      id: String(item.id),
      title: String(item.title),
      date: String(item.protocol_date),
      attendees: String(item.attendees),
      topics: String(item.topics),
      decisions: String(item.decisions),
    })),
    shifts: (shiftsResult.data ?? []).map((item) => ({
      id: String(item.id),
      day: String(item.day_label),
      time: String(item.time_label),
      role: String(item.role),
      needed: Number(item.needed),
      helpers: Array.isArray(item.shift_helpers)
        ? item.shift_helpers.map((helper) => String(helper.helper_name))
        : [],
      notes: item.notes ? String(item.notes) : undefined,
    })),
    reservations: (reservationsResult.data ?? []).map((item) => ({
      id: String(item.id),
      tableId: Number(item.table_id),
      tableIds: Array.isArray(item.table_ids)
        ? item.table_ids.map((tableId) => Number(tableId))
        : [Number(item.table_id)],
      tableCount: Number(item.table_count ?? 1),
      name: String(item.name),
      firstName: item.first_name ? String(item.first_name) : undefined,
      lastName: item.last_name ? String(item.last_name) : undefined,
      email: String(item.email),
      phone: item.phone ? String(item.phone) : undefined,
      guestType: item.guest_type === "club" ? "club" : "private",
      clubName: item.club_name ? String(item.club_name) : undefined,
      guests: Number(item.guests),
      date: String(item.date_label),
      time: String(item.time_label),
      status: mapReservationStatusToUi(String(item.status)),
    })),
    finances: (financesResult.data ?? []).map((item) => ({
      id: String(item.id),
      type: item.type === "revenue" ? "revenue" : "expense",
      category: String(item.category),
      description: String(item.description),
      amount: Number(item.amount),
      status: mapFinancialStatusToUi(String(item.status)),
      attachmentName: item.attachment_name ? String(item.attachment_name) : undefined,
      attachmentData: item.attachment_data ? String(item.attachment_data) : undefined,
    })),
    budget: Number(festival.budget),
  };

  return {
    festivalId: festival.id,
    snapshot,
  };
}
