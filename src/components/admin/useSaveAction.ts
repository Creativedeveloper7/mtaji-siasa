"use client";

import { useCallback, useRef, useState } from "react";
import type { SaveResult } from "@/components/content/ContentProvider";

export type AdminNoticeState = { tone: "error" | "warning"; messages: string[] } | null;

const FAILED: SaveResult = { ok: false, error: "Could not save. Try again." };

/**
 * One write at a time for an admin/dashboard editor.
 *
 * - `run` saves: a failure goes to `error` (shown inside the drawer, which the
 *   caller keeps open); warnings go to the page-level `notice`.
 * - `remove` deletes: failures and warnings both go to `notice`, since no drawer
 *   is open.
 *
 * Both return null when another write is still in flight, so a double click
 * cannot send a second PUT (a new record's client id is not a server uuid, so a
 * second PUT would create a second record). The ref guards clicks that land
 * before React re-renders the disabled button.
 */
export function useSaveAction() {
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<AdminNoticeState>(null);

  const exec = useCallback(
    async (task: () => Promise<SaveResult>, onFailure: (message: string) => void): Promise<SaveResult | null> => {
      if (busy.current) return null;
      busy.current = true;
      setSaving(true);
      setError("");
      setNotice(null);
      try {
        let result: SaveResult;
        try {
          result = await task();
        } catch {
          result = FAILED;
        }
        if (!result.ok) onFailure(result.error);
        else if (result.warnings?.length) setNotice({ tone: "warning", messages: result.warnings });
        return result;
      } finally {
        busy.current = false;
        setSaving(false);
      }
    },
    []
  );

  const run = useCallback((task: () => Promise<SaveResult>) => exec(task, setError), [exec]);

  const remove = useCallback(
    (task: () => Promise<SaveResult>) =>
      exec(task, (message) => setNotice({ tone: "error", messages: [message] })),
    [exec]
  );

  return { saving, error, setError, notice, setNotice, run, remove };
}
