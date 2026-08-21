"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Settings, Save, RotateCcw } from "lucide-react";
import { mockEngineConfig } from "@/lib/mock-data";
import type { EngineConfigItem } from "@/types";

export default function ConfigEditor() {
  const [config, setConfig] = useState(mockEngineConfig);
  const [modified, setModified] = useState<Set<string>>(new Set());

  const updateValue = (id: string, newValue: number | string) => {
    setConfig((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, value: newValue } : item
      )
    );
    setModified((prev) => new Set(prev).add(id));
  };

  const handleSave = async () => {
    // In production: POST to Linux server API
    setModified(new Set());
  };

  const categories = [...new Set(config.map((c) => c.category))];

  return (
    <Card className="border-slate-700/50 bg-slate-900/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Settings className="w-4 h-4 text-gold-400" />
            Engine Configuration
          </CardTitle>
          <div className="flex items-center gap-2">
            {modified.size > 0 && (
              <Badge variant="pending">{modified.size} modified</Badge>
            )}
            <Button
              variant="gold"
              size="sm"
              onClick={handleSave}
              disabled={modified.size === 0}
            >
              <Save className="w-3 h-3 mr-1" />
              Save & Reload
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {categories.map((category) => (
          <div key={category}>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {category}
            </h4>
            <div className="space-y-3">
              {config
                .filter((c: EngineConfigItem) => c.category === category)
                .map((item: EngineConfigItem) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-4 p-3 rounded-lg transition-colors ${
                      modified.has(item.id)
                        ? "bg-gold-500/5 border border-gold-500/20"
                        : "bg-slate-800/50"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {item.label}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type={typeof item.value === "number" ? "number" : "text"}
                        value={String(item.value)}
                        onChange={(e) =>
                          updateValue(
                            item.id,
                            typeof item.value === "number"
                              ? parseFloat(e.target.value) || 0
                              : e.target.value
                          )
                        }
                        className="w-24 h-8 text-right tabular-nums bg-slate-800 border-slate-600/50 text-sm"
                      />
                      {modified.has(item.id) && (
                        <button
                          onClick={() => {
                            const original = mockEngineConfig.find(
                              (c) => c.id === item.id
                            );
                            if (original) updateValue(item.id, original.value);
                            setModified((prev) => {
                              const next = new Set(prev);
                              next.delete(item.id);
                              return next;
                            });
                          }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
