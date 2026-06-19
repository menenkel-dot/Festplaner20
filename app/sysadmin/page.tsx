'use client';

import * as React from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Building2, LogIn, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

interface ClubRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  logo_path?: string | null;
  logoUrl?: string;
  created_at: string;
}

interface MembershipRow {
  club_id: string;
  user_id: string;
  profile?: {
    email?: string;
    full_name?: string;
  } | null;
  role?: {
    name?: string;
  } | null;
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message);
  return "Unbekannter Fehler";
};

export default function SysAdminPage() {
  const supabase = React.useMemo(() => {
    try {
      return isSupabaseConfigured() ? createClient() : null;
    } catch (error) {
      console.error("Supabase client setup failed", error);
      return null;
    }
  }, []);

  const [user, setUser] = React.useState<User | null>(null);
  const [authReady, setAuthReady] = React.useState(() => !isSupabaseConfigured());
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [authLoading, setAuthLoading] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [clubs, setClubs] = React.useState<ClubRow[]>([]);
  const [memberships, setMemberships] = React.useState<MembershipRow[]>([]);
  const [clubName, setClubName] = React.useState("");
  const [adminFullName, setAdminFullName] = React.useState("");
  const [adminEmail, setAdminEmail] = React.useState("");
  const [adminPassword, setAdminPassword] = React.useState("");
  const [deleteConfirmByClub, setDeleteConfirmByClub] = React.useState<Record<string, string>>({});
  const [clubSearch, setClubSearch] = React.useState("");

  const loadData = React.useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("sysadmin-clubs", {
        body: { action: "list" },
      });
      if (error) throw error;
      setClubs(Array.isArray(data?.clubs) ? data.clubs : []);
      setMemberships(Array.isArray(data?.memberships) ? data.memberships : []);
    } catch (error) {
      setMessage(`Systemdaten konnten nicht geladen werden: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }, [supabase, user]);

  React.useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user);
      setAuthReady(true);
    }).catch((error) => {
      console.error("Supabase session lookup failed", error);
      if (active) setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  React.useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData, user]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setAuthLoading(true);
    setMessage("");
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      setUser(data.user);
      setPassword("");
    } catch (error) {
      setMessage(`Login fehlgeschlagen: ${getErrorMessage(error)}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setClubs([]);
    setMemberships([]);
    setMessage("Abgemeldet.");
  };

  const handleCreateClub = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !clubName.trim() || !adminEmail.trim() || !adminPassword) return;
    setLoading(true);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("sysadmin-clubs", {
        body: {
          action: "create",
          clubName: clubName.trim(),
          adminFullName: adminFullName.trim(),
          adminEmail: adminEmail.trim(),
          adminPassword,
        },
      });
      if (error) throw error;
      const createdClubName = clubName.trim();
      const createdAdminEmail = adminEmail.trim();
      setClubName("");
      setAdminFullName("");
      setAdminEmail("");
      setAdminPassword("");
      setMessage(`Verein "${createdClubName}" wurde angelegt. Admin: ${createdAdminEmail}. Der Admin kann sich jetzt in der App anmelden.`);
      await loadData();
    } catch (error) {
      setMessage(`Verein konnte nicht angelegt werden: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const invokeSysadminAction = async (body: Record<string, unknown>, successMessage: string) => {
    if (!supabase) return;
    setLoading(true);
    setMessage("");
    try {
      const { error } = await supabase.functions.invoke("sysadmin-clubs", { body });
      if (error) throw error;
      setMessage(successMessage);
      await loadData();
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleSetStatus = (club: ClubRow, status: "active" | "inactive") => {
    invokeSysadminAction(
      { action: "set_status", clubId: club.id, status },
      status === "active" ? `${club.name} wurde reaktiviert.` : `${club.name} wurde deaktiviert.`,
    );
  };

  const handleDeleteClub = (club: ClubRow) => {
    const confirmed = window.confirm(
      `Verein "${club.name}" endgültig löschen? Alle zugehörigen Vereinsdaten werden entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`,
    );
    if (!confirmed) return;
    invokeSysadminAction(
      { action: "delete", clubId: club.id, confirmName: deleteConfirmByClub[club.id] ?? "" },
      `${club.name} wurde endgültig gelöscht.`,
    );
  };

  const handleLogoUpload = async (club: ClubRow, file: File | null) => {
    if (!file || !supabase) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage("Logo darf maximal 2 MB groß sein.");
      return;
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) {
      setMessage("Bitte PNG, JPG, WebP oder SVG hochladen.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const logoDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Logo konnte nicht gelesen werden."));
        reader.readAsDataURL(file);
      });

      const { error } = await supabase.functions.invoke("sysadmin-clubs", {
        body: {
          action: "upload_logo",
          clubId: club.id,
          logoDataUrl,
        },
      });
      if (error) throw error;
      setMessage(`Logo für ${club.name} wurde hochgeladen.`);
      await loadData();
    } catch (error) {
      setMessage(`Logo konnte nicht hochgeladen werden: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMember = async (club: ClubRow, member: MembershipRow) => {
    if (!supabase) return;
    if (member.user_id === user?.id) {
      setMessage("Du kannst deinen eigenen Systemadmin-Benutzer nicht löschen.");
      return;
    }

    const label = member.profile?.full_name || member.profile?.email || member.user_id;
    const confirmed = window.confirm(
      `${label} aus "${club.name}" löschen? Wenn der Benutzer keinem anderen Verein zugeordnet ist, wird auch der Login entfernt.`,
    );
    if (!confirmed) return;

    setLoading(true);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "delete",
          clubId: club.id,
          userId: member.user_id,
        },
      });
      if (error) throw error;
      setMessage(data?.deletedAuthUser ? `${label} wurde inklusive Login gelöscht.` : `${label} wurde aus ${club.name} entfernt.`);
      await loadData();
    } catch (error) {
      setMessage(`Benutzer konnte nicht gelöscht werden: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const membersByClub = React.useMemo(() => {
    const map = new Map<string, MembershipRow[]>();
    for (const membership of memberships) {
      const list = map.get(membership.club_id) ?? [];
      list.push(membership);
      map.set(membership.club_id, list);
    }
    return map;
  }, [memberships]);

  const visibleClubs = React.useMemo(() => {
    const query = clubSearch.trim().toLowerCase();
    if (!query) return clubs;
    return clubs.filter((club) => `${club.name} ${club.slug} ${club.status}`.toLowerCase().includes(query));
  }, [clubSearch, clubs]);

  if (!supabase) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Systemverwaltung</h1>
          <p className="mt-2 text-sm text-slate-600">Supabase ist nicht konfiguriert.</p>
        </div>
      </main>
    );
  }

  if (!authReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <p className="text-sm font-semibold text-slate-500">Lade Systemverwaltung...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Systemverwaltung</h1>
              <p className="text-xs text-slate-500">Nur für System-Admins.</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="email"
              placeholder="E-Mail-Adresse"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-blue-600"
            />
            <input
              type="password"
              placeholder="Passwort"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-blue-600"
            />
            <button
              type="submit"
              disabled={authLoading || !email.trim() || !password}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500"
            >
              <LogIn className="h-4 w-4" />
              {authLoading ? "Anmelden..." : "Anmelden"}
            </button>
          </form>

          {message && <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">{message}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Systemverwaltung</h1>
              <p className="text-xs text-slate-500">Vereine anlegen und initiale Vereins-Admins erstellen.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">{user.email}</span>
            <Link href="/" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50">
              App öffnen
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50"
            >
              Abmelden
            </button>
          </div>
        </header>

        {message && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-800">
            {message}
          </div>
        )}

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-600" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">Neuer Verein</h2>
            </div>
            <form onSubmit={handleCreateClub} className="space-y-3">
              <input
                type="text"
                placeholder="Vereinsname"
                value={clubName}
                onChange={(event) => setClubName(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-600"
              />
              <div className="border-t border-slate-100 pt-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Initialer Vereins-Admin</p>
                <input
                  type="text"
                  placeholder="Name des Admins"
                  value={adminFullName}
                  onChange={(event) => setAdminFullName(event.target.value)}
                  className="mb-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-600"
                />
                <input
                  type="email"
                  placeholder="Admin E-Mail"
                  value={adminEmail}
                  onChange={(event) => setAdminEmail(event.target.value)}
                  className="mb-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-600"
                />
                <input
                  type="password"
                  placeholder="Initiales Passwort"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !clubName.trim() || !adminEmail.trim() || !adminPassword}
                className="w-full rounded-lg bg-slate-900 px-4 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500"
              >
                {loading ? "Wird angelegt..." : "Verein mit Admin anlegen"}
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-3">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-600" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">Vereine</h2>
              </div>
              <button
                type="button"
                onClick={loadData}
                disabled={loading}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
              >
                Aktualisieren
              </button>
            </div>
            <input
              type="search"
              placeholder="Verein suchen..."
              value={clubSearch}
              onChange={(event) => setClubSearch(event.target.value)}
              className="mb-4 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-600"
            />

            <div className="space-y-3">
              {visibleClubs.map((club) => {
                const clubMembers = membersByClub.get(club.id) ?? [];
                return (
                  <div key={club.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-16 items-center justify-center rounded-lg border border-slate-200 bg-white p-1">
                            {club.logoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={club.logoUrl} alt={`${club.name} Logo`} className="max-h-full max-w-full object-contain" />
                            ) : (
                              <Building2 className="h-5 w-5 text-slate-300" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{club.name}</p>
                            <p className="text-[11px] text-slate-500">Slug: {club.slug} · Status: {club.status}</p>
                          </div>
                        </div>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {clubMembers.length} Benutzer
                      </span>
                    </div>
                    <div className="mt-4 grid gap-2 border-t border-slate-200 pt-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Logo hochladen</span>
                        <span className="mb-2 block text-[10px] font-medium text-slate-500">PNG, JPG, WebP oder SVG, maximal 2 MB.</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          disabled={loading}
                          onChange={(event) => {
                            handleLogoUpload(club, event.target.files?.[0] ?? null);
                            event.currentTarget.value = "";
                          }}
                          className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-bold file:uppercase file:tracking-wider file:text-white"
                        />
                      </label>
                      {club.status === "inactive" ? (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleSetStatus(club, "active")}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-emerald-700 hover:bg-emerald-100 disabled:text-slate-400"
                        >
                          Reaktivieren
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleSetStatus(club, "inactive")}
                          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-amber-700 hover:bg-amber-100 disabled:text-slate-400"
                        >
                          Deaktivieren
                        </button>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={`Zum Löschen: ${club.name}`}
                          value={deleteConfirmByClub[club.id] ?? ""}
                          onChange={(event) => setDeleteConfirmByClub((current) => ({ ...current, [club.id]: event.target.value }))}
                          className="min-w-0 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-rose-500"
                        />
                        <button
                          type="button"
                          disabled={loading || (deleteConfirmByClub[club.id] ?? "") !== club.name}
                          onClick={() => handleDeleteClub(club)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-rose-700 hover:bg-rose-100 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          Endgültig löschen
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1">
                      {clubMembers.map((member) => (
                        <div key={`${member.club_id}-${member.user_id}`} className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Users className="h-3.5 w-3.5 text-slate-400" />
                            <span className="font-semibold">{member.profile?.full_name || member.profile?.email || member.user_id}</span>
                            <span className="text-slate-400">·</span>
                            <span>{member.role?.name ?? "Keine Rolle"}</span>
                            {member.profile?.email && <span className="text-slate-400">({member.profile.email})</span>}
                          </div>
                          <button
                            type="button"
                            disabled={loading || member.user_id === user.id}
                            onClick={() => handleDeleteMember(club, member)}
                            className="inline-flex items-center justify-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-700 hover:bg-rose-50 disabled:bg-slate-100 disabled:text-slate-400"
                            title={member.user_id === user.id ? "Eigener Benutzer kann nicht gelöscht werden" : "Benutzer löschen"}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Löschen
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {clubs.length > 0 && visibleClubs.length === 0 && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Keine Vereine zur Suche gefunden.
                </p>
              )}

              {clubs.length === 0 && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Noch keine Vereine vorhanden.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
