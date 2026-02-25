"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCluster } from "@/lib/cluster-context";
import { deploymentApi, namespaceApi } from "@/lib/api";
import { useTranslations } from "@/hooks/use-translations";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";

const YamlEditor = dynamic(() => import("@/components/YamlEditor"), { ssr: false });

interface Container {
  name: string;
  image: string;
  ports: { containerPort: number; protocol: string }[];
  env: { name: string; value: string }[];
  resources: {
    limits: { cpu: string; memory: string };
    requests: { cpu: string; memory: string };
  };
}

interface Namespace {
  name: string;
  status: string;
}

function buildYamlFromForm(
  name: string,
  namespace: string,
  replicas: number,
  containers: Container[],
  strategy: string,
  labels: { key: string; value: string }[]
): string {
  const labelObj: Record<string, string> = { app: name };
  labels.forEach((l) => {
    if (l.key.trim()) labelObj[l.key.trim()] = l.value;
  });

  const labelYaml = Object.entries(labelObj)
    .map(([k, v]) => `      ${k}: "${v}"`)
    .join("\n");
  const selectorYaml = Object.entries(labelObj)
    .map(([k, v]) => `        ${k}: "${v}"`)
    .join("\n");

  const containersYaml = containers
    .map((c) => {
      let yaml = `      - name: ${c.name || "container"}\n        image: ${c.image || "nginx:latest"}`;
      if (c.ports.length > 0) {
        yaml += "\n        ports:";
        c.ports.forEach((p) => {
          yaml += `\n        - containerPort: ${p.containerPort}\n          protocol: ${p.protocol}`;
        });
      }
      if (c.env.length > 0 && c.env.some((e) => e.name.trim())) {
        yaml += "\n        env:";
        c.env.forEach((e) => {
          if (e.name.trim()) yaml += `\n        - name: ${e.name}\n          value: "${e.value}"`;
        });
      }
      const hasLimits = c.resources.limits.cpu || c.resources.limits.memory;
      const hasRequests = c.resources.requests.cpu || c.resources.requests.memory;
      if (hasLimits || hasRequests) {
        yaml += "\n        resources:";
        if (hasLimits) {
          yaml += "\n          limits:";
          if (c.resources.limits.cpu) yaml += `\n            cpu: "${c.resources.limits.cpu}"`;
          if (c.resources.limits.memory)
            yaml += `\n            memory: "${c.resources.limits.memory}"`;
        }
        if (hasRequests) {
          yaml += "\n          requests:";
          if (c.resources.requests.cpu) yaml += `\n            cpu: "${c.resources.requests.cpu}"`;
          if (c.resources.requests.memory)
            yaml += `\n            memory: "${c.resources.requests.memory}"`;
        }
      }
      return yaml;
    })
    .join("\n");

  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name || "my-deployment"}
  namespace: ${namespace || "default"}
  labels:
${labelYaml}
spec:
  replicas: ${replicas}
  strategy:
    type: ${strategy}
  selector:
    matchLabels:
${selectorYaml}
  template:
    metadata:
      labels:
${selectorYaml}
    spec:
      containers:
${containersYaml}
`;
}

const defaultContainer: Container = {
  name: "container-1",
  image: "",
  ports: [{ containerPort: 80, protocol: "TCP" }],
  env: [],
  resources: {
    limits: { cpu: "", memory: "" },
    requests: { cpu: "", memory: "" },
  },
};

export default function CreateDeploymentPage() {
  const t = useTranslations("deployments");
  const tCommon = useTranslations("common");
  const { runWithFeedback } = useAsyncActionFeedback();
  const router = useRouter();
  const { activeCluster } = useCluster();

  const [activeTab, setActiveTab] = useState("form");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState("my-deployment");
  const [namespace, setNamespace] = useState("default");
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [replicas, setReplicas] = useState(1);
  const [strategy, setStrategy] = useState("RollingUpdate");
  const [containers, setContainers] = useState<Container[]>([{ ...defaultContainer }]);
  const [labels, setLabels] = useState<{ key: string; value: string }[]>([]);

  // YAML state
  const [yamlContent, setYamlContent] = useState("");
  const [yamlError, setYamlError] = useState("");

  const clusterId = activeCluster?.id ?? null;

  useEffect(() => {
    if (clusterId) {
      namespaceApi.getNamespaces(clusterId).then((res) => {
        if (res.data) setNamespaces(res.data);
      });
    }
  }, [clusterId]);

  // Sync form -> YAML when on form tab
  useEffect(() => {
    if (activeTab === "form") {
      setYamlContent(buildYamlFromForm(name, namespace, replicas, containers, strategy, labels));
    }
  }, [name, namespace, replicas, containers, strategy, labels, activeTab]);

  const updateContainer = (index: number, updates: Partial<Container>) => {
    setContainers((prev) => prev.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  };

  const handleSubmit = async () => {
    if (!clusterId) {
      toast.error(t("selectClusterFirst"));
      return;
    }
    const content = yamlContent.trim();
    if (!content) {
      toast.error(t("yamlRequired"));
      return;
    }

    setIsSubmitting(true);
    try {
      await runWithFeedback(
        async () => {
          const response = await deploymentApi.createDeployment(clusterId, {
            yaml_content: content,
          });
          if (!response.data) {
            throw new Error(response.error || t("createErrorUnknown"));
          }
          router.push("/deployments");
        },
        {
          loading: t("createLoading"),
          success: t("createSuccess"),
          error: t("createError"),
        }
      );
    } catch (error) {
      console.error("create deployment failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/deployments">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("backToDeployments")}
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{t("createDeploymentTitle")}</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="form">{t("formTab")}</TabsTrigger>
          <TabsTrigger value="yaml">{t("yamlTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="space-y-6 mt-4">
          {/* 基本信息 */}
          <Card>
            <CardHeader>
              <CardTitle>{t("basicInfo")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{tCommon("name")}</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("namespace")}</Label>
                  <Select value={namespace} onValueChange={setNamespace}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("selectNamespace")} />
                    </SelectTrigger>
                    <SelectContent>
                      {namespaces.map((ns) => (
                        <SelectItem key={ns.name} value={ns.name}>
                          {ns.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("replicas")}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={replicas}
                    onChange={(e) => setReplicas(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("strategy")}</Label>
                  <Select value={strategy} onValueChange={setStrategy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RollingUpdate">{t("rollingUpdate")}</SelectItem>
                      <SelectItem value="Recreate">{t("recreate")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 容器配置 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("containerConfig")}</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setContainers((prev) => [
                    ...prev,
                    { ...defaultContainer, name: `container-${prev.length + 1}` },
                  ])
                }
              >
                <Plus className="h-4 w-4 mr-1" />
                {t("addContainer")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {containers.map((container, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Container #{idx + 1}</h4>
                    {containers.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setContainers((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("removeContainer")}
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("containerName")}</Label>
                      <Input
                        value={container.name}
                        onChange={(e) => updateContainer(idx, { name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("containerImage")}</Label>
                      <Input
                        value={container.image}
                        onChange={(e) => updateContainer(idx, { image: e.target.value })}
                        placeholder={t("containerImagePlaceholder")}
                      />
                    </div>
                  </div>

                  {/* Ports */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>{t("containerPort")}</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          updateContainer(idx, {
                            ports: [...container.ports, { containerPort: 80, protocol: "TCP" }],
                          })
                        }
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {t("addPort")}
                      </Button>
                    </div>
                    {container.ports.map((port, pIdx) => (
                      <div key={pIdx} className="flex gap-2 items-center">
                        <Input
                          type="number"
                          value={port.containerPort}
                          onChange={(e) => {
                            const newPorts = [...container.ports];
                            newPorts[pIdx] = {
                              ...newPorts[pIdx],
                              containerPort: parseInt(e.target.value) || 0,
                            };
                            updateContainer(idx, { ports: newPorts });
                          }}
                          className="w-32"
                        />
                        <Select
                          value={port.protocol}
                          onValueChange={(v) => {
                            const newPorts = [...container.ports];
                            newPorts[pIdx] = { ...newPorts[pIdx], protocol: v };
                            updateContainer(idx, { ports: newPorts });
                          }}
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="TCP">TCP</SelectItem>
                            <SelectItem value="UDP">UDP</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            updateContainer(idx, {
                              ports: container.ports.filter((_, i) => i !== pIdx),
                            })
                          }
                          aria-label={`${tCommon("delete")}: ${t("containerPort")} ${pIdx + 1}`}
                          title={`${tCommon("delete")}: ${t("containerPort")} ${pIdx + 1}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Resource Limits */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("resourceLimits")}</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder={`${t("cpuLabel")} (e.g. 500m)`}
                          value={container.resources.limits.cpu}
                          onChange={(e) =>
                            updateContainer(idx, {
                              resources: {
                                ...container.resources,
                                limits: { ...container.resources.limits, cpu: e.target.value },
                              },
                            })
                          }
                        />
                        <Input
                          placeholder={`${t("memoryLabel")} (e.g. 256Mi)`}
                          value={container.resources.limits.memory}
                          onChange={(e) =>
                            updateContainer(idx, {
                              resources: {
                                ...container.resources,
                                limits: { ...container.resources.limits, memory: e.target.value },
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("resourceRequests")}</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder={`${t("cpuLabel")} (e.g. 250m)`}
                          value={container.resources.requests.cpu}
                          onChange={(e) =>
                            updateContainer(idx, {
                              resources: {
                                ...container.resources,
                                requests: { ...container.resources.requests, cpu: e.target.value },
                              },
                            })
                          }
                        />
                        <Input
                          placeholder={`${t("memoryLabel")} (e.g. 128Mi)`}
                          value={container.resources.requests.memory}
                          onChange={(e) =>
                            updateContainer(idx, {
                              resources: {
                                ...container.resources,
                                requests: {
                                  ...container.resources.requests,
                                  memory: e.target.value,
                                },
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Labels */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("labels")}</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLabels((prev) => [...prev, { key: "", value: "" }])}
              >
                <Plus className="h-4 w-4 mr-1" />
                {t("addLabel")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {labels.map((label, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Input
                    placeholder={t("labelKey")}
                    value={label.key}
                    onChange={(e) =>
                      setLabels((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, key: e.target.value } : l))
                      )
                    }
                  />
                  <Input
                    placeholder={t("labelValue")}
                    value={label.value}
                    onChange={(e) =>
                      setLabels((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, value: e.target.value } : l))
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLabels((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label={`${tCommon("delete")}: ${t("labels")} ${idx + 1}`}
                    title={`${tCommon("delete")}: ${t("labels")} ${idx + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="yaml" className="mt-4">
          <YamlEditor
            value={yamlContent}
            onChange={(value) => {
              setYamlContent(value);
              setYamlError("");
            }}
            error={yamlError}
            label={t("yamlTab")}
          />
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-4">
        <Link href="/deployments">
          <Button variant="outline">{tCommon("cancel")}</Button>
        </Link>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {t("createDeploymentTitle")}
        </Button>
      </div>
    </div>
  );
}
