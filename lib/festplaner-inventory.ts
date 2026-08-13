import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InventoryItem,
  InventoryMovement,
  InventoryMovementType,
} from "./festplaner-types";

export interface InventoryData {
  items: InventoryItem[];
  movements: InventoryMovement[];
}

interface SaveInventoryMovementInput {
  id: string;
  festivalId: string;
  itemId: string;
  dayDate?: string;
  dayLabel: string;
  type: InventoryMovementType;
  quantity: number;
  note?: string;
  createdBy: string;
}

function mapInventoryItem(row: Record<string, unknown>): InventoryItem {
  return {
    id: String(row.id),
    festivalId: String(row.festival_id),
    name: String(row.name ?? ""),
    category: String(row.category ?? ""),
    unit: String(row.unit ?? ""),
    minimumStock: Number(row.minimum_stock ?? 0),
    notes: String(row.notes ?? ""),
    isActive: row.is_active !== false,
  };
}

function mapInventoryMovement(row: Record<string, unknown>): InventoryMovement {
  const type = String(row.movement_type);
  return {
    id: String(row.id),
    festivalId: String(row.festival_id),
    itemId: String(row.item_id),
    dayDate: row.day_date ? String(row.day_date) : undefined,
    dayLabel: String(row.day_label ?? ""),
    type: type === "count" || type === "receipt" ? type : "consumption",
    quantity: Number(row.quantity ?? 0),
    note: row.note ? String(row.note) : undefined,
    createdBy: row.created_by ? String(row.created_by) : undefined,
    createdAt: String(row.created_at),
  };
}

export async function loadInventoryDataFromSupabase(
  supabase: SupabaseClient,
  festivalId: string,
): Promise<InventoryData> {
  const [itemsResult, movementsResult] = await Promise.all([
    supabase
      .from("festival_inventory_items")
      .select("id,festival_id,name,category,unit,minimum_stock,notes,is_active")
      .eq("festival_id", festivalId)
      .order("is_active", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("festival_inventory_movements")
      .select("id,festival_id,item_id,day_date,day_label,movement_type,quantity,note,created_by,created_at")
      .eq("festival_id", festivalId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (itemsResult.error) throw itemsResult.error;
  if (movementsResult.error) throw movementsResult.error;

  return {
    items: (itemsResult.data ?? []).map((row) => mapInventoryItem(row)),
    movements: (movementsResult.data ?? []).map((row) => mapInventoryMovement(row)),
  };
}

export async function saveInventoryItemToSupabase(
  supabase: SupabaseClient,
  item: InventoryItem,
) {
  const { data, error } = await supabase
    .from("festival_inventory_items")
    .upsert({
      id: item.id,
      festival_id: item.festivalId,
      name: item.name.trim(),
      category: item.category.trim(),
      unit: item.unit.trim(),
      minimum_stock: item.minimumStock,
      notes: item.notes.trim(),
      is_active: item.isActive,
    }, { onConflict: "id" })
    .select("id,festival_id,name,category,unit,minimum_stock,notes,is_active")
    .single();

  if (error) throw error;
  return mapInventoryItem(data);
}

export async function deleteInventoryItemFromSupabase(
  supabase: SupabaseClient,
  festivalId: string,
  itemId: string,
) {
  const { data, error } = await supabase
    .from("festival_inventory_items")
    .delete()
    .eq("festival_id", festivalId)
    .eq("id", itemId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Artikel wurde nicht gefunden oder darf nicht gelöscht werden.");
}

export async function saveInventoryMovementToSupabase(
  supabase: SupabaseClient,
  input: SaveInventoryMovementInput,
) {
  const { data, error } = await supabase
    .from("festival_inventory_movements")
    .insert({
      id: input.id,
      festival_id: input.festivalId,
      item_id: input.itemId,
      day_date: input.dayDate || null,
      day_label: input.dayLabel.trim(),
      movement_type: input.type,
      quantity: input.quantity,
      note: input.note?.trim() || null,
      created_by: input.createdBy,
    })
    .select("id,festival_id,item_id,day_date,day_label,movement_type,quantity,note,created_by,created_at")
    .single();

  if (error) throw error;
  return mapInventoryMovement(data);
}

export async function deleteInventoryMovementFromSupabase(
  supabase: SupabaseClient,
  festivalId: string,
  movementId: string,
) {
  const { error } = await supabase
    .from("festival_inventory_movements")
    .delete()
    .eq("festival_id", festivalId)
    .eq("id", movementId);

  if (error) throw error;
}
