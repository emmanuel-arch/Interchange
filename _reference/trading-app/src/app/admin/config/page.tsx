"use client";

import ConfigEditor from "@/components/admin/ConfigEditor";

export default function AdminConfigPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Engine Configuration</h1>
        <p className="text-muted-foreground text-sm">
          Edit trading parameters — changes apply on next candle cycle
        </p>
      </div>
      <ConfigEditor />
    </div>
  );
}
