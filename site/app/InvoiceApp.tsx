"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AuthenticationFactor, ID, Permission, Query, Role, type Models } from "appwrite";
import { account, databaseId, filesBucketId, functions, staffTeamId, storage, tables, teams, workflowFunctionId } from "../lib/appwrite";
import type { Activity, Company, Contact, FileMetadata, Interest, PaymentStage, Project, ProjectInvoice, Section } from "../lib/types";

type AuthStep = "checking" | "login" | "mfa" | "enroll" | "ready";
type Modal = "company" | "contact" | "interest" | "activity" | null;

const navigation: Array<{ id: Section; label: string; glyph: string }> = [
  { id: "dashboard", label: "Overview", glyph: "⌂" },
  { id: "companies", label: "Companies", glyph: "▦" },
  { id: "contacts", label: "Contacts", glyph: "◎" },
  { id: "pipeline", label: "Interests", glyph: "↗" },
  { id: "projects", label: "Projects", glyph: "◇" },
  { id: "finance", label: "Finance", glyph: "$" },
  { id: "settings", label: "Our company", glyph: "⚙" },
];

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function currency(amountMinor: number, code = "USD") {
  return new Intl.NumberFormat("en", { style: "currency", currency: code }).format(amountMinor / 100);
}

function shortDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  try { return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
}

function projectDetails(project?: Project) {
  return parseJson(project?.detailsJson, { scope: "", startDate: "", targetDate: "", notes: "" });
}

function projectCommercial(project?: Project): { stages: PaymentStage[]; invoices: ProjectInvoice[] } {
  const value = parseJson(project?.commercialJson, { stages: [], invoices: [] });
  return { stages: Array.isArray(value.stages) ? value.stages : [], invoices: Array.isArray(value.invoices) ? value.invoices : [] };
}

function Status({ value }: { value: string }) {
  return <span className={`status status-${value.replaceAll("_", "-")}`}>{value.replaceAll("_", " ")}</span>;
}

function Login({ onReady }: { onReady: (step: AuthStep, challengeId?: string, user?: Models.User<Models.Preferences>) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await account.createEmailPasswordSession({ email, password });
      try {
        const user = await account.get();
        onReady(user.mfa ? "ready" : "enroll", undefined, user);
      } catch (caught) {
        const appwriteError = caught as { type?: string };
        if (appwriteError.type !== "user_more_factors_required") throw caught;
        const factors = await account.listMfaFactors();
        if (!factors.email) throw new Error("Your verified email is not available as an MFA factor. Ask an administrator for help.");
        const challenge = await account.createMfaChallenge({ factor: AuthenticationFactor.Email });
        onReady("mfa", challenge.$id);
      }
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  return <main className="auth-page">
    <section className="auth-story">
      <div className="brand brand-light"><span className="brand-mark">L</span><span>Ledgerly</span></div>
      <div className="auth-copy">
        <p className="eyebrow light">PRIVATE OPERATIONS WORKSPACE</p>
        <h1>From first conversation<br />to final payment.</h1>
        <p>Keep customer relationships, project decisions, quotations and staged invoices connected in one clear record.</p>
      </div>
      <div className="auth-quote"><span>“</span><p>Good operations make the work feel calm.</p></div>
    </section>
    <section className="auth-panel">
      <form className="auth-form" onSubmit={submit}>
        <p className="eyebrow">WELCOME BACK</p>
        <h2>Sign in to your workspace</h2>
        <p className="muted">Use the account created for you by your administrator.</p>
        <label>Email address<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" required /></label>
        {error && <div className="error-box">{error}</div>}
        <button className="primary wide" disabled={busy}>{busy ? "Signing in…" : "Continue securely"}</button>
        <p className="security-note">Password + email verification code required</p>
      </form>
    </section>
  </main>;
}

function MfaChallenge({ challengeId, onDone }: { challengeId: string; onDone: (user: Models.User<Models.Preferences>) => void }) {
  const [otp, setOtp] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await account.updateMfaChallenge({ challengeId, otp }); onDone(await account.get()); }
    catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  }
  return <main className="center-page"><form className="card auth-card" onSubmit={submit}>
    <div className="brand"><span className="brand-mark">L</span><span>Ledgerly</span></div>
    <p className="eyebrow">SECOND STEP</p><h2>Check your email</h2>
    <p className="muted">Enter the six-digit verification code sent to your verified email address.</p>
    <label>Verification code<input className="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="000000" required /></label>
    {error && <div className="error-box">{error}</div>}
    <button className="primary wide" disabled={busy || otp.length !== 6}>{busy ? "Verifying…" : "Verify and sign in"}</button>
  </form></main>;
}

function MfaEnrollment({ onDone }: { onDone: (user: Models.User<Models.Preferences>) => void }) {
  const [codes, setCodes] = useState<string[]>([]); const [saved, setSaved] = useState(false);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function prepare() {
    setBusy(true); setError("");
    try { const result = await account.createMfaRecoveryCodes(); setCodes(result.recoveryCodes); }
    catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  }
  async function enable() {
    setBusy(true); setError("");
    try { await account.updateMFA({ mfa: true }); onDone(await account.get()); }
    catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  }
  return <main className="center-page"><section className="card enrollment-card">
    <div className="brand"><span className="brand-mark">L</span><span>Ledgerly</span></div>
    <p className="eyebrow">ACCOUNT PROTECTION</p><h2>Finish secure account setup</h2>
    <p className="muted">Before an administrator grants workspace access, save recovery codes and enable email MFA.</p>
    {!codes.length ? <button className="primary" onClick={prepare} disabled={busy}>{busy ? "Preparing…" : "Generate recovery codes"}</button> : <>
      <div className="recovery-grid">{codes.map((code) => <code key={code}>{code}</code>)}</div>
      <label className="check"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I saved these codes somewhere secure.</label>
      <button className="primary" onClick={enable} disabled={!saved || busy}>{busy ? "Enabling…" : "Enable email MFA"}</button>
    </>}
    {error && <div className="error-box">{error}</div>}
  </section></main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label>{label}{children}</label>;
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={(e) => e.stopPropagation()}>
    <header><div><p className="eyebrow">NEW RECORD</p><h2>{title}</h2><p className="muted">{subtitle}</p></div><button className="icon-button" onClick={onClose}>×</button></header>
    {children}
  </section></div>;
}

export default function InvoiceApp() {
  const [authStep, setAuthStep] = useState<AuthStep>("checking");
  const [challengeId, setChallengeId] = useState("");
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [section, setSection] = useState<Section>("dashboard");
  const [modal, setModal] = useState<Modal>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [selectedInterestId, setSelectedInterestId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => { void restore(); }, []);

  async function restore() {
    try {
      const current = await account.get();
      if (!current.mfa) { setUser(current); setAuthStep("enroll"); return; }
      setUser(current); setAuthStep("ready");
    } catch (caught) {
      if ((caught as { type?: string }).type === "user_more_factors_required") {
        try { const challenge = await account.createMfaChallenge({ factor: AuthenticationFactor.Email }); setChallengeId(challenge.$id); setAuthStep("mfa"); }
        catch { setAuthStep("login"); }
      } else setAuthStep("login");
    }
  }

  useEffect(() => { if (authStep === "ready" && user) void loadWorkspace(); }, [authStep, user]);

  async function loadWorkspace() {
    setBusy(true); setError("");
    try {
      const membershipList = await teams.listMemberships({ teamId: staffTeamId, queries: [Query.equal("userId", user!.$id), Query.limit(1)] });
      const membership = membershipList.memberships[0];
      if (!membership?.confirm) throw new Error("Your MFA setup is complete, but workspace access is pending. Ask an administrator to add you to the Invoice staff team.");
      setRoles(membership.roles);
      const [companyRows, contactRows, interestRows, activityRows, projectRows, fileRows] = await Promise.all([
        tables.listRows({ databaseId, tableId: "companies", queries: [Query.orderDesc("$updatedAt"), Query.limit(200)] }),
        tables.listRows({ databaseId, tableId: "contacts", queries: [Query.orderAsc("displayName"), Query.limit(500)] }),
        tables.listRows({ databaseId, tableId: "interests", queries: [Query.orderDesc("$updatedAt"), Query.limit(200)] }),
        tables.listRows({ databaseId, tableId: "activities", queries: [Query.orderDesc("occurredAt"), Query.limit(200)] }),
        tables.listRows({ databaseId, tableId: "projects", queries: [Query.orderDesc("$createdAt"), Query.limit(200)] }),
        tables.listRows({ databaseId, tableId: "files", queries: [Query.orderDesc("uploadedAt"), Query.limit(500)] }),
      ]);
      setCompanies(companyRows.rows as unknown as Company[]); setContacts(contactRows.rows as unknown as Contact[]);
      setInterests(interestRows.rows as unknown as Interest[]); setActivities(activityRows.rows as unknown as Activity[]);
      setProjects(projectRows.rows as unknown as Project[]);
      setFiles(fileRows.rows as unknown as FileMetadata[]);
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  function handleAuth(step: AuthStep, challenge?: string, current?: Models.User<Models.Preferences>) {
    setAuthStep(step); if (challenge) setChallengeId(challenge); if (current) setUser(current);
  }

  async function logout() { await account.deleteSession({ sessionId: "current" }); setUser(null); setAuthStep("login"); }

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget);
    try {
      await tables.createRow({ databaseId, tableId: "companies", rowId: ID.unique(), data: {
        name: data.get("name"), legalName: data.get("legalName") || null, taxNumber: data.get("taxNumber") || null,
        website: data.get("website") || null, industry: data.get("industry") || null, status: "prospect",
        billingEmail: data.get("billingEmail") || null, phone: null, billingAddress: data.get("billingAddress") || null,
        invoiceFooter: null, isOwnCompany: false,
        currency: String(data.get("currency") || "USD").toUpperCase(), paymentTermsDays: Number(data.get("paymentTermsDays") || 30),
        notes: data.get("notes") || null, tags: [], createdBy: user!.$id, updatedBy: user!.$id,
      }});
      setModal(null); await loadWorkspace();
    } catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  }

  async function saveOwnCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice(""); const data = new FormData(event.currentTarget);
    try {
      const values = {
        name: data.get("name"), legalName: data.get("legalName") || null,
        taxNumber: data.get("taxNumber") || null, vatNumber: data.get("vatNumber") || null,
        website: data.get("website") || null,
        industry: "Internal", status: "active", billingEmail: data.get("billingEmail") || null,
        phone: data.get("phone") || null, billingAddress: data.get("billingAddress") || null,
        invoiceFooter: data.get("invoiceFooter") || null, isOwnCompany: true,
        currency: String(data.get("currency") || "USD").toUpperCase(),
        paymentTermsDays: Number(data.get("paymentTermsDays") || 30),
        notes: null, tags: ["own-company"], updatedBy: user!.$id,
      };
      if (ownCompany) {
        await tables.updateRow({ databaseId, tableId: "companies", rowId: ownCompany.$id, data: values });
      } else {
        await tables.createRow({ databaseId, tableId: "companies", rowId: ID.unique(), data: { ...values, createdBy: user!.$id } });
      }
      await loadWorkspace();
      setNotice("Company identity saved. These details will be used for quotation and invoice issuer snapshots.");
    } catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  }

  async function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget);
    try {
      const firstName = String(data.get("firstName") || "").trim(); const lastName = String(data.get("lastName") || "").trim();
      await tables.createRow({ databaseId, tableId: "contacts", rowId: ID.unique(), data: {
        companyId: data.get("companyId"), firstName, lastName: lastName || null, displayName: `${firstName} ${lastName}`.trim(),
        jobTitle: data.get("jobTitle") || null, email: data.get("email") || null, phone: data.get("phone") || null,
        isPrimary: data.get("isPrimary") === "on", status: "active", notes: data.get("notes") || null,
        createdBy: user!.$id, updatedBy: user!.$id,
      }});
      setModal(null); await loadWorkspace();
    } catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  }

  async function createInterest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget);
    try {
      await tables.createRow({ databaseId, tableId: "interests", rowId: ID.unique(), data: {
        companyId: data.get("companyId"), primaryContactId: data.get("primaryContactId") || null,
        title: data.get("title"), description: data.get("description") || null, source: data.get("source") || null,
        status: "new", ownerUserId: user!.$id, estimatedValueMinor: Math.round(Number(data.get("estimatedValue") || 0) * 100),
        currency: String(data.get("currency") || "USD").toUpperCase(), probability: Number(data.get("probability") || 10),
        nextActionAt: data.get("nextActionAt") ? new Date(String(data.get("nextActionAt"))).toISOString() : null,
        expectedCloseDate: null, convertedProjectId: null, createdBy: user!.$id, updatedBy: user!.$id,
      }});
      setModal(null); await loadWorkspace();
    } catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  }

  async function createActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget);
    try {
      const companyId = String(data.get("companyId") || "");
      await tables.createRow({ databaseId, tableId: "activities", rowId: ID.unique(), data: {
        entityType: "company", entityId: companyId, companyId, contactId: data.get("contactId") || null,
        activityType: data.get("activityType"), direction: data.get("direction") || null,
        subject: data.get("subject"), body: data.get("body") || null, occurredAt: new Date().toISOString(),
        nextActionAt: data.get("nextActionAt") ? new Date(String(data.get("nextActionAt"))).toISOString() : null,
        assignedToUserId: data.get("nextActionAt") ? user!.$id : null, outcome: null, createdBy: user!.$id,
      }});
      setModal(null); await loadWorkspace();
    } catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  }

  async function convertInterest(interestId: string) {
    setBusy(true); setError("");
    try {
      const execution = await functions.createExecution({ functionId: workflowFunctionId, body: JSON.stringify({ action: "interest.convert", interestId }), async: false });
      const result = JSON.parse(execution.responseBody || "{}"); if (!result.ok) throw new Error(result.error || "Conversion failed.");
      await loadWorkspace(); setSelectedInterestId(""); setSection("projects");
    } catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  }

  async function runWorkflow(body: Record<string, unknown>) {
    const execution = await functions.createExecution({ functionId: workflowFunctionId, body: JSON.stringify(body), async: false });
    const result = JSON.parse(execution.responseBody || "{}");
    if (!result.ok) throw new Error(result.error || "Workflow failed.");
    return result;
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedProjectId) return;
    setBusy(true); setError(""); setNotice(""); const data = new FormData(event.currentTarget);
    try {
      await runWorkflow({ action: "project.update", projectId: selectedProjectId, name: data.get("name"),
        description: data.get("description"), scope: data.get("scope"), startDate: data.get("startDate"),
        targetDate: data.get("targetDate"), notes: data.get("notes") });
      await loadWorkspace(); setNotice("Project details saved.");
    } catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  }

  async function addPaymentStage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedProjectId) return;
    setBusy(true); setError(""); setNotice(""); const form = event.currentTarget; const data = new FormData(form);
    try {
      await runWorkflow({ action: "project.stage.add", projectId: selectedProjectId, name: data.get("name"),
        description: data.get("description"), amountMinor: Math.round(Number(data.get("amount") || 0) * 100),
        vatRateBasisPoints: Math.round(Number(data.get("vatRate") || 0) * 100), dueDate: data.get("dueDate") });
      form.reset(); await loadWorkspace(); setNotice("Payment stage added.");
    } catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  }

  async function generateInvoice(stageId: string) {
    if (!selectedProjectId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await runWorkflow({ action: "project.invoice.generate", projectId: selectedProjectId, stageId });
      await loadWorkspace(); setNotice(`Invoice ${result.invoice.number} generated as a PDF.`);
    } catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  }

  async function uploadProjectFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedProjectId) return;
    const form = event.currentTarget; const data = new FormData(form); const upload = data.get("attachment");
    if (!(upload instanceof File) || !upload.size) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const stored = await storage.createFile({ bucketId: filesBucketId, fileId: ID.unique(), file: upload,
        permissions: [Permission.read(Role.team(staffTeamId)), Permission.delete(Role.team(staffTeamId, "admin"))] });
      await tables.createRow({ databaseId, tableId: "files", rowId: ID.unique(), data: {
        fileId: stored.$id, folder: `projects/${selectedProjectId}/attachments/`, entityType: "project",
        entityId: selectedProjectId, category: "attachment", originalName: upload.name,
        mimeType: upload.type || "application/octet-stream", sizeBytes: upload.size,
        uploadedBy: user!.$id, uploadedAt: new Date().toISOString(),
      }});
      form.reset(); await loadWorkspace(); setNotice("Attachment uploaded.");
    } catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  }

  const ownCompany = companies.find((company) => company.isOwnCompany);
  const customerCompanies = companies.filter((company) => !company.isOwnCompany);
  const companyMap = useMemo(() => new Map(customerCompanies.map((company) => [company.$id, company])), [customerCompanies]);
  const filteredContacts = contacts.filter((contact) => `${contact.displayName} ${contact.email || ""} ${companyMap.get(contact.companyId)?.name || ""}`.toLowerCase().includes(search.toLowerCase()));
  const selectedCompany = companies.find((company) => company.$id === selectedCompanyId);
  const selectedInterest = interests.find((interest) => interest.$id === selectedInterestId);
  const selectedProject = projects.find((project) => project.$id === selectedProjectId);
  const selectedProjectDetails = projectDetails(selectedProject);
  const selectedProjectCommercial = projectCommercial(selectedProject);
  const selectedProjectFiles = files.filter((file) => file.entityType === "project" && file.entityId === selectedProjectId);
  const openInterests = interests.filter((item) => !["won", "lost"].includes(item.status));
  const pipelineMinor = openInterests.reduce((sum, item) => sum + item.estimatedValueMinor, 0);
  const upcoming = activities.filter((item) => item.nextActionAt && new Date(item.nextActionAt) >= new Date()).slice(0, 5);

  if (authStep === "checking") return <main className="center-page"><div className="loading-mark">L</div></main>;
  if (authStep === "login") return <Login onReady={handleAuth} />;
  if (authStep === "mfa") return <MfaChallenge challengeId={challengeId} onDone={(current) => { setUser(current); setAuthStep("ready"); }} />;
  if (authStep === "enroll") return <MfaEnrollment onDone={(current) => { setUser(current); setAuthStep("ready"); }} />;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">L</span><span>Ledgerly</span></div>
      <nav>{navigation.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><span>{item.glyph}</span>{item.label}</button>)}</nav>
      <div className="sidebar-foot"><div className="mini-avatar">{initials(user?.name || user?.email || "U")}</div><div><strong>{user?.name || "Team member"}</strong><small>{roles.join(" · ") || "staff"}</small></div><button className="logout" onClick={logout}>↪</button></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><div className="mobile-brand">Ledgerly</div><div className="global-search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts, companies, projects…" /></div><button className="secondary" onClick={() => setModal("activity")}>+ Log activity</button></header>
      {error && <div className="workspace-error"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
      {notice && <div className="workspace-notice"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}
      {busy && <div className="progress" />}
      <div className="content">
        {section === "dashboard" && <>
          <div className="page-heading"><div><p className="eyebrow">{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase()}</p><h1>Good to see you, {(user?.name || "there").split(" ")[0]}.</h1><p>Here’s what needs attention across your customer work.</p></div><button className="primary" onClick={() => setModal("company")}>+ New company</button></div>
          <section className="metric-grid">
            <article><span className="metric-icon indigo">↗</span><div><small>OPEN INTERESTS</small><strong>{openInterests.length}</strong><em>{currency(pipelineMinor, openInterests[0]?.currency || "USD")} pipeline</em></div></article>
            <article><span className="metric-icon amber">◷</span><div><small>FOLLOW-UPS DUE</small><strong>{activities.filter((item) => item.nextActionAt && new Date(item.nextActionAt) <= new Date()).length}</strong><em>Keep conversations moving</em></div></article>
            <article><span className="metric-icon green">◇</span><div><small>ACTIVE PROJECTS</small><strong>{projects.filter((item) => !["completed", "cancelled"].includes(item.status)).length}</strong><em>{currency(projects.reduce((sum, item) => sum + item.contractValueMinor, 0), projects[0]?.currency || "USD")} total value</em></div></article>
            <article><span className="metric-icon rose">$</span><div><small>OUTSTANDING</small><strong>—</strong><em>Available in invoicing phase</em></div></article>
          </section>
          <div className="dashboard-grid">
            <section className="panel"><header><div><h3>Pipeline</h3><p>Most recent customer interests</p></div><button className="text-button" onClick={() => setSection("pipeline")}>View all →</button></header>
              <div className="stack-list">{openInterests.slice(0, 5).map((item) => <button key={item.$id} className="stack-row" onClick={() => setSection("pipeline")}><span className="company-avatar">{initials(companyMap.get(item.companyId)?.name || "?")}</span><span><strong>{item.title}</strong><small>{companyMap.get(item.companyId)?.name || "Unknown company"}</small></span><span className="row-value">{currency(item.estimatedValueMinor, item.currency)}<Status value={item.status} /></span></button>)}{!openInterests.length && <Empty compact title="No interests yet" text="Add your first customer interest to begin the pipeline." />}</div>
            </section>
            <section className="panel"><header><div><h3>Next up</h3><p>Scheduled follow-ups</p></div></header>
              <div className="timeline">{upcoming.map((item) => <div key={item.$id}><span className="timeline-dot" /><div><strong>{item.subject}</strong><small>{companyMap.get(item.companyId || "")?.name || item.entityType}</small></div><time>{shortDate(item.nextActionAt)}</time></div>)}{!upcoming.length && <Empty compact title="Nothing scheduled" text="Your upcoming follow-ups will appear here." />}</div>
            </section>
          </div>
        </>}
        {section === "companies" && <>
          <PageTitle eyebrow="CUSTOMER RECORDS" title="Companies" text={`${customerCompanies.length} companies in your workspace`} action="+ New company" onAction={() => setModal("company")} />
          <div className="company-layout"><section className="panel table-panel"><table><thead><tr><th>Company</th><th>Status</th><th>Contacts</th><th>Open interests</th><th>Terms</th></tr></thead><tbody>{customerCompanies.map((company) => <tr key={company.$id} className={selectedCompanyId === company.$id ? "selected" : ""} onClick={() => setSelectedCompanyId(company.$id)}><td><div className="identity"><span className="company-avatar">{initials(company.name)}</span><span><strong>{company.name}</strong><small>{company.industry || company.billingEmail || "No details yet"}</small></span></div></td><td><Status value={company.status} /></td><td>{contacts.filter((contact) => contact.companyId === company.$id).length}</td><td>{interests.filter((item) => item.companyId === company.$id && !["won", "lost"].includes(item.status)).length}</td><td>{company.paymentTermsDays} days</td></tr>)}</tbody></table>{!customerCompanies.length && <Empty title="Build your customer list" text="Add companies first, then connect people, interests and projects to them." />}</section>
            {selectedCompany && <aside className="detail-card"><button className="detail-close" onClick={() => setSelectedCompanyId("")}>×</button><span className="large-avatar">{initials(selectedCompany.name)}</span><h2>{selectedCompany.name}</h2><Status value={selectedCompany.status} /><dl><div><dt>Billing email</dt><dd>{selectedCompany.billingEmail || "—"}</dd></div><div><dt>Tax number</dt><dd>{selectedCompany.taxNumber || "—"}</dd></div><div><dt>Currency</dt><dd>{selectedCompany.currency}</dd></div><div><dt>Payment terms</dt><dd>{selectedCompany.paymentTermsDays} days</dd></div></dl><div className="detail-actions"><button className="primary" onClick={() => setModal("contact")}>+ Contact</button><button className="secondary" onClick={() => setModal("interest")}>+ Interest</button></div><h4>Recent activity</h4>{activities.filter((item) => item.companyId === selectedCompany.$id).slice(0, 4).map((item) => <div className="mini-activity" key={item.$id}><span>•</span><div><strong>{item.subject}</strong><small>{shortDate(item.occurredAt)}</small></div></div>)}</aside>}
          </div>
        </>}
        {section === "contacts" && <><PageTitle eyebrow="PEOPLE" title="Contact directory" text={`${filteredContacts.length} matching contacts`} action="+ New contact" onAction={() => setModal("contact")} /><section className="contact-grid">{filteredContacts.map((contact) => <article className="contact-card" key={contact.$id}><div className="contact-top"><span className="large-avatar person">{initials(contact.displayName)}</span>{contact.isPrimary && <span className="primary-pill">PRIMARY</span>}</div><h3>{contact.displayName}</h3><p>{contact.jobTitle || "Contact"}</p><button onClick={() => { setSelectedCompanyId(contact.companyId); setSection("companies"); }}>{companyMap.get(contact.companyId)?.name || "Unknown company"}</button><dl><div><dt>Email</dt><dd>{contact.email || "—"}</dd></div><div><dt>Phone</dt><dd>{contact.phone || "—"}</dd></div></dl></article>)}{!filteredContacts.length && <Empty title="No contacts found" text="Add a contact or try a different search." />}</section></>}
        {section === "pipeline" && <><PageTitle eyebrow="SALES PIPELINE" title="Customer interests" text={`${openInterests.length} open opportunities · ${currency(pipelineMinor, openInterests[0]?.currency || "USD")}`} action="+ New interest" onAction={() => setModal("interest")} /><section className="panel table-panel"><table><thead><tr><th>Interest</th><th>Company</th><th>Status</th><th>Probability</th><th>Next action</th><th>Value</th><th /></tr></thead><tbody>{interests.map((item) => <tr key={item.$id} onClick={() => setSelectedInterestId(item.$id)}><td><strong>{item.title}</strong><small className="cell-note">{item.source || "Direct"}</small></td><td>{companyMap.get(item.companyId)?.name || "—"}</td><td><Status value={item.status} /></td><td><div className="probability"><span style={{ width: `${item.probability}%` }} /></div><small>{item.probability}%</small></td><td>{shortDate(item.nextActionAt)}</td><td><strong>{currency(item.estimatedValueMinor, item.currency)}</strong></td><td>{!item.convertedProjectId && !["lost", "on_hold"].includes(item.status) && <button className="text-button" onClick={(event) => { event.stopPropagation(); void convertInterest(item.$id); }}>Convert →</button>}</td></tr>)}</tbody></table>{!interests.length && <Empty title="Start your pipeline" text="Record an interest, add follow-ups, and convert it into a project when ready." />}</section></>}
        {section === "projects" && <><PageTitle eyebrow="DELIVERY" title="Projects" text={`${projects.length} customer projects`} /><section className="project-grid">{projects.map((project) => { const commercial = projectCommercial(project); return <button type="button" className="project-card" key={project.$id} onClick={() => setSelectedProjectId(project.$id)}><header><span>{project.projectNumber}</span><Status value={project.status} /></header><h3>{project.name}</h3><p>{companyMap.get(project.companyId)?.name || "Unknown company"}</p><div className="project-value"><small>PROJECT VALUE</small><strong>{currency(project.contractValueMinor, project.currency)}</strong></div><div className="project-track"><span style={{ width: project.status === "completed" ? "100%" : project.status === "in_progress" ? "55%" : "12%" }} /></div><footer><span>Details</span><span>{commercial.stages.length} stages</span><span>{commercial.invoices.length} invoices</span></footer></button>; })}{!projects.length && <Empty title="No projects yet" text="Convert a qualified interest to create a numbered project." />}</section></>}
        {section === "finance" && <><PageTitle eyebrow="COMMERCIAL" title="Finance" text="Quotations, staged invoices and payment tracking" /><section className="finance-hero"><div><span className="metric-icon green">$</span><p className="eyebrow">NEXT IMPLEMENTATION SLICE</p><h2>Commercial documents</h2><p>The secure CRM foundation is ready. Quotation versions, billing-stage planning, immutable invoice PDFs, payments and aging will be added on top of the project records.</p><div className="feature-tags"><span>Quotation versions</span><span>Stage billing</span><span>Invoice status</span><span>Payment allocation</span></div></div><div className="invoice-preview"><header><span className="brand-mark">L</span><div><strong>INVOICE</strong><small>INV-2026-0001</small></div></header><div className="preview-lines"><span /><span /><span /><span /></div><footer><small>TOTAL DUE</small><strong>$24,000.00</strong></footer></div></section></>}
        {section === "settings" && <><PageTitle eyebrow="INVOICE IDENTITY" title="Our company" text="These details will appear as the issuer on quotations and invoices." /><section className="settings-layout"><form key={ownCompany?.$id || "new"} className="panel settings-form" onSubmit={saveOwnCompany}><div className="settings-intro"><span className="large-avatar">{initials(ownCompany?.name || "Our company")}</span><div><h3>Business identity</h3><p>Maintain your legal, contact, tax and payment presentation details.</p></div></div><div className="form-grid embedded"><Field label="Trading name (invoice logo)"><input name="name" defaultValue={ownCompany?.name || ""} required /></Field><Field label="Legal company name"><input name="legalName" defaultValue={ownCompany?.legalName || ""} /></Field><Field label="Billing email"><input name="billingEmail" type="email" defaultValue={ownCompany?.billingEmail || ""} /></Field><Field label="Phone"><input name="phone" type="tel" defaultValue={ownCompany?.phone || ""} /></Field><Field label="Tax / registration number"><input name="taxNumber" defaultValue={ownCompany?.taxNumber || ""} /></Field><Field label="VAT number"><input name="vatNumber" defaultValue={ownCompany?.vatNumber || ""} placeholder="e.g. GB123456789" /></Field><Field label="Website"><input name="website" type="url" defaultValue={ownCompany?.website || ""} /></Field><Field label="Base currency"><input name="currency" maxLength={3} defaultValue={ownCompany?.currency || "USD"} required /></Field><Field label="Default payment terms"><select name="paymentTermsDays" defaultValue={String(ownCompany?.paymentTermsDays ?? 30)}><option value="0">Due immediately</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option></select></Field><span /><Field label="Registered / billing address"><textarea name="billingAddress" rows={4} defaultValue={ownCompany?.billingAddress || ""} /></Field><Field label="Invoice footer and payment instructions"><textarea name="invoiceFooter" rows={4} defaultValue={ownCompany?.invoiceFooter || ""} placeholder="Bank details, payment reference instructions, legal footer…" /></Field><div className="form-actions"><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save company identity"}</button></div></div></form><aside className="invoice-identity-preview"><p className="eyebrow">DOCUMENT PREVIEW</p><h2 className="invoice-wordmark">{ownCompany?.name || "Your trading name"}</h2>{ownCompany?.legalName && <small className="legal-name">{ownCompany.legalName}</small>}<p>{ownCompany?.billingAddress || "Registered address"}</p><dl><div><dt>Email</dt><dd>{ownCompany?.billingEmail || "—"}</dd></div><div><dt>Phone</dt><dd>{ownCompany?.phone || "—"}</dd></div><div><dt>Tax ID</dt><dd>{ownCompany?.taxNumber || "—"}</dd></div><div><dt>VAT</dt><dd>{ownCompany?.vatNumber || "—"}</dd></div><div><dt>Currency</dt><dd>{ownCompany?.currency || "USD"}</dd></div></dl><footer>{ownCompany?.invoiceFooter || "Invoice footer and payment instructions will appear here."}</footer></aside></section></>}
      </div>
    </main>
    {selectedInterest && <ModalShell title={selectedInterest.title} subtitle={`${companyMap.get(selectedInterest.companyId)?.name || "Unknown company"} · ${currency(selectedInterest.estimatedValueMinor, selectedInterest.currency)}`} onClose={() => setSelectedInterestId("")}>
      <div className="record-detail">
        <div className="record-summary"><Status value={selectedInterest.status} /><dl><div><dt>Probability</dt><dd>{selectedInterest.probability}%</dd></div><div><dt>Next action</dt><dd>{shortDate(selectedInterest.nextActionAt)}</dd></div><div><dt>Source</dt><dd>{selectedInterest.source || "Direct"}</dd></div></dl><p>{selectedInterest.description || "No description has been added."}</p></div>
        <section className="detail-section"><h3>Contact history</h3>{activities.filter((item) => item.companyId === selectedInterest.companyId).slice(0, 8).map((item) => <article className="activity-entry" key={item.$id}><div><strong>{item.subject}</strong><small>{item.activityType.replaceAll("_", " ")} · {shortDate(item.occurredAt)}</small></div><p>{item.body || "No notes"}</p></article>)}{!activities.some((item) => item.companyId === selectedInterest.companyId) && <p className="muted">No customer activity yet.</p>}</section>
        {!selectedInterest.convertedProjectId && !["lost", "on_hold"].includes(selectedInterest.status) && <div className="detail-footer"><button className="primary" onClick={() => void convertInterest(selectedInterest.$id)} disabled={busy}>Convert to project</button></div>}
      </div>
    </ModalShell>}
    {selectedProject && <ModalShell title={selectedProject.name} subtitle={`${selectedProject.projectNumber} · ${companyMap.get(selectedProject.companyId)?.name || "Unknown company"}`} onClose={() => setSelectedProjectId("")}>
      <div className="project-detail">
        <form className="detail-section detail-form" onSubmit={saveProject} key={`${selectedProject.$id}-${selectedProject.$updatedAt}`}>
          <div className="section-heading"><div><h3>Project details</h3><p>Scope, delivery dates and internal notes.</p></div><Status value={selectedProject.status} /></div>
          <div className="form-grid embedded-detail"><Field label="Project name"><input name="name" defaultValue={selectedProject.name} required /></Field><Field label="Start date"><input name="startDate" type="date" defaultValue={selectedProjectDetails.startDate} /></Field><Field label="Target date"><input name="targetDate" type="date" defaultValue={selectedProjectDetails.targetDate} /></Field><span /><Field label="Description"><textarea name="description" rows={3} defaultValue={selectedProject.description || ""} /></Field><Field label="Scope"><textarea name="scope" rows={4} defaultValue={selectedProjectDetails.scope} /></Field><Field label="Internal notes"><textarea name="notes" rows={3} defaultValue={selectedProjectDetails.notes} /></Field><div className="form-actions"><button className="primary" disabled={busy}>Save project</button></div></div>
        </form>
        <section className="detail-section"><div className="section-heading"><div><h3>Attachments</h3><p>Proposals, emails and supporting project files.</p></div></div>
          <form className="upload-row" onSubmit={uploadProjectFile}><input name="attachment" type="file" required /><button className="secondary" disabled={busy}>Upload</button></form>
          <div className="file-list">{selectedProjectFiles.filter((item) => item.category === "attachment").map((file) => <a key={file.$id} href={storage.getFileDownload({ bucketId: filesBucketId, fileId: file.fileId })} target="_blank" rel="noreferrer"><span>↧</span><span><strong>{file.originalName}</strong><small>{Math.max(1, Math.round(file.sizeBytes / 1024))} KB · {shortDate(file.uploadedAt)}</small></span></a>)}{!selectedProjectFiles.some((item) => item.category === "attachment") && <p className="muted">No attachments yet.</p>}</div>
        </section>
        <section className="detail-section"><div className="section-heading"><div><h3>Payment stages</h3><p>Create a billing schedule, then generate an immutable invoice PDF from a stage.</p></div></div>
          <form className="stage-form" onSubmit={addPaymentStage}><Field label="Stage name"><input name="name" placeholder="e.g. Deposit" required /></Field><Field label={`Amount (${selectedProject.currency})`}><input name="amount" type="number" min="0.01" step="0.01" required /></Field><Field label="VAT rate %"><input name="vatRate" type="number" min="0" max="100" step="0.01" defaultValue="0" required /></Field><Field label="Due date"><input name="dueDate" type="date" /></Field><Field label="Description"><textarea name="description" rows={2} /></Field><button className="secondary" disabled={busy}>+ Add stage</button></form>
          <div className="stage-list">{selectedProjectCommercial.stages.map((stage) => { const invoice = selectedProjectCommercial.invoices.find((item) => item.stageId === stage.id); return <article key={stage.id}><div><strong>{stage.name}</strong><small>{stage.description || "Payment stage"}{stage.dueDate ? ` · due ${shortDate(stage.dueDate)}` : ""}</small></div><div className="stage-amount"><strong>{currency(stage.amountMinor, selectedProject.currency)}</strong><small>+ {(stage.vatRateBasisPoints / 100).toFixed(2)}% VAT</small></div>{invoice ? <a className="download-button" href={storage.getFileDownload({ bucketId: filesBucketId, fileId: invoice.fileId })} target="_blank" rel="noreferrer">Download PDF</a> : <button className="primary" onClick={() => void generateInvoice(stage.id)} disabled={busy}>Generate invoice</button>}</article>; })}{!selectedProjectCommercial.stages.length && <p className="muted">No payment stages yet.</p>}</div>
        </section>
        {!!selectedProjectCommercial.invoices.length && <section className="detail-section"><div className="section-heading"><div><h3>Invoices</h3><p>Generated PDF documents and their current status.</p></div></div><div className="invoice-list">{selectedProjectCommercial.invoices.map((invoice) => <a key={invoice.id} href={storage.getFileDownload({ bucketId: filesBucketId, fileId: invoice.fileId })} target="_blank" rel="noreferrer"><span><strong>{invoice.number}</strong><small>Issued {shortDate(invoice.issueDate)} · {invoice.status}</small></span><strong>{currency(invoice.totalMinor, selectedProject.currency)} ↧</strong></a>)}</div></section>}
      </div>
    </ModalShell>}
    {modal === "company" && <ModalShell title="Add a company" subtitle="Create the customer record that contacts and projects will use." onClose={() => setModal(null)}><form className="form-grid" onSubmit={createCompany}><Field label="Company name"><input name="name" required /></Field><Field label="Legal name"><input name="legalName" /></Field><Field label="Billing email"><input name="billingEmail" type="email" /></Field><Field label="Tax / registration number"><input name="taxNumber" /></Field><Field label="Industry"><input name="industry" /></Field><Field label="Website"><input name="website" type="url" /></Field><Field label="Currency"><input name="currency" defaultValue="USD" maxLength={3} required /></Field><Field label="Payment terms"><select name="paymentTermsDays" defaultValue="30"><option value="0">Due immediately</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option></select></Field><Field label="Billing address"><textarea name="billingAddress" rows={3} /></Field><Field label="Notes"><textarea name="notes" rows={3} /></Field><FormActions busy={busy} onCancel={() => setModal(null)} /></form></ModalShell>}
    {modal === "contact" && <ModalShell title="Add a contact" subtitle="Connect a person to a customer company." onClose={() => setModal(null)}><form className="form-grid" onSubmit={createContact}><Field label="Company"><select name="companyId" defaultValue={selectedCompanyId} required><option value="">Select a company</option>{customerCompanies.map((company) => <option key={company.$id} value={company.$id}>{company.name}</option>)}</select></Field><span /><Field label="First name"><input name="firstName" required /></Field><Field label="Last name"><input name="lastName" /></Field><Field label="Job title"><input name="jobTitle" /></Field><Field label="Email"><input name="email" type="email" /></Field><Field label="Phone"><input name="phone" type="tel" /></Field><label className="check field-check"><input type="checkbox" name="isPrimary" /> Primary contact for this company</label><Field label="Notes"><textarea name="notes" rows={3} /></Field><FormActions busy={busy} onCancel={() => setModal(null)} /></form></ModalShell>}
    {modal === "interest" && <ModalShell title="Record an interest" subtitle="Capture the opportunity and define its next action." onClose={() => setModal(null)}><form className="form-grid" onSubmit={createInterest}><Field label="Company"><select name="companyId" defaultValue={selectedCompanyId} required><option value="">Select a company</option>{customerCompanies.map((company) => <option key={company.$id} value={company.$id}>{company.name}</option>)}</select></Field><Field label="Primary contact"><select name="primaryContactId"><option value="">No contact selected</option>{contacts.map((contact) => <option key={contact.$id} value={contact.$id}>{contact.displayName}</option>)}</select></Field><Field label="Interest title"><input name="title" required /></Field><Field label="Lead source"><input name="source" placeholder="Referral, website, event…" /></Field><Field label="Estimated value"><input name="estimatedValue" type="number" min="0" step="0.01" defaultValue="0" required /></Field><Field label="Currency"><input name="currency" defaultValue={ownCompany?.currency || "USD"} maxLength={3} required /></Field><Field label="Probability"><input name="probability" type="number" min="0" max="100" defaultValue="10" required /></Field><Field label="Next action"><input name="nextActionAt" type="datetime-local" /></Field><Field label="Description"><textarea name="description" rows={4} /></Field><FormActions busy={busy} onCancel={() => setModal(null)} /></form></ModalShell>}
    {modal === "activity" && <ModalShell title="Log an activity" subtitle="Add a call, meeting, email, note or follow-up to the customer timeline." onClose={() => setModal(null)}><form className="form-grid" onSubmit={createActivity}><Field label="Company"><select name="companyId" defaultValue={selectedCompanyId} required><option value="">Select a company</option>{customerCompanies.map((company) => <option key={company.$id} value={company.$id}>{company.name}</option>)}</select></Field><Field label="Contact"><select name="contactId"><option value="">No contact selected</option>{contacts.map((contact) => <option key={contact.$id} value={contact.$id}>{contact.displayName}</option>)}</select></Field><Field label="Activity type"><select name="activityType" defaultValue="call"><option value="call">Call</option><option value="meeting">Meeting</option><option value="email">Email</option><option value="note">Note</option><option value="follow_up">Follow-up</option></select></Field><Field label="Direction"><select name="direction" defaultValue="outbound"><option value="outbound">Outbound</option><option value="inbound">Inbound</option><option value="internal">Internal</option></select></Field><Field label="Subject"><input name="subject" required /></Field><Field label="Next follow-up"><input name="nextActionAt" type="datetime-local" /></Field><Field label="Notes"><textarea name="body" rows={5} /></Field><FormActions busy={busy} onCancel={() => setModal(null)} /></form></ModalShell>}
  </div>;
}

function PageTitle({ eyebrow, title, text, action, onAction }: { eyebrow: string; title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="page-heading compact"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{text}</p></div>{action && <button className="primary" onClick={onAction}>{action}</button>}</div>;
}

function Empty({ title, text, compact = false }: { title: string; text: string; compact?: boolean }) {
  return <div className={`empty ${compact ? "compact-empty" : ""}`}><span>◌</span><strong>{title}</strong><p>{text}</p></div>;
}

function FormActions({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return <div className="form-actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save record"}</button></div>;
}
