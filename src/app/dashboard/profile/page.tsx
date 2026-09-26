"use client";

import { useEffect, useState } from "react";
import {
  AdminField,
  AdminHeader,
  AdminInput,
  AdminSelect,
  AdminTextarea,
} from "@/components/admin/AdminUI";
import { Button } from "@/components/ui/Button";
import { ImageField } from "@/components/ui/ImageField";
import { usePoliticianProfile } from "@/components/dashboard/usePoliticianProfile";
import { useContent } from "@/components/content/ContentProvider";
import type { Leader, LeaderType, SocialLinks } from "@/types";
import { COUNTIES } from "@/lib/constants";
import { slugify } from "@/lib/store";

export default function PoliticianProfilePage() {
  const { leader } = usePoliticianProfile();
  const { upsertLeader } = useContent();
  const [form, setForm] = useState<Leader | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (leader) setForm(structuredClone(leader));
  }, [leader]);

  if (!form) return null;

  const save = () => {
    upsertLeader({
      ...form,
      slug: form.slug || slugify(form.name),
      achievements: form.achievements.filter(Boolean),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const setSocial = (key: keyof SocialLinks, value: string) => {
    setForm({
      ...form,
      social: { ...form.social, [key]: value || undefined },
    });
  };

  return (
    <div>
      <AdminHeader
        title="My profile"
        description="This is what citizens see on your public leader page. Position/office is free-text."
        action={
          <Button type="button" onClick={save}>
            {saved ? "Saved" : "Save profile"}
          </Button>
        }
      />

      <div className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface p-5 md:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminField label="Honorific">
            <AdminInput
              value={form.honorific}
              onChange={(e) => setForm({ ...form, honorific: e.target.value })}
            />
          </AdminField>
          <AdminField label="Full name">
            <AdminInput
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </AdminField>
        </div>
        <AdminField
          label="Position / office"
          hint="Manual text — e.g. Member of County Assembly — Thika Town Ward"
        >
          <AdminInput
            value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value })}
          />
        </AdminField>
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminField label="Type">
            <AdminSelect
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: e.target.value as LeaderType })
              }
            >
              <option value="elected">Elected</option>
              <option value="aspirant">Aspirant</option>
            </AdminSelect>
          </AdminField>
          <AdminField label="County">
            <AdminSelect
              value={form.county}
              onChange={(e) => setForm({ ...form, county: e.target.value })}
            >
              {COUNTIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
        </div>
        <AdminField label="Constituency / ward">
          <AdminInput
            value={form.constituency || form.ward || ""}
            onChange={(e) =>
              setForm({ ...form, constituency: e.target.value, ward: e.target.value })
            }
          />
        </AdminField>
        <ImageField
          label="Profile photo"
          value={form.photo}
          onChange={(photo) => setForm({ ...form, photo })}
          hint="Portrait shown on your public leader page. Paste a URL or upload from this device."
        />
        <ImageField
          label="Cover image"
          value={form.coverImage || ""}
          onChange={(coverImage) =>
            setForm({ ...form, coverImage: coverImage || undefined })
          }
          optional
          hint="Optional banner behind your profile. Paste a URL or upload from this device."
        />
        <AdminField label="Short bio">
          <AdminTextarea
            value={form.shortBio}
            onChange={(e) => setForm({ ...form, shortBio: e.target.value })}
          />
        </AdminField>
        <AdminField label="Full bio">
          <AdminTextarea
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
        </AdminField>
        <AdminField label="Achievements (one per line)">
          <AdminTextarea
            value={form.achievements.join("\n")}
            onChange={(e) =>
              setForm({ ...form, achievements: e.target.value.split("\n") })
            }
          />
        </AdminField>

        <p className="meta-label pt-2">Social links</p>
        {(
          [
            ["x", "X"],
            ["instagram", "Instagram"],
            ["facebook", "Facebook"],
            ["tiktok", "TikTok"],
            ["whatsapp", "WhatsApp"],
            ["website", "Website"],
          ] as const
        ).map(([key, label]) => (
          <AdminField key={key} label={label}>
            <AdminInput
              value={form.social[key] || ""}
              onChange={(e) => setSocial(key, e.target.value)}
            />
          </AdminField>
        ))}

        <Button type="button" onClick={save} fullWidth>
          {saved ? "Saved" : "Save profile"}
        </Button>
      </div>
    </div>
  );
}
