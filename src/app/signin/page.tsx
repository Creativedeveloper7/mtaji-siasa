import { Suspense } from "react";
import SignInClient from "./SignInClient";
import { LoadingState } from "@/components/ui/EmptyState";

export default function SignInPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" />}>
      <SignInClient />
    </Suspense>
  );
}
