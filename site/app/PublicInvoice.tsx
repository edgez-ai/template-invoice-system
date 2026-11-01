"use client";

import { useEffect, useState } from "react";
import { functions, workflowFunctionId } from "../lib/appwrite";

type PublicInvoiceData = {
  project: { projectNumber: string; name: string; description?: string; scope?: string; status: string; currency: string };
  customer: { name: string; legalName?: string };
  invoice: { number: string; status: string; stageId: string };
  selectedRevision: {
    revision: number; generatedAt: string; issueDate: string; dueDate?: string;
    subtotalMinor: number; vatMinor: number; totalMinor: number; reverseVat?: boolean;
  };
  latestRevision: number;
  latestUrl?: string;
  superseded: boolean;
  stages: Array<{ id: string; name: string; description?: string; amountMinor: number; status: string; invoiceStatus: string }>;
};

function money(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(amountMinor / 100);
}

function date(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

export default function PublicInvoice({ projectId, invoiceId, revision, publicToken }: { projectId: string; invoiceId: string; revision: number; publicToken: string }) {
  const [data, setData] = useState<PublicInvoiceData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const execution = await functions.createExecution({
          functionId: workflowFunctionId,
          body: JSON.stringify({ action: "invoice.public.get", projectId, invoiceId, revision, publicToken }),
          async: false,
        });
        const result = JSON.parse(execution.responseBody || "{}");
        if (!result.ok) throw new Error(result.error || "Invoice revision could not be loaded.");
        if (active) setData(result.publicInvoice);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Invoice revision could not be loaded.");
      }
    })();
    return () => { active = false; };
  }, [invoiceId, projectId, publicToken, revision]);

  if (error) return <main className="public-invoice-page"><section className="public-invoice-error"><span>!</span><h1>Invoice unavailable</h1><p>{error}</p></section></main>;
  if (!data) return <main className="public-invoice-page"><div className="loading-mark">L</div></main>;

  const currentStage = data.stages.find((stage) => stage.id === data.invoice.stageId);
  return <main className="public-invoice-page">
    <section className="public-invoice-shell">
      <header className="public-invoice-header"><div><p className="eyebrow">PUBLIC INVOICE RECORD</p><h1>{data.invoice.number}</h1><p>{data.customer.legalName || data.customer.name}</p></div><div><span>REVISION</span><strong>{data.selectedRevision.revision}</strong><small>{data.superseded ? "Superseded" : "Current"}</small></div></header>
      {data.superseded && <aside className="revision-superseded"><div><strong>This invoice revision has been superseded.</strong><p>Revision {data.selectedRevision.revision} remains available for audit history, but revision {data.latestRevision} is now the current invoice. / 此版本已被新版本取代。</p></div>{data.latestUrl && <a href={data.latestUrl}>View latest revision →</a>}</aside>}
      <div className="public-invoice-summary">
        <article><small>PROJECT</small><strong>{data.project.projectNumber}</strong><span>{data.project.name}</span></article>
        <article><small>INVOICE STAGE</small><strong>{currentStage?.name || "Payment stage"}</strong><span>{currentStage?.description || "Project payment"}</span></article>
        <article><small>TOTAL</small><strong>{money(data.selectedRevision.totalMinor, data.project.currency)}</strong><span>Due {date(data.selectedRevision.dueDate)}</span></article>
      </div>
      <section className="public-project-detail"><div><p className="eyebrow">PROJECT DETAIL</p><h2>{data.project.name}</h2><p>{data.project.description || "No public project description has been provided."}</p>{data.project.scope && <div className="public-project-scope"><h3>Scope</h3><p>{data.project.scope}</p></div>}</div><span className={`status status-${data.project.status.replaceAll("_", "-")}`}>{data.project.status.replaceAll("_", " ")}</span></section>
      <section className="public-stage-section"><div className="section-heading"><div><h3>Payment stages</h3><p>The stage for this invoice revision is highlighted.</p></div></div><div className="public-stage-list">{data.stages.map((stage) => <article key={stage.id} className={stage.id === data.invoice.stageId ? "current" : ""}><span className="stage-marker">{stage.id === data.invoice.stageId ? "●" : "○"}</span><div><strong>{stage.name}</strong><small>{stage.description || "Project payment stage"}</small></div><div><strong>{money(stage.amountMinor, data.project.currency)}</strong><small>{stage.invoiceStatus.replaceAll("_", " ")}</small></div></article>)}</div></section>
      <footer className="public-invoice-footer"><span>Generated {date(data.selectedRevision.generatedAt)}</span><span>Issue date {date(data.selectedRevision.issueDate)}</span><span>Status: {data.invoice.status}</span></footer>
    </section>
  </main>;
}
