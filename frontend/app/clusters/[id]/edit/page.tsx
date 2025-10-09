"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import ClusterForm from "@/components/ClusterForm";

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

export default function EditClusterPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    setIsAuthenticated(true);
    fetchCluster();
  }, [router, params.id]);

  const fetchCluster = async () => {
    try {
      const token = localStorage.getItem("token");
      const clusterId = params.id as string;
      const response = await fetch(`http://localhost:8000/api/clusters/${clusterId}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCluster(data);
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

  if (!isAuthenticated) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin mr-2" />
        <span className="text-lg">加载中...</span>
      </div>
    );
  }

  if (!cluster) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            集群不存在
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            您请求的集群不存在或已被删除
          </p>
          <Link href="/clusters" className="text-blue-600 hover:text-blue-500">
            返回集群列表
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/clusters" className="flex items-center">
                <ArrowLeft className="h-5 w-5 mr-2" />
                <span className="text-gray-600 dark:text-gray-400">返回集群列表</span>
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
