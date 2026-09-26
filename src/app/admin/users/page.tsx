"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  AdminDrawer,
  AdminField,
  AdminHeader,
  AdminInput,
  AdminSelect,
  AdminTable,
} from "@/components/admin/AdminUI";
import { useAuth } from "@/components/auth/AuthProvider";
import type { UserAccount, UserRole } from "@/types/auth";
import { createId } from "@/lib/store";
import { LoadingState } from "@/components/ui/EmptyState";

export default function AdminUsersPage() {
  const { users, ready, updateUser, deleteUser, user: current } = useAuth();
  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return users.filter(
      (u) =>
        !q ||
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.includes(q)
    );
  }, [users, query]);

  if (!ready) return <LoadingState />;

  return (
    <div>
      <AdminHeader
        title="Users"
        description="Manage accounts. Promote a user to admin to grant dashboard access."
        action={
          <Button
            type="button"
            onClick={() =>
              setEditing({
                id: createId("usr"),
                fullName: "",
                email: "",
                phone: "",
                password: "ChangeMe1",
                role: "citizen",
                createdAt: new Date().toISOString(),
              })
            }
          >
            Add user
          </Button>
        }
      />
      <div className="mb-4 max-w-sm">
        <AdminInput placeholder="Search users…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <AdminTable headers={["Name", "Email", "Role", "Phone", ""]}>
        {rows.map((u) => (
          <tr key={u.id}>
            <td className="px-4 py-3 text-ink">{u.fullName}</td>
            <td className="px-4 py-3 text-ink-muted">{u.email}</td>
            <td className="px-4 py-3 capitalize text-accent">{u.role}</td>
            <td className="px-4 py-3 text-ink-muted">{u.phone}</td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(structuredClone(u))}>
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={u.id === current?.userId}
                onClick={() => {
                  if (confirm(`Delete ${u.email}?`)) deleteUser(u.id);
                }}
              >
                Delete
              </Button>
            </td>
          </tr>
        ))}
      </AdminTable>

      <AdminDrawer
        open={!!editing}
        title="User"
        onClose={() => setEditing(null)}
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              fullWidth
              onClick={() => {
                if (!editing?.email || !editing.fullName) return;
                updateUser({
                  ...editing,
                  email: editing.email.trim().toLowerCase(),
                });
                setEditing(null);
              }}
            >
              Save
            </Button>
            <Button type="button" variant="secondary" fullWidth onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <AdminField label="Full name">
              <AdminInput
                value={editing.fullName}
                onChange={(e) => setEditing({ ...editing, fullName: e.target.value })}
              />
            </AdminField>
            <AdminField label="Email">
              <AdminInput
                type="email"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
            </AdminField>
            <AdminField label="Phone">
              <AdminInput
                value={editing.phone}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
              />
            </AdminField>
            <AdminField label="Password">
              <AdminInput
                type="text"
                value={editing.password}
                onChange={(e) => setEditing({ ...editing, password: e.target.value })}
              />
            </AdminField>
            <AdminField label="Role">
              <AdminSelect
                value={editing.role}
                onChange={(e) =>
                  setEditing({ ...editing, role: e.target.value as UserRole })
                }
              >
                <option value="citizen">Citizen</option>
                <option value="leader">Leader</option>
                <option value="aspirant">Aspirant</option>
                <option value="organization">Organization</option>
                <option value="admin">Admin</option>
              </AdminSelect>
            </AdminField>
            {(editing.role === "leader" || editing.role === "aspirant") && (
              <AdminField
                label="Linked leader profile ID"
                hint="Optional — leave blank and the politician dashboard will create or match a profile on first visit."
              >
                <AdminInput
                  value={editing.leaderId || ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      leaderId: e.target.value.trim() || undefined,
                    })
                  }
                  placeholder="e.g. ldr-001"
                />
              </AdminField>
            )}
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}
