'use client';

import * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  MoreHorizontal,
  Package,
  PackageX,
  Pencil,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteInventoryItemFromSupabase,
  deleteInventoryMovementFromSupabase,
  loadInventoryDataFromSupabase,
  saveInventoryItemToSupabase,
  saveInventoryMovementToSupabase,
} from "@/lib/festplaner-inventory";
import type {
  InventoryItem,
  InventoryMovement,
  InventoryMovementType,
} from "@/lib/festplaner-types";

export interface InventoryFestDay {
  label: string;
  date?: string;
}

interface InventoryPanelProps {
  supabase: SupabaseClient;
  festivalId: string | null;
  festDays: InventoryFestDay[];
  userId: string;
  onToast: (message: string, type?: "success" | "info" | "error") => void;
}

type InventoryStatusFilter = "all" | "low" | "out";

type SidePanel =
  | { kind: "item"; itemId?: string }
  | { kind: "movement"; itemId: string; movementType: InventoryMovementType }
  | { kind: "history"; itemId: string }
  | null;

const UNIT_SUGGESTIONS = ["Fass", "Kiste", "Flasche", "Stück", "kg", "Liter"];

const MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  count: "Bestand gezählt",
  receipt: "Lieferung",
  consumption: "Verbrauch",
};

const MOVEMENT_OPTIONS: Array<{
  type: InventoryMovementType;
  label: string;
  description: string;
  icon: typeof ArrowDownToLine;
}> = [
  { type: "receipt", label: "Lieferung", description: "Bestand erhöhen", icon: ArrowDownToLine },
  { type: "consumption", label: "Verbrauch", description: "Bestand reduzieren", icon: ArrowUpFromLine },
  { type: "count", label: "Zählung", description: "Bestand korrigieren", icon: Scale },
];

function createInventoryId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (Number(char) ^ Math.random() * 16 >> Number(char) / 4).toString(16),
  );
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 }).format(value);
}

function getDayKey(day: InventoryFestDay) {
  return day.date ? `date:${day.date}` : `label:${day.label}`;
}

function compareMovements(left: InventoryMovement, right: InventoryMovement) {
  const dateComparison = left.createdAt.localeCompare(right.createdAt);
  return dateComparison || left.id.localeCompare(right.id);
}

function calculateCurrentStock(movements: InventoryMovement[]) {
  let stock = 0;
  for (const movement of [...movements].sort(compareMovements)) {
    if (movement.type === "count") stock = movement.quantity;
    else if (movement.type === "receipt") stock += movement.quantity;
    else stock -= movement.quantity;
  }
  return stock;
}

function formatMovementDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  return String((error as { code?: unknown }).code ?? "");
}

function getInventoryErrorMessage(error: unknown, fallback: string) {
  const code = getErrorCode(error);
  if (code === "42501") return "Dir fehlt die Berechtigung für die Warenwirtschaft.";
  if (code === "42P01" || code === "PGRST205") return "Die Warenwirtschaft ist in Supabase noch nicht vollständig eingerichtet.";
  return fallback;
}

function InventoryStatusBadge({ item, stock }: { item: InventoryItem; stock: number }) {
  if (stock <= 0) {
    return <span className="inline-flex shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-rose-700">Nicht verfügbar</span>;
  }
  if (stock <= item.minimumStock) {
    return <span className="inline-flex shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-amber-700">Nachbestellen</span>;
  }
  return <span className="inline-flex shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-700">Ausreichend</span>;
}

export function InventoryPanel({
  supabase,
  festivalId,
  festDays,
  userId,
  onToast,
}: InventoryPanelProps) {
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [movements, setMovements] = React.useState<InventoryMovement[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [loadError, setLoadError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search);
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState<InventoryStatusFilter>("all");
  const [sidePanel, setSidePanel] = React.useState<SidePanel>(null);
  const [reloadVersion, setReloadVersion] = React.useState(0);
  const [deletingItemId, setDeletingItemId] = React.useState<string | null>(null);

  const [itemName, setItemName] = React.useState("");
  const [itemCategory, setItemCategory] = React.useState("");
  const [itemUnit, setItemUnit] = React.useState("");
  const [itemMinimumStock, setItemMinimumStock] = React.useState("0");
  const [itemNotes, setItemNotes] = React.useState("");
  const [itemInitialStock, setItemInitialStock] = React.useState("");
  const [itemInitialDayKey, setItemInitialDayKey] = React.useState("");

  const [movementQuantity, setMovementQuantity] = React.useState("");
  const [movementDayKey, setMovementDayKey] = React.useState("");
  const [movementNote, setMovementNote] = React.useState("");

  React.useEffect(() => {
    if (!sidePanel) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidePanel(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidePanel]);

  React.useEffect(() => {
    let active = true;
    const loadingTimer = window.setTimeout(() => {
      if (!active) return;
      setLoading(true);
      setLoadError("");
      setSidePanel(null);
      setItems([]);
      setMovements([]);

      if (!festivalId) {
        setItems([]);
        setMovements([]);
        setLoading(false);
        return;
      }

      void loadInventoryDataFromSupabase(supabase, festivalId)
        .then((data) => {
          if (!active) return;
          setItems(data.items);
          setMovements(data.movements);
        })
        .catch((error) => {
          if (!active) return;
          console.error("Inventory load failed", error);
          setLoadError(getInventoryErrorMessage(error, "Die Warenwirtschaft konnte nicht geladen werden."));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(loadingTimer);
    };
  }, [festivalId, reloadVersion, supabase]);

  const movementsByItem = React.useMemo(() => {
    const grouped = new Map<string, InventoryMovement[]>();
    for (const movement of movements) {
      const current = grouped.get(movement.itemId) ?? [];
      current.push(movement);
      grouped.set(movement.itemId, current);
    }
    return grouped;
  }, [movements]);

  const metricsByItem = React.useMemo(() => {
    const metrics = new Map<string, { stock: number }>();
    for (const item of items) {
      const itemMovements = movementsByItem.get(item.id) ?? [];
      metrics.set(item.id, {
        stock: calculateCurrentStock(itemMovements),
      });
    }
    return metrics;
  }, [items, movementsByItem]);

  const categories = React.useMemo(() => Array.from(new Set(
    items.map((item) => item.category.trim()).filter(Boolean),
  )).sort((left, right) => left.localeCompare(right, "de", { sensitivity: "base" })), [items]);

  const visibleItems = React.useMemo(() => {
    const query = deferredSearch.trim().toLocaleLowerCase("de");
    return items.filter((item) => {
      const metrics = metricsByItem.get(item.id) ?? { stock: 0 };
      const matchesSearch = !query || [item.name, item.category, item.unit, item.notes]
        .some((value) => value.toLocaleLowerCase("de").includes(query));
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
      const matchesStatus = (
        statusFilter === "all"
        || statusFilter === "out" && metrics.stock <= 0
        || statusFilter === "low" && metrics.stock > 0 && metrics.stock <= item.minimumStock
      );
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [categoryFilter, deferredSearch, items, metricsByItem, statusFilter]);

  const outOfStockCount = items.filter((item) => (metricsByItem.get(item.id)?.stock ?? 0) <= 0).length;
  const lowStockCount = items.filter((item) => {
    const stock = metricsByItem.get(item.id)?.stock ?? 0;
    return stock > 0 && stock <= item.minimumStock;
  }).length;
  const panelItem = sidePanel && "itemId" in sidePanel
    ? items.find((item) => item.id === sidePanel.itemId)
    : undefined;
  const panelCurrentStock = panelItem ? metricsByItem.get(panelItem.id)?.stock ?? 0 : 0;
  const enteredMovementQuantity = Number(movementQuantity);
  const panelProjectedStock = sidePanel?.kind === "movement" && movementQuantity !== "" && Number.isFinite(enteredMovementQuantity)
    ? sidePanel.movementType === "count"
      ? enteredMovementQuantity
      : sidePanel.movementType === "receipt"
        ? panelCurrentStock + enteredMovementQuantity
        : panelCurrentStock - enteredMovementQuantity
    : panelCurrentStock;

  const resetItemForm = () => {
    setItemName("");
    setItemCategory("");
    setItemUnit("");
    setItemMinimumStock("0");
    setItemNotes("");
    setItemInitialStock("");
    setItemInitialDayKey(festDays[0] ? getDayKey(festDays[0]) : "");
  };

  const openNewItemForm = () => {
    resetItemForm();
    setSidePanel({ kind: "item" });
  };

  const openEditItemForm = (item: InventoryItem) => {
    setItemName(item.name);
    setItemCategory(item.category);
    setItemUnit(item.unit);
    setItemMinimumStock(String(item.minimumStock));
    setItemNotes(item.notes);
    setItemInitialStock("");
    setItemInitialDayKey(festDays[0] ? getDayKey(festDays[0]) : "");
    setSidePanel({ kind: "item", itemId: item.id });
  };

  const openMovementForm = (item: InventoryItem) => {
    setMovementQuantity("");
    setMovementNote("");
    setMovementDayKey(festDays[0] ? getDayKey(festDays[0]) : "");
    setSidePanel({ kind: "movement", itemId: item.id, movementType: "receipt" });
  };

  const selectMovementType = (movementType: InventoryMovementType) => {
    setMovementQuantity("");
    setSidePanel((current) => current?.kind === "movement" ? { ...current, movementType } : current);
  };

  const resolveDay = (key: string) => festDays.find((day) => getDayKey(day) === key);

  const handleSaveItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!festivalId) return;

    const name = itemName.trim();
    const unit = itemUnit.trim();
    const minimumStock = Number(itemMinimumStock);
    if (!name || !unit) {
      onToast("Bitte Artikelname und Einheit eingeben.", "error");
      return;
    }
    if (!Number.isFinite(minimumStock) || minimumStock < 0) {
      onToast("Der Mindestbestand muss mindestens 0 sein.", "error");
      return;
    }

    const editingId = sidePanel?.kind === "item" ? sidePanel.itemId : undefined;
    const item: InventoryItem = {
      id: editingId ?? createInventoryId(),
      festivalId,
      name,
      category: itemCategory.trim(),
      unit,
      minimumStock,
      notes: itemNotes.trim(),
      isActive: true,
    };

    setSaving(true);
    try {
      const savedItem = await saveInventoryItemToSupabase(supabase, item);
      setItems((current) => {
        const next = current.some((entry) => entry.id === savedItem.id)
          ? current.map((entry) => entry.id === savedItem.id ? savedItem : entry)
          : [...current, savedItem];
        return next.toSorted((left, right) => left.name.localeCompare(right.name, "de", { sensitivity: "base" }));
      });

      let openingStockFailed = false;
      if (!editingId && itemInitialStock !== "") {
        const initialStock = Number(itemInitialStock);
        const day = resolveDay(itemInitialDayKey);
        if (!Number.isFinite(initialStock) || initialStock < 0 || !day) {
          openingStockFailed = true;
        } else {
          try {
            const movement = await saveInventoryMovementToSupabase(supabase, {
              id: createInventoryId(),
              festivalId,
              itemId: savedItem.id,
              dayDate: day.date,
              dayLabel: day.label,
              type: "count",
              quantity: initialStock,
              note: "Startbestand",
              createdBy: userId,
            });
            setMovements((current) => [...current, movement]);
          } catch (error) {
            console.error("Initial inventory count save failed", error);
            openingStockFailed = true;
          }
        }
      }

      setSidePanel(null);
      onToast(
        openingStockFailed
          ? "Artikel angelegt, der Startbestand konnte jedoch nicht gespeichert werden."
          : editingId ? "Artikel aktualisiert." : "Artikel angelegt.",
        openingStockFailed ? "error" : "success",
      );
    } catch (error) {
      console.error("Inventory item save failed", error);
      onToast(
        getErrorCode(error) === "23505"
          ? "Ein aktiver Artikel mit diesem Namen und dieser Einheit existiert bereits."
          : getInventoryErrorMessage(error, "Artikel konnte nicht gespeichert werden."),
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMovement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!festivalId || sidePanel?.kind !== "movement") return;

    const quantity = Number(movementQuantity);
    const day = resolveDay(movementDayKey);
    const isValidQuantity = sidePanel.movementType === "count" ? quantity >= 0 : quantity > 0;
    if (!Number.isFinite(quantity) || !isValidQuantity) {
      onToast(sidePanel.movementType === "count" ? "Der Zählstand muss mindestens 0 sein." : "Die Menge muss größer als 0 sein.", "error");
      return;
    }
    if (!day) {
      onToast("Bitte einen Festtag auswählen.", "error");
      return;
    }
    const currentStock = metricsByItem.get(sidePanel.itemId)?.stock ?? 0;
    if (sidePanel.movementType === "consumption" && quantity > currentStock) {
      onToast(`Der Verbrauch übersteigt den aktuellen Bestand von ${formatQuantity(currentStock)}.`, "error");
      return;
    }

    setSaving(true);
    try {
      const movement = await saveInventoryMovementToSupabase(supabase, {
        id: createInventoryId(),
        festivalId,
        itemId: sidePanel.itemId,
        dayDate: day.date,
        dayLabel: day.label,
        type: sidePanel.movementType,
        quantity,
        note: movementNote,
        createdBy: userId,
      });
      setMovements((current) => [...current, movement]);
      setSidePanel({ kind: "history", itemId: sidePanel.itemId });
      onToast(`${MOVEMENT_LABELS[sidePanel.movementType]} gespeichert.`, "success");
    } catch (error) {
      console.error("Inventory movement save failed", error);
      onToast(getInventoryErrorMessage(error, "Warenbewegung konnte nicht gespeichert werden."), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (item: InventoryItem) => {
    if (!festivalId || deletingItemId) return;
    const confirmed = window.confirm(
      `Artikel „${item.name}“ wirklich löschen?\n\nAlle Lieferungen, Verbräuche und Zählungen dieses Artikels werden ebenfalls gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`,
    );
    if (!confirmed) return;

    setDeletingItemId(item.id);
    try {
      await deleteInventoryItemFromSupabase(supabase, festivalId, item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setMovements((current) => current.filter((entry) => entry.itemId !== item.id));
      setSidePanel((current) => current && "itemId" in current && current.itemId === item.id ? null : current);
      onToast("Artikel und zugehörige Buchungen wurden gelöscht.", "success");
    } catch (error) {
      console.error("Inventory item delete failed", error);
      onToast(getInventoryErrorMessage(error, "Artikel konnte nicht gelöscht werden."), "error");
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleDeleteMovement = async (movement: InventoryMovement) => {
    if (!festivalId || !window.confirm(`${MOVEMENT_LABELS[movement.type]} mit ${formatQuantity(movement.quantity)} löschen?`)) return;

    try {
      await deleteInventoryMovementFromSupabase(supabase, festivalId, movement.id);
      setMovements((current) => current.filter((entry) => entry.id !== movement.id));
      onToast("Warenbewegung gelöscht.", "info");
    } catch (error) {
      console.error("Inventory movement delete failed", error);
      onToast(getInventoryErrorMessage(error, "Warenbewegung konnte nicht gelöscht werden."), "error");
    }
  };

  if (!festivalId) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
        <Package className="mx-auto h-8 w-8 text-amber-500" />
        <h2 className="mt-3 text-sm font-bold text-amber-900">Noch kein Fest angelegt</h2>
        <p className="mt-1 text-xs text-amber-800">Lege zuerst im Fest-Programm ein Fest an. Danach kann die Warenwirtschaft verwendet werden.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Warenwirtschaft</h2>
              <p className="text-xs text-slate-500">Lieferungen, Verbräuche und Zählstände je Festtag.</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={openNewItemForm}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          Artikel anlegen
        </button>
      </div>

      {loadError && (
        <div className="flex flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 sm:flex-row sm:items-center sm:justify-between">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => setReloadVersion((current) => current + 1)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-rose-700 hover:bg-rose-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Erneut laden
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          aria-pressed={statusFilter === "low"}
          onClick={() => setStatusFilter((current) => current === "low" ? "all" : "low")}
          className={`flex items-center justify-between rounded-lg border p-5 text-left shadow-sm transition-colors ${statusFilter === "low" ? "border-amber-500 bg-amber-100 ring-2 ring-amber-500/20" : "border-amber-200 bg-amber-50 hover:bg-amber-100/70"}`}
        >
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-amber-700">Nachbestellen</span>
            <strong className="mt-1 block text-2xl text-amber-900">{lowStockCount}</strong>
          </div>
          <AlertTriangle className="h-6 w-6 text-amber-600" />
        </button>
        <button
          type="button"
          aria-pressed={statusFilter === "out"}
          onClick={() => setStatusFilter((current) => current === "out" ? "all" : "out")}
          className={`flex items-center justify-between rounded-lg border p-5 text-left shadow-sm transition-colors ${statusFilter === "out" ? "border-rose-500 bg-rose-100 ring-2 ring-rose-500/20" : "border-rose-200 bg-rose-50 hover:bg-rose-100/70"}`}
        >
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-rose-700">Nicht verfügbar</span>
            <strong className="mt-1 block text-2xl text-rose-900">{outOfStockCount}</strong>
          </div>
          <PackageX className="h-6 w-6 text-rose-600" />
        </button>
      </div>

      {sidePanel && (
        <button
          type="button"
          aria-label="Erfassung schließen"
          onClick={() => setSidePanel(null)}
          className="fixed inset-0 z-40 bg-slate-950/45 xl:hidden"
        />
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:col-span-8">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Artikel und Bestände</h3>
              <p className="mt-1 text-xs text-slate-500">Sieh den aktuellen Bestand und buche Änderungen über eine zentrale Aktion.</p>
            </div>
            {(search || categoryFilter !== "all" || statusFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCategoryFilter("all");
                  setStatusFilter("all");
                }}
                className="mt-2 inline-flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-100 hover:text-slate-800 sm:mt-0"
              >
                <X className="h-3.5 w-3.5" />
                Filter zurücksetzen
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <label className="relative">
              <span className="sr-only">Artikel durchsuchen</span>
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Artikel durchsuchen"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </label>
            <label>
              <span className="sr-only">Kategorie filtern</span>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600">
                <option value="all">Alle Kategorien</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Bestandsstatus filtern</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as InventoryStatusFilter)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600">
                <option value="all">Alle Artikel</option>
                <option value="low">Nachbestellen</option>
                <option value="out">Nicht verfügbar</option>
              </select>
            </label>
          </div>

          <div className="hidden lg:block">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <th className="py-2 pr-3">Artikel</th>
                  <th className="py-2 pr-3">Aktueller Bestand</th>
                  <th className="py-2 pr-3">Mindestbestand</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleItems.map((item) => {
                  const metrics = metricsByItem.get(item.id) ?? { stock: 0 };
                  return (
                    <tr key={item.id} className="align-top hover:bg-slate-50/70">
                      <td className="py-3 pr-3">
                        <p className="font-bold text-slate-800">{item.name}</p>
                        <p className="mt-0.5 text-[10px] text-slate-500">{item.category || "Ohne Kategorie"} · {item.unit}</p>
                      </td>
                      <td className="py-3 pr-3 text-sm font-bold text-slate-900">{formatQuantity(metrics.stock)} {item.unit}</td>
                      <td className="py-3 pr-3 text-slate-600">{formatQuantity(item.minimumStock)} {item.unit}</td>
                      <td className="py-3 pr-3">
                        <InventoryStatusBadge item={item} stock={metrics.stock} />
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button type="button" onClick={() => openMovementForm(item)} className="rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-slate-800">
                            Bestand ändern
                          </button>
                          <details className="relative text-left">
                            <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Weitere Aktionen für {item.name}</span>
                            </summary>
                            <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                              <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setSidePanel({ kind: "history", itemId: item.id }); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                <History className="h-4 w-4" /> Verlauf anzeigen
                              </button>
                              <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); openEditItemForm(item); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                <Pencil className="h-4 w-4" /> Artikel bearbeiten
                              </button>
                              <button type="button" disabled={deletingItemId === item.id} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void handleDeleteItem(item); }} className="mt-1 flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50">
                                <Trash2 className="h-4 w-4" /> {deletingItemId === item.id ? "Wird gelöscht ..." : "Artikel löschen"}
                              </button>
                            </div>
                          </details>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 lg:hidden">
            {visibleItems.map((item) => {
              const metrics = metricsByItem.get(item.id) ?? { stock: 0 };
              return (
                <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-bold text-slate-900">{item.name}</h4>
                      <p className="mt-1 text-[10px] font-semibold text-slate-500">{item.category || "Ohne Kategorie"} · {item.unit}</p>
                    </div>
                    <InventoryStatusBadge item={item} stock={metrics.stock} />
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-4 rounded-lg bg-slate-50 p-3">
                    <div>
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">Aktueller Bestand</span>
                      <strong className="mt-1 block text-xl text-slate-900">{formatQuantity(metrics.stock)} <span className="text-sm font-semibold text-slate-500">{item.unit}</span></strong>
                    </div>
                    <p className="text-right text-[10px] font-semibold text-slate-500">Mindestbestand<br /><span className="text-xs text-slate-700">{formatQuantity(item.minimumStock)} {item.unit}</span></p>
                  </div>

                  <button type="button" onClick={() => openMovementForm(item)} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-slate-900 px-4 text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-800">
                    Bestand ändern
                  </button>

                  <details className="mt-2 rounded-lg border border-slate-200">
                    <summary className="flex min-h-10 cursor-pointer list-none items-center justify-center gap-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                      <MoreHorizontal className="h-4 w-4" /> Weitere Aktionen
                    </summary>
                    <div className="grid gap-1 border-t border-slate-200 p-2">
                      <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setSidePanel({ kind: "history", itemId: item.id }); }} className="flex min-h-10 items-center gap-2 rounded-md px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><History className="h-4 w-4" /> Verlauf anzeigen</button>
                      <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); openEditItemForm(item); }} className="flex min-h-10 items-center gap-2 rounded-md px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Pencil className="h-4 w-4" /> Artikel bearbeiten</button>
                      <button type="button" disabled={deletingItemId === item.id} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void handleDeleteItem(item); }} className="flex min-h-10 items-center gap-2 border-t border-slate-100 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50"><Trash2 className="h-4 w-4" /> {deletingItemId === item.id ? "Wird gelöscht ..." : "Artikel löschen"}</button>
                    </div>
                  </details>
                </article>
              );
            })}
          </div>

          {(loading || visibleItems.length === 0) && (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-xs font-semibold text-slate-500">
              {loading ? "Warenwirtschaft wird geladen ..." : items.length === 0 ? "Noch keine Artikel vorhanden." : "Keine Artikel für diesen Filter gefunden."}
            </div>
          )}
        </section>

        <aside
          aria-label="Warenwirtschaft erfassen"
          className={`${sidePanel ? "fixed inset-x-3 bottom-3 top-16 z-50 block overflow-y-auto" : "hidden"} rounded-lg border border-slate-200 bg-white p-5 shadow-2xl sm:inset-x-6 sm:p-6 xl:sticky xl:inset-auto xl:top-24 xl:z-auto xl:col-span-4 xl:block xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:shadow-sm`}
        >
          {!sidePanel ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 p-6 text-center">
              <Package className="h-8 w-8 text-slate-300" />
              <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-500">Bestand verwalten</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">Wähle bei einem Artikel „Bestand ändern“, um eine Lieferung, einen Verbrauch oder eine Zählung zu buchen.</p>
              <button type="button" onClick={openNewItemForm} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50">
                <Plus className="h-3.5 w-3.5" />Artikel anlegen
              </button>
            </div>
          ) : sidePanel.kind === "item" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{sidePanel.itemId ? "Artikel bearbeiten" : "Artikel anlegen"}</h3>
                <button type="button" onClick={() => setSidePanel(null)} aria-label="Formular schließen" className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
              </div>
              <form onSubmit={handleSaveItem} className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Artikelname *</span>
                  <input type="text" value={itemName} onChange={(event) => setItemName(event.target.value)} maxLength={120} placeholder="z. B. Bier 50 l" autoFocus className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Kategorie</span>
                    <input type="text" value={itemCategory} onChange={(event) => setItemCategory(event.target.value)} maxLength={120} placeholder="Getränke" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600" />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Einheit *</span>
                    <input type="text" list="inventory-unit-suggestions" value={itemUnit} onChange={(event) => setItemUnit(event.target.value)} maxLength={40} placeholder="Fass" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600" />
                    <datalist id="inventory-unit-suggestions">{UNIT_SUGGESTIONS.map((unit) => <option key={unit} value={unit} />)}</datalist>
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Mindestbestand</span>
                  <input type="number" min={0} step="0.001" value={itemMinimumStock} onChange={(event) => setItemMinimumStock(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600" />
                </label>
                {!sidePanel.itemId && (
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                    <label className="block space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Startbestand</span>
                      <input type="number" min={0} step="0.001" value={itemInitialStock} onChange={(event) => setItemInitialStock(event.target.value)} placeholder="Optional" disabled={festDays.length === 0} className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 disabled:bg-slate-100" />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Festtag</span>
                      <select value={itemInitialDayKey} onChange={(event) => setItemInitialDayKey(event.target.value)} disabled={festDays.length === 0} className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 disabled:bg-slate-100">
                        {festDays.map((day) => <option key={getDayKey(day)} value={getDayKey(day)}>{day.label}</option>)}
                      </select>
                    </label>
                  </div>
                )}
                <label className="block space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Notiz</span>
                  <textarea value={itemNotes} onChange={(event) => setItemNotes(event.target.value)} maxLength={1000} rows={3} placeholder="Optionale Hinweise zum Artikel" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600" />
                </label>
                <button type="submit" disabled={saving || !itemName.trim() || !itemUnit.trim()} className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold uppercase text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                  {saving ? "Wird gespeichert ..." : sidePanel.itemId ? "Artikel speichern" : "Artikel anlegen"}
                </button>
              </form>
            </div>
          ) : sidePanel.kind === "movement" && panelItem ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Bestand ändern</h3>
                  <p className="mt-1 text-sm font-bold text-slate-900">{panelItem.name}</p>
                </div>
                <button type="button" onClick={() => setSidePanel(null)} aria-label="Formular schließen" className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
              </div>
              {festDays.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800">Lege zuerst Festtage im Fest-Programm an.</div>
              ) : (
                <form onSubmit={handleSaveMovement} className="space-y-3">
                  <fieldset className="space-y-2">
                    <legend className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Was möchtest du buchen?</legend>
                    <div className="grid gap-2">
                      {MOVEMENT_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        const selected = sidePanel.movementType === option.type;
                        const disabled = option.type === "consumption" && panelCurrentStock <= 0;
                        return (
                          <button
                            key={option.type}
                            type="button"
                            aria-pressed={selected}
                            disabled={disabled}
                            onClick={() => selectMovementType(option.type)}
                            className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${selected ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-slate-200 bg-white hover:bg-slate-50"} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-50`}
                          >
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}><Icon className="h-4 w-4" /></span>
                            <span>
                              <strong className="block text-xs text-slate-900">{option.label}</strong>
                              <span className="mt-0.5 block text-[10px] text-slate-500">{disabled ? "Kein Bestand vorhanden" : option.description}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  <label className="block space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Festtag *</span>
                    <select value={movementDayKey} onChange={(event) => setMovementDayKey(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600">
                      {festDays.map((day) => <option key={getDayKey(day)} value={getDayKey(day)}>{day.label}</option>)}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{sidePanel.movementType === "count" ? "Gezählter Bestand" : "Menge"} ({panelItem.unit}) *</span>
                    <input type="number" min={sidePanel.movementType === "count" ? 0 : 0.001} step="0.001" value={movementQuantity} onChange={(event) => setMovementQuantity(event.target.value)} autoFocus className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600" />
                  </label>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Aktuell</span>
                      <strong className="mt-1 block text-sm text-slate-900">{formatQuantity(panelCurrentStock)} {panelItem.unit}</strong>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Danach</span>
                      <strong className={`mt-1 block text-sm ${panelProjectedStock < 0 ? "text-rose-700" : "text-slate-900"}`}>{formatQuantity(panelProjectedStock)} {panelItem.unit}</strong>
                    </div>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Notiz</span>
                    <textarea value={movementNote} onChange={(event) => setMovementNote(event.target.value)} maxLength={1000} rows={3} placeholder="Optional, z. B. Lieferant oder Grund" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600" />
                  </label>
                  <button type="submit" disabled={saving || movementQuantity === "" || !movementDayKey} className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold uppercase text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                    {saving ? "Wird gespeichert ..." : "Buchung speichern"}
                  </button>
                </form>
              )}
            </div>
          ) : sidePanel.kind === "history" && panelItem ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Bewegungsverlauf</h3>
                  <p className="mt-1 text-sm font-bold text-slate-900">{panelItem.name}</p>
                </div>
                <button type="button" onClick={() => setSidePanel(null)} aria-label="Verlauf schließen" className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Aktueller Bestand</span>
                <strong className="mt-1 block text-xl text-slate-900">{formatQuantity(metricsByItem.get(panelItem.id)?.stock ?? 0)} {panelItem.unit}</strong>
              </div>
              <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {[...(movementsByItem.get(panelItem.id) ?? [])].sort((left, right) => compareMovements(right, left)).map((movement) => (
                  <div key={movement.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={`text-xs font-bold ${movement.type === "receipt" ? "text-emerald-700" : movement.type === "consumption" ? "text-rose-700" : "text-blue-700"}`}>
                          {MOVEMENT_LABELS[movement.type]} · {movement.type === "receipt" ? "+" : movement.type === "consumption" ? "−" : ""}{formatQuantity(movement.quantity)} {panelItem.unit}
                        </p>
                        <p className="mt-1 text-[10px] font-semibold text-slate-500">{movement.dayLabel} · {formatMovementDate(movement.createdAt)}</p>
                        {movement.note && <p className="mt-2 text-[11px] leading-relaxed text-slate-600">{movement.note}</p>}
                      </div>
                      <button type="button" onClick={() => handleDeleteMovement(movement)} title="Bewegung löschen" aria-label={`${MOVEMENT_LABELS[movement.type]} löschen`} className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
                {(movementsByItem.get(panelItem.id) ?? []).length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">Noch keine Bewegungen vorhanden.</div>
                )}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
