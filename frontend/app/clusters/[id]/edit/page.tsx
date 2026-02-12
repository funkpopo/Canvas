"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import ClusterForm from "@/components/ClusterForm";
import AuthGuard from "@/components/AuthGuard";
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
  const tCommon = useTranslations("common");
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin mr-2" />
        <span className="text-lg">{tCommon("loading")}</span>
      </div>
    );
  }

  if (!cluster) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {tCluster("clusterNotFound")}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {tCluster("clusterNotFoundDescription")}
          </p>
          <Link href="/clusters" className="text-zinc-600 hover:text-zinc-500">
            {tCluster("backToClusterList")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/clusters" className="flex items-center">
                <ArrowLeft className="h-5 w-5 mr-2" />
                <span className="text-gray-600 dark:text-gray-400">{tCluster("backToClusterList")}</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ClusterForm
          initialData={cluster}
          isEdit={true}
          clusterId={cluster.id}
        />
      </main>
    </div>
  );
}

export default function EditClusterPage() {
  return (
    <AuthGuard>
      <EditClusterPageContent />
    </AuthGuard>
  );
}
