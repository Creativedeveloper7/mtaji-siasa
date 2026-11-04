"use client";

import { useState, type ClipboardEvent } from "react";
import { AdminField, AdminInput, AdminTextarea } from "@/components/admin/AdminUI";
import { endsMidSentence } from "@/lib/ad-text";

/**
 * Headline or ad text with a character count. The browser silently drops
 * pasted text past `maxLength` (an ad went out ending "…civic engagement,
 * strategic"), so a paste that doesn't fit says so.
 */
export function AdTextField({
  label,
  value,
  onChange,
  maxLength,
  multiline = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  multiline?: boolean;
  hint?: string;
}) {
  const [cut, setCut] = useState(0);

  const onPaste = (e: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const selected = (el.selectionEnd ?? 0) - (el.selectionStart ?? 0);
    const after = value.length - selected + e.clipboardData.getData("text").length;
    setCut(Math.max(0, after - maxLength));
  };
  const change = (next: string) => {
    if (next.length < maxLength) setCut(0);
    onChange(next);
  };

  const props = { value, maxLength, onPaste, onChange: (e: { target: { value: string } }) => change(e.target.value) };
  return (
    <div className="space-y-1.5">
      <AdminField label={`${label} (${value.length}/${maxLength})`} hint={hint}>
        {multiline ? <AdminTextarea {...props} /> : <AdminInput {...props} />}
      </AdminField>
      {cut > 0 ? (
        <p className="text-caption text-warning" role="alert">
          The pasted text was {cut} character{cut === 1 ? "" : "s"} too long, so the end was cut off. Shorten it so it ends
          in a full sentence.
        </p>
      ) : (
        multiline &&
        endsMidSentence(value) && (
          <p className="text-caption text-warning">The text stops mid-sentence. End it with a full stop so the ad reads as finished.</p>
        )
      )}
    </div>
  );
}
