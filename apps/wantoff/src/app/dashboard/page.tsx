"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function DashboardRedirect() {
  const { actor, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (actor) {
      router.replace(`/u/${actor.id}`);
    } else {
      router.replace("/login");
    }
  }, [actor, loading, router]);

  return <main className="container"><p>Redirecting…</p></main>;
}
