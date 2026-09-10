"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LoadingState } from "@/components/ui/Alert";

const POLL_INTERVAL_MS = 4000;

export function ProcessingView({ auditId }: { auditId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("Analyzing your brand across all eight dimensions…");
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (!triggeredRef.current) {
      triggeredRef.current = true;
      // Fire the processing request; we don't block the UI on its
      // response — the poll below picks up the status change whenever it
      // lands, whether this fetch resolves, times out, or the tab reloads.
      fetch(`/api/audits/${auditId}/process`, { method: "POST" }).catch(() => {
        // Network hiccup — the poll loop will keep checking regardless.
      });
    }

    const supabase = createClient();
    const interval = setInterval(async () => {
      const { data } = await supabase.from("audits").select("status").eq("id", auditId).maybeSingle();
      if (data?.status === "completed" || data?.status === "failed") {
        clearInterval(interval);
        router.refresh();
      }
    }, POLL_INTERVAL_MS);

    const messages = [
      "Analyzing your brand across all eight dimensions…",
      "Reviewing your website and public evidence…",
      "Identifying strengths and weaknesses…",
      "Building your prioritized recommendations…",
      "Putting together your 30-day action plan…",
    ];
    let i = 0;
    const messageInterval = setInterval(() => {
      i = (i + 1) % messages.length;
      setMessage(messages[i]);
    }, 6000);

    return () => {
      clearInterval(interval);
      clearInterval(messageInterval);
    };
  }, [auditId, router]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-(--color-border) bg-(--color-surface) p-12 text-center">
      <LoadingState label={message} />
      <p className="max-w-sm text-xs text-(--color-text-secondary)">
        This usually takes a couple of minutes. Feel free to leave this page — your audit will be waiting when you
        come back.
      </p>
    </div>
  );
}
