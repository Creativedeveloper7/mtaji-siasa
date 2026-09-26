"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AdminHeader,
  AdminField,
  AdminInput,
  AdminSelect,
  AdminTextarea,
} from "@/components/admin/AdminUI";
import { AdlyStep } from "@/components/adly/AdlyUI";
import { OwnedLeaderField } from "@/components/adly/OwnedLeaderField";
import { useOwnedLeaderScope } from "@/components/adly/useOwnedLeaderScope";
import { useAdly } from "@/components/adly/AdlyProvider";
import { Button } from "@/components/ui/Button";
import { CoordinatePickerMap } from "@/components/gis/CoordinatePickerMap";
import { AiSimulationBadge } from "@/components/project/ProjectHero";
import { DEVELOPMENT_TYPES } from "@/data/adly";
import { mockCreativeGenerationService } from "@/lib/services/adly";
import { createId } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { DevelopmentType, Simulation } from "@/types/adly";

export default function AdlySimulatePage() {
  const { content, upsertSimulation } = useAdly();
  const {
    leaders,
    leaderId: ownedLeaderId,
    leader: ownedLeader,
    isAdmin,
  } = useOwnedLeaderScope();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [developmentType, setDevelopmentType] =
    useState<DevelopmentType>("water");
  const [locationLabel, setLocationLabel] = useState("Kiambu County");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [style, setStyle] = useState<Simulation["style"]>("photoreal");
  const [geo, setGeo] = useState({ lat: -1.268, lng: 36.666 });
  const [leaderId, setLeaderId] = useState(ownedLeaderId);
  const [beforeImage, setBeforeImage] = useState("");
  const [afterImage, setAfterImage] = useState("");
  const [compare, setCompare] = useState<"before" | "after" | "split">("split");
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState("");

  useEffect(() => {
    if (ownedLeaderId) setLeaderId(ownedLeaderId);
    if (ownedLeader?.county) setLocationLabel(`${ownedLeader.county} County`);
  }, [ownedLeaderId, ownedLeader]);

  const mySimulations = useMemo(() => {
    if (isAdmin) return content.simulations;
    if (!leaderId) return [];
    return content.simulations.filter((s) => s.leaderId === leaderId);
  }, [content.simulations, isAdmin, leaderId]);

  const generate = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const imgs = await mockCreativeGenerationService.generateSimulation({});
    setBeforeImage(imgs.beforeImage);
    setAfterImage(imgs.afterImage);
    setBusy(false);
  };

  const save = () => {
    if (!beforeImage || !afterImage || !leaderId) return;
    const id = createId("sim");
    upsertSimulation({
      id,
      title,
      description,
      developmentType,
      locationLabel,
      geo,
      expectedOutcome,
      style,
      beforeImage,
      afterImage,
      leaderId,
      createdAt: new Date().toISOString(),
      isAiSimulation: true,
    });
    setSavedId(id);
  };

  return (
    <div className="space-y-10">
      <AdminHeader
        title="Bring the manifesto to life."
        description="Transform proposed development ideas into visual simulations. Every output is labelled AI Simulation — Proposed Development. Never presented as completed work."
        action={
          <Button href="/adly/poster" variant="outline" size="sm">
            Create poster
          </Button>
        }
      />

      <AdlyStep n={1} title="Describe the proposed development">
        <div className="grid gap-4 md:grid-cols-2">
          <AdminField label="Project / manifesto idea">
            <AdminInput value={title} onChange={(e) => setTitle(e.target.value)} />
          </AdminField>
          <AdminField label="Development type">
            <AdminSelect
              value={developmentType}
              onChange={(e) =>
                setDevelopmentType(e.target.value as DevelopmentType)
              }
            >
              {DEVELOPMENT_TYPES.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField label="Location label">
            <AdminInput
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
            />
          </AdminField>
          <OwnedLeaderField
            label="Your profile"
            leaders={leaders}
            leaderId={leaderId}
            isAdmin={isAdmin}
            onChange={setLeaderId}
          />
          <div className="md:col-span-2">
            <AdminField label="Description">
              <AdminTextarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </AdminField>
          </div>
          <div className="md:col-span-2">
            <AdminField label="Expected outcome">
              <AdminTextarea
                value={expectedOutcome}
                onChange={(e) => setExpectedOutcome(e.target.value)}
              />
            </AdminField>
          </div>
        </div>
      </AdlyStep>

      <AdlyStep n={2} title="Select location on GIS">
        <p className="mb-4 text-small text-ink-muted">
          Enter coordinates or click / drag the pin on the map. The marker updates
          to match what you type.
        </p>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <AdminField label="Latitude">
            <AdminInput
              type="number"
              step="any"
              value={geo.lat}
              onChange={(e) =>
                setGeo((prev) => ({
                  ...prev,
                  lat: Number(e.target.value),
                }))
              }
            />
          </AdminField>
          <AdminField label="Longitude">
            <AdminInput
              type="number"
              step="any"
              value={geo.lng}
              onChange={(e) =>
                setGeo((prev) => ({
                  ...prev,
                  lng: Number(e.target.value),
                }))
              }
            />
          </AdminField>
        </div>
        <CoordinatePickerMap
          center={geo}
          onChange={setGeo}
          label={locationLabel || "Proposed site"}
          heightClass="h-72"
        />
      </AdlyStep>

      <AdlyStep n={3} title="Choose visual style">
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["photoreal", "Photoreal"],
              ["architectural", "Architectural"],
              ["conceptual", "Conceptual"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStyle(id)}
              className={cn(
                "rounded-md border px-4 py-3 text-small",
                style === id
                  ? "border-accent/40 bg-accent-soft text-ink"
                  : "border-border text-ink-muted hover:border-border-strong"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-5">
          <Button type="button" onClick={generate} disabled={busy || !title}>
            {busy ? "Generating simulation…" : "Generate simulation"}
          </Button>
        </div>
      </AdlyStep>

      {(beforeImage || afterImage) && (
        <AdlyStep n={4} title="Simulation results">
          <div className="mb-4">
            <AiSimulationBadge />
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {(
              [
                ["before", "Before"],
                ["after", "After"],
                ["split", "Compare"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setCompare(id)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-caption",
                  compare === id
                    ? "border-accent/40 bg-accent-soft text-ink"
                    : "border-border text-ink-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div
            className={cn(
              "grid gap-4",
              compare === "split" ? "md:grid-cols-2" : "grid-cols-1"
            )}
          >
            {(compare === "before" || compare === "split") && (
              <figure className="overflow-hidden rounded-lg border border-border">
                <div className="relative aspect-[16/10]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={beforeImage}
                    alt="Current environment"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
                <figcaption className="border-t border-border bg-surface px-4 py-3">
                  <p className="meta-label">Current environment</p>
                  <p className="mt-1 text-caption text-ink-muted">{locationLabel}</p>
                </figcaption>
              </figure>
            )}
            {(compare === "after" || compare === "split") && (
              <figure className="overflow-hidden rounded-lg border border-border-accent">
                <div className="relative aspect-[16/10]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={afterImage}
                    alt="AI simulation — proposed development"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute left-3 top-3">
                    <AiSimulationBadge />
                  </div>
                </div>
                <figcaption className="border-t border-border bg-accent-soft px-4 py-3">
                  <p className="meta-label text-accent">AI simulation</p>
                  <p className="mt-1 text-caption text-ink-muted">
                    Proposed development — not a completed project
                  </p>
                </figcaption>
              </figure>
            )}
          </div>

          <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-caption">
            <div>
              <dt className="text-ink-subtle">Proposal</dt>
              <dd className="mt-1 text-ink">{title}</dd>
            </div>
            <div>
              <dt className="text-ink-subtle">Location</dt>
              <dd className="mt-1 text-ink">{locationLabel}</dd>
            </div>
            <div>
              <dt className="text-ink-subtle">Coordinates</dt>
              <dd className="mt-1 font-mono text-ink">
                {geo.lat.toFixed(4)}, {geo.lng.toFixed(4)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-subtle">Status</dt>
              <dd className="mt-1 text-accent">AI Generated · Proposed</dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button type="button" onClick={save}>
              Save to manifesto workspace
            </Button>
            <Button href="/adly/poster" variant="outline">
              Create poster
            </Button>
            <Button href="/adly/advertising" variant="outline">
              Create campaign
            </Button>
            <Button href={`/dashboard/vision`} variant="ghost">
              Open vision editor
            </Button>
          </div>
          {savedId && (
            <p className="mt-3 text-caption text-success">
              Simulation saved. Keep AI Simulation labelling wherever it appears.
            </p>
          )}
        </AdlyStep>
      )}

      {mySimulations.length > 0 && (
        <section>
          <h2 className="mb-4 text-h3 text-ink">Saved simulations</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {mySimulations.map((s) => (
              <li
                key={s.id}
                className="overflow-hidden rounded-lg border border-border bg-surface"
              >
                <div className="relative aspect-[16/10]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.afterImage}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute left-3 top-3">
                    <AiSimulationBadge />
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-small font-medium text-ink">{s.title}</p>
                  <p className="mt-1 text-caption text-ink-subtle">
                    {s.locationLabel}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
