import { ReactNode } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { badgePresets } from "@/shared/ui/badge";

interface ResourceCardProps {
  label: string;
  value: string;
  description: string;
  trend?: ReactNode;
}

export function ResourceCard({ label, value, description, trend }: ResourceCardProps) {
  return (
    <Card className="relative overflow-hidden border-border bg-surface">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between">
          <CardDescription className={`${badgePresets.label} text-text-muted`}>
            {label}
          </CardDescription>
          {trend}
        </div>
        <div>
          <CardTitle className="text-2xl font-bold text-text-primary">{value}</CardTitle>
          <p className="text-xs text-text-muted">{description}</p>
        </div>
      </CardHeader>
    </Card>
  );
}

