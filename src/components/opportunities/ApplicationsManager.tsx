"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Mail, Phone } from "lucide-react";
import {
  AdminDrawer,
  AdminField,
  AdminHeader,
  AdminSelect,
  AdminTable,
  AdminTextarea,
} from "@/components/admin/AdminUI";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useApplications } from "@/components/opportunities/useApplications";
import { apiJson } from "@/lib/api-client";
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUS_TONES } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";
import type { ApplicationStatus, ApplicationView } from "@/types";

const STATUSES = Object.keys(APPLICATION_STATUS_LABELS) as ApplicationStatus[];

/**
 * Received applications (to opportunities the viewer published; admin sees all)
 * plus the viewer's own applications.
 */
export function ApplicationsManager({ showMine = true }: { showMine?: boolean }) {
  const received = useApplications("received");
  const mine = useApplications("mine");
  const [tab, setTab] = useState<"received" | "mine">("received");
  const [opportunityFilter, setOpportunityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ApplicationStatus>("all");
  const [reviewing, setReviewing] = useState<ApplicationView | null>(null);
  const [draft, setDraft] = useState<{ status: ApplicationStatus; reviewNote: string }>({
    status: "submitted",
    reviewNote: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ?opportunity=<id> (from an opportunity page or table) pre-filters the list.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("opportunity");
    if (id) setOpportunityFilter(id);
  }, []);

  const opportunities = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of received.items) seen.set(item.opportunityId, item.opportunity.title);
    return Array.from(seen, ([id, title]) => ({ id, title }));
  }, [received.items]);

  const rows = received.items.filter(
    (item) =>
      (opportunityFilter === "all" || item.opportunityId === opportunityFilter) &&
      (statusFilter === "all" || item.status === statusFilter)
  );
  const newCount = received.items.filter((item) => item.status === "submitted").length;

  const openReview = (item: ApplicationView) => {
    setError("");
    setReviewing(item);
    setDraft({ status: item.status, reviewNote: item.reviewNote ?? "" });
  };

  const saveReview = async (status = draft.status) => {
    if (!reviewing) return;
    setSaving(true);
    setError("");
    const result = await apiJson<{ item?: ApplicationView; error?: string }>(
      `/api/applications/${encodeURIComponent(reviewing.id)}`,
      { method: "PATCH", body: JSON.stringify({ status, reviewNote: draft.reviewNote }) }
    );
    setSaving(false);
    if (!result.ok || !result.data.item) {
      setError(result.data.error || "Could not update the application.");
      return;
    }
    const updated = result.data.item;
    received.setItems(received.items.map((item) => (item.id === updated.id ? updated : item)));
    setReviewing(null);
  };

  return (
    <div>
      <AdminHeader
        title="Applications"
        description="People who applied for the opportunities you published. Review them, update their status and leave a note the applicant can see."
      />

      {showMine && (
        <div className="mb-6 flex gap-1 border-b border-border" role="tablist">
          <TabButton active={tab === "received"} onClick={() => setTab("received")}>
            Received ({received.items.length})
            {newCount > 0 && (
              <span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-ink-inverse">
                {newCount} new
              </span>
            )}
          </TabButton>
          <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
            My applications ({mine.items.length})
          </TabButton>
        </div>
      )}

      {tab === "received" ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
            <AdminSelect
              aria-label="Filter by opportunity"
              value={opportunityFilter}
              onChange={(e) => setOpportunityFilter(e.target.value)}
            >
              <option value="all">All opportunities</option>
              {opportunities.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
              {opportunityFilter !== "all" &&
                !opportunities.some((o) => o.id === opportunityFilter) && (
                  <option value={opportunityFilter}>Selected opportunity</option>
                )}
            </AdminSelect>
            <AdminSelect
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | ApplicationStatus)}
            >
              <option value="all">All statuses</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {APPLICATION_STATUS_LABELS[status]}
                </option>
              ))}
            </AdminSelect>
          </div>

          {received.loading ? (
            <p className="text-small text-ink-muted">Loading applications…</p>
          ) : received.error ? (
            <p className="rounded-md border border-error/30 bg-error-muted px-3 py-2 text-small text-error">
              {received.error}
            </p>
          ) : rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-small text-ink-muted">
              {received.items.length === 0
                ? "No applications yet. When someone applies for one of your opportunities it shows up here."
                : "No applications match these filters."}
            </p>
          ) : (
            <AdminTable headers={["Applicant", "Opportunity", "Applied", "Status", ""]}>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <p className="flex items-center gap-2 font-medium text-ink">
                      {item.status === "submitted" && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="New" />
                      )}
                      {item.fullName}
                    </p>
                    <p className="text-caption text-ink-subtle">{item.email}</p>
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-ink-muted">
                    {item.opportunity.slug ? (
                      <Link href={`/opportunities/${item.opportunity.slug}`} className="hover:text-accent">
                        {item.opportunity.title}
                      </Link>
                    ) : (
                      item.opportunity.title
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{formatDate(item.createdAt)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={APPLICATION_STATUS_LABELS[item.status]}
                      tone={APPLICATION_STATUS_TONES[item.status]}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button type="button" size="sm" variant="ghost" onClick={() => openReview(item)}>
                      Review
                    </Button>
                  </td>
                </tr>
              ))}
            </AdminTable>
          )}
        </>
      ) : (
        <MyApplications items={mine.items} loading={mine.loading} />
      )}

      <AdminDrawer
        open={!!reviewing}
        title="Application"
        onClose={() => setReviewing(null)}
        footer={
          <div className="flex gap-2">
            <Button type="button" fullWidth disabled={saving} onClick={() => void saveReview()}>
              {saving ? "Saving…" : "Save review"}
            </Button>
            <Button type="button" variant="secondary" fullWidth onClick={() => setReviewing(null)}>
              Cancel
            </Button>
          </div>
        }
      >
        {reviewing && (
          <div className="space-y-6">
            <div>
              <p className="meta-label text-accent">{reviewing.opportunity.title}</p>
              <h3 className="mt-2 text-h3 text-ink">{reviewing.fullName}</h3>
              <p className="mt-1 text-caption text-ink-subtle">
                Applied {formatDate(reviewing.createdAt)}
                {reviewing.county ? ` · ${reviewing.county} County` : ""}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button href={`mailto:${reviewing.email}`} size="sm" variant="outline">
                  <Mail className="h-4 w-4" />
                  {reviewing.email}
                </Button>
                {reviewing.phone && (
                  <Button href={`tel:${reviewing.phone}`} size="sm" variant="outline">
                    <Phone className="h-4 w-4" />
                    {reviewing.phone}
                  </Button>
                )}
              </div>
            </div>

            <div>
              <p className="meta-label">Message</p>
              <p className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-surface px-3 py-3 text-small text-ink">
                {reviewing.message}
              </p>
            </div>

            {reviewing.attachmentUrl && (
              <a
                href={reviewing.attachmentUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 text-small text-accent hover:text-accent-hover"
              >
                <ExternalLink className="h-4 w-4" />
                Open CV / portfolio
              </a>
            )}

            <AdminField label="Status">
              <AdminSelect
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as ApplicationStatus })}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {APPLICATION_STATUS_LABELS[status]}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Note to applicant (optional)" hint="The applicant sees this on the opportunity page.">
              <AdminTextarea
                value={draft.reviewNote}
                onChange={(e) => setDraft({ ...draft, reviewNote: e.target.value })}
                placeholder="e.g. Please come for an interview on Monday at the ward office."
              />
            </AdminField>
            {error && (
              <p className="rounded-md border border-error/30 bg-error-muted px-3 py-2 text-small text-error">
                {error}
              </p>
            )}
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}

function MyApplications({ items, loading }: { items: ApplicationView[]; loading: boolean }) {
  if (loading) return <p className="text-small text-ink-muted">Loading applications…</p>;
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-small text-ink-muted">
        You have not applied for any opportunities yet.{" "}
        <Link href="/opportunities" className="text-accent hover:text-accent-hover">
          Browse opportunities
        </Link>
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link
                href={item.opportunity.slug ? `/opportunities/${item.opportunity.slug}` : "/opportunities"}
                className="text-small font-medium text-ink hover:text-accent"
              >
                {item.opportunity.title}
              </Link>
              <p className="mt-1 text-caption text-ink-subtle">Applied {formatDate(item.createdAt)}</p>
            </div>
            <StatusBadge
              status={APPLICATION_STATUS_LABELS[item.status]}
              tone={APPLICATION_STATUS_TONES[item.status]}
            />
          </div>
          {item.reviewNote && (
            <p className="mt-3 text-small text-ink-muted">
              <span className="font-medium text-ink">Note: </span>
              {item.reviewNote}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "-mb-px inline-flex items-center border-b-2 px-4 py-2.5 text-small transition-colors",
        active ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
