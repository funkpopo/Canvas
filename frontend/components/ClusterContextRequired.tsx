"use client";

import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/hooks/use-translations";

interface ClusterContextRequiredProps {
  title?: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
}

export function ClusterContextRequired({
  title,
  description,
  actionHref = "/",
  actionLabel,
}: ClusterContextRequiredProps) {
  const t = useTranslations("clusterContext");

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-10 w-10 text-amber-500 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">{title || t("title")}</h3>
        <p className="text-muted-foreground mb-5 max-w-2xl">{description || t("description")}</p>
        <Button asChild>
          <Link href={actionHref}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {actionLabel || t("action")}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

