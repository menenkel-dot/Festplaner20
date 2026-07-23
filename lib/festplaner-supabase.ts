import type { SupabaseClient, User } from "@supabase/supabase-js";
import type {
  ChecklistItem,
  ChecklistCategory,
  FinanceAccount,
  FestInfo,
  FestivalReservationField,
  FinancialItem,
  InvitationContact,
  ProgramItem,
  Protocol,
  Reservation,
  Shift,
} from "./festplaner-types";

export interface FestPlanerSnapshot {
  festInfo: FestInfo;
  program: ProgramItem[];
  checklist: ChecklistItem[];
  checklistCategories: ChecklistCategory[];
  protocols: Protocol[];
  invitations: InvitationContact[];
  shifts: Shift[];
  reservations: Reservation[];
  reservationFields: FestivalReservationField[];
  financeAccounts: FinanceAccount[];
  finances: FinancialItem[];
  budget: number;
}

export interface FinanceSnapshot {
  finances: FinancialItem[];
  financeAccounts: FinanceAccount[];
  budget: number;
}

export interface Club {
  id: string;
  name: string;
  slug: string;
  status: "active" | "inactive";
  logo_path?: string | null;
  logoUrl?: string;
}

export interface PublicLink {
  id: string;
  type: "helper_signup" | "guest_reservation";
  token: string;
  enabled: boolean;
}

interface FestivalRow {
  id: string;
  club_id: string;
  name: string;
  date_label: string;
  start_date: string | null;
  end_date: string | null;
  location: string;
  description: string;
  budget: number | string;
}

interface InvitationContactRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  club_name: string | null;
  address: string | null;
  status?: string | null;
  sent_at?: string | null;
  responded_at?: string | null;
  guest_count?: number | string | null;
  response_note?: string | null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getClubLogoUrl(path?: string | null) {
  if (!path || !process.env.NEXT_PUBLIC_SUPABASE_URL) return "";
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, "/");
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/club-logos/${encodedPath}`;
}

export async function loadUserClubsFromSupabase(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("clubs")
    .select("id,name,slug,status,logo_path")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((club) => ({
    id: String(club.id),
    name: String(club.name),
    slug: String(club.slug),
    status: club.status === "inactive" ? "inactive" : "active",
    logo_path: club.logo_path ? String(club.logo_path) : null,
    logoUrl: getClubLogoUrl(club.logo_path ? String(club.logo_path) : null),
  })) satisfies Club[];
}

export async function loadPublicLinksFromSupabase(supabase: SupabaseClient, clubId: string) {
  const { data, error } = await supabase
    .from("public_links")
    .select("id,type,token,enabled")
    .eq("club_id", clubId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((link) => ({
    id: String(link.id),
    type: link.type === "guest_reservation" ? "guest_reservation" : "helper_signup",
    token: String(link.token),
    enabled: Boolean(link.enabled),
  })) satisfies PublicLink[];
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

function isInvitationSchemaError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = String(candidate.code ?? "");
  const message = String(candidate.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    message.includes("invitation_contacts") ||
    message.includes("status") && message.includes("column")
  );
}

async function deleteInvitationContactsIfAvailable(supabase: SupabaseClient, festivalId: string) {
  const { error } = await supabase.from("invitation_contacts").delete().eq("festival_id", festivalId);
  if (!error) return true;
  if (isInvitationSchemaError(error)) return false;
  throw error;
}

async function insertInvitationContactsIfAvailable(
  supabase: SupabaseClient,
  festivalId: string,
  invitations: InvitationContact[],
) {
  if (invitations.length === 0) return;

  const baseRows = invitations.map((item) => ({
    festival_id: festivalId,
    email: item.email,
    first_name: item.firstName,
    last_name: item.lastName,
    club_name: item.clubName,
    address: item.address,
  }));

  const fullRows = invitations.map((item, index) => ({
    ...baseRows[index],
    status: item.status || "Nicht versendet",
    sent_at: item.sentAt || null,
    responded_at: item.respondedAt || null,
    guest_count: item.guestCount || null,
    response_note: item.responseNote || null,
  }));

  const fullInsert = await supabase.from("invitation_contacts").insert(fullRows);
  if (!fullInsert.error) return;
  if (!isInvitationSchemaError(fullInsert.error)) throw fullInsert.error;

  const baseInsert = await supabase.from("invitation_contacts").insert(baseRows);
  if (baseInsert.error && !isInvitationSchemaError(baseInsert.error)) throw baseInsert.error;
}

async function loadInvitationContactsFromSupabase(supabase: SupabaseClient, festivalId: string): Promise<InvitationContactRow[]> {
  const fullResult = await supabase
    .from("invitation_contacts")
    .select("id,email,first_name,last_name,club_name,address,status,sent_at,responded_at,guest_count,response_note")
    .eq("festival_id", festivalId)
    .order("created_at", { ascending: true });

  if (!fullResult.error) return fullResult.data ?? [];
  if (!isInvitationSchemaError(fullResult.error)) throw fullResult.error;

  const baseResult = await supabase
    .from("invitation_contacts")
    .select("id,email,first_name,last_name,club_name,address")
    .eq("festival_id", festivalId)
    .order("created_at", { ascending: true });

  if (!baseResult.error) return baseResult.data ?? [];
  if (isInvitationSchemaError(baseResult.error)) return [];
  throw baseResult.error;
}

async function replaceFestivalChildren(
  supabase: SupabaseClient,
  festivalId: string,
  snapshot: FestPlanerSnapshot,
) {
  await saveFestivalReservationFields(supabase, festivalId, snapshot.reservationFields ?? []);

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
    "festival_checklist_categories",
    "protocols",
    "shifts",
    "reservations",
    "financial_items",
  ];

  for (const table of childTables) {
    const { error } = await supabase.from(table).delete().eq("festival_id", festivalId);
    if (error) throw error;
  }

  const invitationContactsAvailable = await deleteInvitationContactsIfAvailable(supabase, festivalId);

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
        reservation_uses_tent_plan: item.reservationUsesTentPlan ?? false,
        reservation_table_limit: Math.max(1, item.reservationTableLimit ?? 16),
        sort_order: index,
      })),
    );
    if (error) throw error;
  }

  if ((snapshot.checklistCategories ?? []).length > 0) {
    const { error } = await supabase.from("festival_checklist_categories").insert(
      snapshot.checklistCategories.map((category, index) => ({
        id: category.id,
        festival_id: festivalId,
        name: category.name,
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
        category_id: item.categoryId || null,
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
        attachment_name: item.attachmentName || null,
        attachment_data: item.attachmentData || null,
      })),
    );
    if (error) throw error;
  }

  if (invitationContactsAvailable) {
    await insertInvitationContactsIfAvailable(supabase, festivalId, snapshot.invitations);
  }

  const shiftIdMap = new Map<string, string>();

  for (const shift of snapshot.shifts) {
    const { data, error } = await supabase
      .from("shifts")
      .insert({
        festival_id: festivalId,
        day_label: shift.day,
        time_label: shift.time,
        start_time: shift.startTime || null,
        end_time: shift.endTime || null,
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
        club_reservation_notes: item.clubReservationNotes || null,
        club_reservation_answers: item.clubReservationAnswers ?? [],
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
        ...(isUuid(item.id) ? { id: item.id } : {}),
        festival_id: festivalId,
        type: item.type,
        booking_date: item.bookingDate || new Date().toISOString().slice(0, 10),
        category: item.category,
        description: item.description,
        amount: item.amount,
        status: mapFinancialStatus(item.status),
        attachment_name: item.attachmentName || null,
        attachment_data: item.attachmentData || null,
      })),
    );
    if (error) throw error;

    const splits = snapshot.finances.flatMap((item) =>
      isUuid(item.id)
        ? (item.accountSplits ?? [])
            .filter((split) => isUuid(split.accountId) && split.amount > 0)
            .map((split) => ({
              financial_item_id: item.id,
              account_id: split.accountId,
              amount: split.amount,
            }))
        : [],
    );

    if (splits.length > 0) {
      const { error: splitError } = await supabase.from("financial_item_account_splits").insert(splits);
      if (splitError) throw splitError;
    }
  }
}

async function saveFestivalReservationFields(
  supabase: SupabaseClient,
  festivalId: string,
  fields: FestivalReservationField[],
) {
  const normalizedFields = fields.slice(0, 20).map((field, index) => ({
    id: field.id,
    festival_id: festivalId,
    label: field.label.trim(),
    field_type: field.fieldType,
    help_text: field.helpText?.trim() || null,
    required: field.required,
    sort_order: index,
  }));

  if (normalizedFields.length > 0) {
    const { data: existingFields, error: lookupError } = await supabase
      .from("festival_reservation_fields")
      .select("id")
      .eq("festival_id", festivalId);
    if (lookupError) throw lookupError;

    const { error: upsertError } = await supabase
      .from("festival_reservation_fields")
      .upsert(normalizedFields, { onConflict: "id" });
    if (upsertError) throw upsertError;

    const retainedIds = new Set(normalizedFields.map((field) => field.id));
    const staleIds = (existingFields ?? []).map((field) => String(field.id)).filter((id) => !retainedIds.has(id));
    if (staleIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("festival_reservation_fields")
        .delete()
        .in("id", staleIds);
      if (deleteError) throw deleteError;
    }
    return;
  }

  const { error } = await supabase
    .from("festival_reservation_fields")
    .delete()
    .eq("festival_id", festivalId);
  if (error) throw error;
}

async function saveFinanceAccountsToSupabase(
  supabase: SupabaseClient,
  clubId: string,
  accounts: FinanceAccount[],
) {
  if (accounts.length === 0) return;

  const { error } = await supabase.from("club_finance_accounts").upsert(
    accounts
      .filter((account) => isUuid(account.id) && account.name.trim())
      .map((account) => ({
        id: account.id,
        club_id: clubId,
        name: account.name.trim(),
        bank_name: account.bankName?.trim() || null,
        iban: account.iban?.trim() || null,
        description: account.description?.trim() || null,
        is_active: account.isActive,
      })),
    { onConflict: "id" },
  );

  if (error) throw error;
}

export async function saveActiveFestivalToSupabase(
  supabase: SupabaseClient,
  user: Pick<User, "id">,
  snapshot: FestPlanerSnapshot,
  clubId: string,
  festivalId?: string | null,
) {
  let activeFestivalId = festivalId;

  if (!activeFestivalId) {
    const { data: existing, error: existingError } = await supabase
      .from("festivals")
      .select("id")
      .eq("club_id", clubId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (existingError) throw existingError;
    activeFestivalId = existing?.id ?? null;
  }

  const festivalPayload = {
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
      .eq("id", activeFestivalId);

    if (error) throw error;
  } else {
    const { data: festival, error } = await supabase
      .from("festivals")
      .insert({
        owner_id: user.id,
        club_id: clubId,
        ...festivalPayload,
      })
      .select("id")
      .single();

    if (error) throw error;
    if (!festival?.id) throw new Error("Supabase hat keine Festival-ID zurückgegeben.");
    activeFestivalId = festival.id as string;
  }

  await saveFinanceAccountsToSupabase(supabase, clubId, snapshot.financeAccounts ?? []);
  await replaceFestivalChildren(supabase, activeFestivalId, snapshot);
  await ensurePublicLinksForFestival(supabase, clubId, activeFestivalId);
  return activeFestivalId;
}

async function ensurePublicLinksForFestival(supabase: SupabaseClient, clubId: string, festivalId: string) {
  for (const type of ["helper_signup", "guest_reservation"] as const) {
    const { data: existing, error: existingError } = await supabase
      .from("public_links")
      .select("id")
      .eq("festival_id", festivalId)
      .eq("type", type)
      .eq("enabled", true)
      .is("revoked_at", null)
      .maybeSingle<{ id: string }>();

    if (existingError) continue;
    if (existing) continue;

    const { error } = await supabase.from("public_links").insert({
      club_id: clubId,
      festival_id: festivalId,
      type,
    });
    if (error) continue;
  }
}

export async function saveFinancialItemsToSupabase(
  supabase: SupabaseClient,
  festivalId: string,
  clubId: string,
  snapshot: FinanceSnapshot,
) {
  const { error: budgetError } = await supabase
    .from("festivals")
    .update({ budget: snapshot.budget })
    .eq("id", festivalId);

  if (budgetError) throw budgetError;

  await saveFinanceAccountsToSupabase(supabase, clubId, snapshot.financeAccounts ?? []);

  const { error: deleteError } = await supabase
    .from("financial_items")
    .delete()
    .eq("festival_id", festivalId);

  if (deleteError) throw deleteError;

  if (snapshot.finances.length === 0) return;

  const { error: insertError } = await supabase.from("financial_items").insert(
    snapshot.finances.map((item) => ({
      ...(isUuid(item.id) ? { id: item.id } : {}),
      festival_id: festivalId,
      type: item.type,
      booking_date: item.bookingDate || new Date().toISOString().slice(0, 10),
      category: item.category,
      description: item.description,
      amount: item.amount,
      status: mapFinancialStatus(item.status),
      attachment_name: item.attachmentName || null,
      attachment_data: item.attachmentData || null,
    })),
  );

  if (insertError) throw insertError;

  const splits = snapshot.finances.flatMap((item) =>
    isUuid(item.id)
      ? (item.accountSplits ?? [])
          .filter((split) => isUuid(split.accountId) && split.amount > 0)
          .map((split) => ({
            financial_item_id: item.id,
            account_id: split.accountId,
            amount: split.amount,
          }))
      : [],
  );

  if (splits.length > 0) {
    const { error: splitError } = await supabase.from("financial_item_account_splits").insert(splits);
    if (splitError) throw splitError;
  }
}


export async function importSnapshotToSupabase(
  supabase: SupabaseClient,
  user: User,
  snapshot: FestPlanerSnapshot,
  clubId: string,
) {
  const { data: festival, error: festivalError } = await supabase
    .from("festivals")
    .insert({
      owner_id: user.id,
      club_id: clubId,
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
  await saveFinanceAccountsToSupabase(supabase, clubId, snapshot.financeAccounts ?? []);
  await replaceFestivalChildren(supabase, festivalId, snapshot);
  await ensurePublicLinksForFestival(supabase, clubId, festivalId);

  return festivalId;
}

export async function loadClubFestivalFromSupabase(
  supabase: SupabaseClient,
  clubId: string,
) {
  const { data: festival, error: festivalError } = await supabase
    .from("festivals")
    .select("id,club_id,name,date_label,start_date,end_date,location,description,budget")
    .eq("club_id", clubId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<FestivalRow>();

  if (festivalError) throw festivalError;
  if (!festival) return null;

  const { data: club } = await supabase
    .from("clubs")
    .select("logo_path")
    .eq("id", clubId)
    .maybeSingle<{ logo_path: string | null }>();

  const [
    daysResult,
    programResult,
    checklistResult,
    checklistCategoriesResult,
    protocolsResult,
    invitationsResult,
    shiftsResult,
    reservationsResult,
    reservationFieldsResult,
    financesResult,
    financeAccountsResult,
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
      .select("id,due_date,task,completed,assigned_to,category_id")
      .eq("festival_id", festival.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("festival_checklist_categories")
      .select("id,name,sort_order")
      .eq("festival_id", festival.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("protocols")
      .select("id,title,protocol_date,attendees,topics,decisions,attachment_name,attachment_data")
      .eq("festival_id", festival.id)
      .order("protocol_date", { ascending: true }),
    loadInvitationContactsFromSupabase(supabase, festival.id),
    supabase
      .from("shifts")
      .select("id,day_label,time_label,start_time,end_time,role,needed,notes,shift_helpers(helper_name)")
      .eq("festival_id", festival.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("reservations")
      .select("id,table_id,table_ids,table_count,name,first_name,last_name,email,phone,guest_type,club_name,club_reservation_notes,club_reservation_answers,guests,date_label,time_label,status")
      .eq("festival_id", festival.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("festival_reservation_fields")
      .select("id,label,field_type,help_text,required,sort_order")
      .eq("festival_id", festival.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("financial_items")
      .select("id,type,booking_date,category,description,amount,status,attachment_name,attachment_data")
      .eq("festival_id", festival.id)
      .order("booking_date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("club_finance_accounts")
      .select("id,name,bank_name,iban,description,is_active")
      .eq("club_id", clubId)
      .order("created_at", { ascending: true }),
  ]);

  const results = [
    daysResult,
    programResult,
    checklistResult,
    checklistCategoriesResult,
    protocolsResult,
    shiftsResult,
    reservationsResult,
    reservationFieldsResult,
    financesResult,
    financeAccountsResult,
  ];
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;

  const financeIds = (financesResult.data ?? []).map((item) => String(item.id));
  const financeSplitsResult = financeIds.length > 0
    ? await supabase
        .from("financial_item_account_splits")
        .select("financial_item_id,account_id,amount")
        .in("financial_item_id", financeIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };

  if (financeSplitsResult.error) throw financeSplitsResult.error;

  const splitsByFinanceId = new Map<string, { accountId: string; amount: number }[]>();
  for (const split of financeSplitsResult.data ?? []) {
    const financeId = String(split.financial_item_id);
    const existing = splitsByFinanceId.get(financeId) ?? [];
    existing.push({
      accountId: String(split.account_id),
      amount: Number(split.amount),
    });
    splitsByFinanceId.set(financeId, existing);
  }

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
      reservationUsesTentPlan: item.reservation_uses_tent_plan === true,
      reservationTableLimit: Number(item.reservation_table_limit ?? 16),
    })),
    checklist: (checklistResult.data ?? []).map((item) => ({
      id: String(item.id),
      dueDate: item.due_date ? String(item.due_date) : undefined,
      task: String(item.task),
      completed: Boolean(item.completed),
      assignedTo: item.assigned_to ? String(item.assigned_to) : undefined,
      categoryId: item.category_id ? String(item.category_id) : undefined,
    })),
    checklistCategories: (checklistCategoriesResult.data ?? []).map((category) => ({
      id: String(category.id),
      name: String(category.name),
      sortOrder: Number(category.sort_order),
    })),
    protocols: (protocolsResult.data ?? []).map((item) => ({
      id: String(item.id),
      title: String(item.title),
      date: String(item.protocol_date),
      attendees: String(item.attendees),
      topics: String(item.topics),
      decisions: String(item.decisions),
      attachmentName: item.attachment_name ? String(item.attachment_name) : undefined,
      attachmentData: item.attachment_data ? String(item.attachment_data) : undefined,
    })),
    invitations: (invitationsResult ?? []).map((item) => ({
      id: String(item.id),
      email: String(item.email),
      firstName: String(item.first_name ?? ""),
      lastName: String(item.last_name ?? ""),
      clubName: String(item.club_name ?? ""),
      address: String(item.address ?? ""),
      status: String(item.status ?? "Nicht versendet") as InvitationContact["status"],
      sentAt: item.sent_at ? String(item.sent_at) : undefined,
      respondedAt: item.responded_at ? String(item.responded_at) : undefined,
      guestCount: item.guest_count ? Number(item.guest_count) : undefined,
      responseNote: item.response_note ? String(item.response_note) : undefined,
    })),
    shifts: (shiftsResult.data ?? []).map((item) => ({
      id: String(item.id),
      day: String(item.day_label),
      time: String(item.time_label),
      startTime: item.start_time ? String(item.start_time).slice(0, 5) : undefined,
      endTime: item.end_time ? String(item.end_time).slice(0, 5) : undefined,
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
      clubReservationNotes: item.club_reservation_notes ? String(item.club_reservation_notes) : undefined,
      clubReservationAnswers: Array.isArray(item.club_reservation_answers)
        ? item.club_reservation_answers as Reservation["clubReservationAnswers"]
        : [],
      guests: Number(item.guests),
      date: String(item.date_label),
      time: String(item.time_label),
      status: mapReservationStatusToUi(String(item.status)),
    })),
    reservationFields: (reservationFieldsResult.data ?? []).map((field) => ({
      id: String(field.id),
      label: String(field.label),
      fieldType: field.field_type === "boolean" ? "boolean" : field.field_type === "number" ? "number" : "text",
      helpText: field.help_text ? String(field.help_text) : undefined,
      required: Boolean(field.required),
      sortOrder: Number(field.sort_order),
    })),
    financeAccounts: (financeAccountsResult.data ?? []).map((account) => ({
      id: String(account.id),
      name: String(account.name),
      bankName: account.bank_name ? String(account.bank_name) : undefined,
      iban: account.iban ? String(account.iban) : undefined,
      description: account.description ? String(account.description) : undefined,
      isActive: account.is_active !== false,
    })),
    finances: (financesResult.data ?? []).map((item) => ({
      id: String(item.id),
      type: item.type === "revenue" ? "revenue" : "expense",
      bookingDate: String(item.booking_date),
      category: String(item.category),
      description: String(item.description),
      amount: Number(item.amount),
      status: mapFinancialStatusToUi(String(item.status)),
      accountSplits: splitsByFinanceId.get(String(item.id)) ?? [],
      attachmentName: item.attachment_name ? String(item.attachment_name) : undefined,
      attachmentData: item.attachment_data ? String(item.attachment_data) : undefined,
    })),
    budget: Number(festival.budget),
  };

  return {
    festivalId: festival.id,
    clubId: festival.club_id,
    clubLogoUrl: getClubLogoUrl(club?.logo_path ?? null),
    snapshot,
  };
}
