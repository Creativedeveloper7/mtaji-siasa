"use client";

import { useEffect, useState } from "react";
import {
  AdminField,
  AdminHeader,
  AdminInput,
  AdminTextarea,
} from "@/components/admin/AdminUI";
import { Button } from "@/components/ui/Button";
import { ImageField } from "@/components/ui/ImageField";
import { usePoliticianProfile } from "@/components/dashboard/usePoliticianProfile";
import { useContent } from "@/components/content/ContentProvider";
import type { Vision } from "@/types";
import { createId } from "@/lib/store";
import { AiSimulationBadge } from "@/components/project/ProjectHero";

const emptyVision = (): Vision => ({
  statement: "",
  manifesto: [],
  priorities: [],
  proposedProjects: [],
  expectedImpact: [],
});

export default function PoliticianVisionPage() {
  const { leader, isAspirant } = usePoliticianProfile();
  const { upsertLeader } = useContent();
  const [form, setForm] = useState<Vision>(emptyVision());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (leader?.vision) setForm(structuredClone(leader.vision));
    else if (leader) setForm(emptyVision());
  }, [leader]);

  if (!leader) return null;

  if (!isAspirant && leader.type !== "aspirant") {
    return (
      <div>
        <AdminHeader
          title="Vision"
          description="Vision pages are for aspirants. Switch your profile type to Aspirant in My profile to publish a manifesto and proposed projects."
        />
        <Button href="/dashboard/profile" variant="outline">
          Go to profile
        </Button>
      </div>
    );
  }

  const save = () => {
    upsertLeader({
      ...leader,
      type: "aspirant",
      vision: {
        ...form,
        manifesto: form.manifesto.filter(Boolean),
        priorities: form.priorities.filter(Boolean),
        expectedImpact: form.expectedImpact.filter(Boolean),
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <AdminHeader
        title="Vision & manifesto"
        description="Clearly labelled proposed visions — never presented as completed projects."
        action={
          <Button type="button" onClick={save}>
            {saved ? "Saved" : "Save vision"}
          </Button>
        }
      />

      <div className="mb-4">
        <AiSimulationBadge />
      </div>

      <div className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface p-5 md:p-6">
        <AdminField label="Vision statement">
          <AdminTextarea
            value={form.statement}
            onChange={(e) => setForm({ ...form, statement: e.target.value })}
          />
        </AdminField>
        <AdminField label="Manifesto points (one per line)">
          <AdminTextarea
            value={form.manifesto.join("\n")}
            onChange={(e) =>
              setForm({ ...form, manifesto: e.target.value.split("\n") })
            }
          />
        </AdminField>
        <AdminField label="Priorities (one per line)">
          <AdminTextarea
            value={form.priorities.join("\n")}
            onChange={(e) =>
              setForm({ ...form, priorities: e.target.value.split("\n") })
            }
          />
        </AdminField>
        <AdminField label="Expected impact (one per line)">
          <AdminTextarea
            value={form.expectedImpact.join("\n")}
            onChange={(e) =>
              setForm({ ...form, expectedImpact: e.target.value.split("\n") })
            }
          />
        </AdminField>

        <div className="border-t border-border pt-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="meta-label">Proposed projects (AI simulations)</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setForm({
                  ...form,
                  proposedProjects: [
                    ...form.proposedProjects,
                    {
                      id: createId("prop"),
                      title: "",
                      description: "",
                      location: leader.county,
                      category: "infrastructure",
                      simulationImage:
                        "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&q=80",
                      expectedImpact: "",
                    },
                  ],
                })
              }
            >
              Add proposed project
            </Button>
          </div>
          <div className="space-y-4">
            {form.proposedProjects.map((proj, idx) => (
              <div
                key={proj.id}
                className="space-y-3 rounded-md border border-border-accent bg-accent-soft p-4"
              >
                <AiSimulationBadge />
                <AdminField label="Title">
                  <AdminInput
                    value={proj.title}
                    onChange={(e) => {
                      const next = [...form.proposedProjects];
                      next[idx] = { ...proj, title: e.target.value };
                      setForm({ ...form, proposedProjects: next });
                    }}
                  />
                </AdminField>
                <AdminField label="Location">
                  <AdminInput
                    value={proj.location}
                    onChange={(e) => {
                      const next = [...form.proposedProjects];
                      next[idx] = { ...proj, location: e.target.value };
                      setForm({ ...form, proposedProjects: next });
                    }}
                  />
                </AdminField>
                <AdminField label="Description">
                  <AdminTextarea
                    value={proj.description}
                    onChange={(e) => {
                      const next = [...form.proposedProjects];
                      next[idx] = { ...proj, description: e.target.value };
                      setForm({ ...form, proposedProjects: next });
                    }}
                  />
                </AdminField>
                <ImageField
                  label="Simulation image"
                  value={proj.simulationImage}
                  onChange={(simulationImage) => {
                    const next = [...form.proposedProjects];
                    next[idx] = { ...proj, simulationImage };
                    setForm({ ...form, proposedProjects: next });
                  }}
                  hint="AI conceptual visualisation — paste a URL or upload from this device."
                />
                <AdminField label="Expected impact">
                  <AdminInput
                    value={proj.expectedImpact}
                    onChange={(e) => {
                      const next = [...form.proposedProjects];
                      next[idx] = { ...proj, expectedImpact: e.target.value };
                      setForm({ ...form, proposedProjects: next });
                    }}
                  />
                </AdminField>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setForm({
                      ...form,
                      proposedProjects: form.proposedProjects.filter(
                        (_, i) => i !== idx
                      ),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>

        <Button type="button" onClick={save} fullWidth>
          {saved ? "Saved" : "Save vision"}
        </Button>
      </div>
    </div>
  );
}
