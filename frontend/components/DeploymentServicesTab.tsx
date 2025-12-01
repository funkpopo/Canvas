"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, Edit } from "lucide-react";
import ServiceEditor from "./ServiceEditor";
import { deploymentApi } from "@/lib/api";

interface DeploymentServicesTabProps {
  namespace: string;
  deployment: string;
  clusterId: string | null;
}

interface Service {
  name: string;
  type: string;
  cluster_ip?: string;
  external_ip?: string;
  ports: Array<{
    port: number;
    target_port: number | string;
    protocol: string;
    name?: string;
  }>;
  selector: Record<string, string>;
  labels: Record<string, string>;
  age?: string;
}

export default function DeploymentServicesTab({ namespace, deployment, clusterId }: DeploymentServicesTabProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [showServiceEditor, setShowServiceEditor] = useState(false);

  const fetchServices = async () => {
    if (!clusterId) return;

    setIsLoading(true);
    try {
      const result = await deploymentApi.getDeploymentServices(
        parseInt(clusterId),
        namespace,
        deployment
      );

      if (result.data) {
        setServices(result.data as unknown as Service[]);
      }
    } catch (error) {
      console.error("获取服务列表出错:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, [namespace, deployment, clusterId]);

  const handleEditService = (service: Service) => {
    setSelectedService(service);
    setShowServiceEditor(true);
  };

  const handleServiceUpdated = () => {
    setShowServiceEditor(false);
    setSelectedService(null);
    fetchServices();
  };

  if (showServiceEditor && selectedService) {
    return (
      <ServiceEditor
        namespace={namespace}
        deployment={deployment}
        service={selectedService}
        clusterId={clusterId}
        onBack={() => setShowServiceEditor(false)}
        onUpdated={handleServiceUpdated}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">关联服务</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            显示与此部署关联的服务
          </p>
        </div>
        <Button onClick={fetchServices} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ExternalLink className="h-4 w-4 mr-2" />
          )}
          刷新
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mr-2" />
          <span className="text-lg">加载服务中...</span>
        </div>
      ) : services.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ExternalLink className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              无关联服务
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              该部署当前没有关联的服务
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {services.map((service) => (
            <Card key={service.name}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CardTitle className="text-lg">{service.name}</CardTitle>
                    <Badge variant="outline">{service.type}</Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditService(service)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    编辑
                  </Button>
                </div>
                <CardDescription>
                  集群IP: {service.cluster_ip || '无'} •
                  外部IP: {service.external_ip || '无'} •
                  年龄: {service.age || '未知'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 端口信息 */}
                <div>
                  <h4 className="font-medium mb-2">端口</h4>
                  <div className="flex flex-wrap gap-2">
                    {service.ports.map((port, index) => (
                      <Badge key={index} variant="secondary">
                        {port.port}:{port.target_port} ({port.protocol})
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* 选择器 */}
                <div>
                  <h4 className="font-medium mb-2">选择器</h4>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(service.selector).map(([key, value]) => (
                      <Badge key={key} variant="outline" className="text-xs">
                        {key}: {value}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* 标签 */}
                {Object.keys(service.labels).length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">标签</h4>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(service.labels).map(([key, value]) => (
                        <Badge key={key} variant="secondary" className="text-xs">
                          {key}: {value}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
