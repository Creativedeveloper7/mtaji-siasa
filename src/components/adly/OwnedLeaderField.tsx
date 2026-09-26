"use client";

import { AdminField, AdminInput, AdminSelect } from "@/components/admin/AdminUI";
import type { Leader } from "@/types";

/** Locked to the signed-in politician; admins may still pick any leader */
export function OwnedLeaderField({
  label = "Your profile",
  leaders,
  leaderId,
  isAdmin,
  onChange,
}: {
  label?: string;
  leaders: Leader[];
  leaderId: string;
  isAdmin: boolean;
  onChange?: (leaderId: string) => void;
}) {
  const selected = leaders.find((l) => l.id === leaderId) || leaders[0];

  if (!isAdmin) {
    return (
      <AdminField
        label={label}
        hint="Locked to the account you signed in with."
      >
        <AdminInput
          value={
            selected
              ? `${selected.honorific} ${selected.name}`
              : "Setting up your profile…"
          }
          readOnly
          disabled
        />
      </AdminField>
    );
  }

  return (
    <AdminField label={label} hint="Admin — select which leader this belongs to.">
      <AdminSelect
        value={leaderId}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {leaders.map((l) => (
          <option key={l.id} value={l.id}>
            {l.honorific} {l.name}
          </option>
        ))}
      </AdminSelect>
    </AdminField>
  );
}
