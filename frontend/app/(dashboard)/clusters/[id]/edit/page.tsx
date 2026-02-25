"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import ClusterForm from "@/components/ClusterForm";

import { clusterApi } from "@/lib/api";
import { useTranslations } from "@/hooks/use-translations";

interface Cluster {
  id: number;
  name: string;
  endpoint: string;
  auth_type: string;
  kubeconfig_content?: string;
  token?: string;
  ca_cert?: string;
  is_active: boolean;
}

function EditClusterPageContent() {
  const tCluster = useTranslations("cluster");
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    fetchCluster();
  }, [params.id]);

  const fetchCluster = async () => {
    try {
      const clusterId = parseInt(params.id as string);
      const result = await clusterApi.getCluster(clusterId);

      if (result.data) {
        setCluster(result.data as unknown as Cluster);
      } else {
        console.error("获取集群信息失败");
        router.push("/clusters");
      }
    } catch (error) {
      console.error("获取集群信息出错:", error);
      router.push("/clusters");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!cluster) {
    return (
      <div className="py-8 text-center">
        <h2 className="mb-2 text-2xl font-bold">{tCluster("clusterNotFound")}</h2>
        <p className="mb-4 text-muted-foreground">{tCluster("clusterNotFoundDescription")}</p>
        <Link href="/clusters" className="text-zinc-600 hover:text-zinc-500">
          {tCluster("backToClusterList")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/clusters"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        {tCluster("backToClusterList")}
      </Link>

      <ClusterForm initialData={cluster} isEdit={true} clusterId={cluster.id} />
    </div>
  );
}

export default function EditClusterPage() {
  return <EditClusterPageContent />;
}
