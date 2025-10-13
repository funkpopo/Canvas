"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, XCircle, Loader2, Settings, AlertTriangle } from "lucide-react";
import { ingressApi } from "@/lib/api";
import { toast } from "sonner";

interface ControllerInstallerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: number | null;
  onSuccess: () => void;
}

const VERSION_OPTIONS = [
  { value: "latest", label: "最新版本 (推荐)" },
  { value: "v1.9.6", label: "v1.9.6 (稳定)" },
  { value: "v1.8.5", label: "v1.8.5" },
  { value: "v1.7.1", label: "v1.7.1" },
];

export default function ControllerInstaller({
  open,
  onOpenChange,
  clusterId,
  onSuccess
}: ControllerInstallerProps) {
  const [version, setVersion] = useState("latest");
  const [customVersion, setCustomVersion] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState(0);

  const handleInstall = async () => {
    if (!clusterId) return;

    const installVersion = version === "custom" ? customVersion : version;

    setIsInstalling(true);
    setInstallResult(null);
    setCurrentStep(0);

    try {
      const response = await ingressApi.installController(clusterId, { version: installVersion });

      if (response.data) {
        setInstallResult(response.data);

        if (response.data.success) {
          toast.success("Ingress Controller安装成功");
          onSuccess();
          setTimeout(() => onOpenChange(false), 2000);
        } else {
          toast.error(`安装失败: ${response.data.error}`);
        }
      } else {
        toast.error(`安装失败: ${response.error}`);
      }
    } catch (error) {
      toast.error("安装Controller失败");
    } finally {
      setIsInstalling(false);
    }
  };

  const handleClose = () => {
    setInstallResult(null);
    setIsInstalling(false);
    setCurrentStep(0);
    onOpenChange(false);
  };

  const getStepIcon = (stepIndex: number, stepName: string) => {
    if (!installResult) return <div className="w-6 h-6 rounded-full border-2 border-gray-300" />;

    const stepCompleted = installResult.steps?.some((step: string) =>
      step.includes(stepName) && step.includes("成功")
    );
    const stepFailed = installResult.steps?.some((step: string) =>
      step.includes(stepName) && (step.includes("失败") || step.includes("⚠"))
    );

    if (stepCompleted) {
      return <CheckCircle className="w-6 h-6 text-green-500" />;
    } else if (stepFailed) {
      return <XCircle className="w-6 h-6 text-red-500" />;
    } else {
      return <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center">
        <div className="w-2 h-2 bg-gray-300 rounded-full" />
      </div>;
    }
  };

  const installSteps = [
    "创建ingress-nginx命名空间",
    "创建ServiceAccount",
    "创建ClusterRole",
    "创建ClusterRoleBinding",
    "创建ConfigMap",
    "创建Service",
    "创建Deployment",
    "创建IngressClass",
    "创建Admission Webhook"
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            安装Ingress Controller
          </DialogTitle>
        </DialogHeader>

        {!isInstalling && !installResult ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="version">Controller版本</Label>
              <Select value={version} onValueChange={setVersion}>
                <SelectTrigger>
                  <SelectValue placeholder="选择版本" />
                </SelectTrigger>
                <SelectContent>
                  {VERSION_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">自定义版本</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {version === "custom" && (
              <div className="space-y-2">
                <Label htmlFor="customVersion">自定义版本</Label>
                <Input
                  id="customVersion"
                  placeholder="例如: v1.9.6"
                  value={customVersion}
                  onChange={(e) => setCustomVersion(e.target.value)}
                />
              </div>
            )}

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                这将安装ingress-nginx controller到您的集群中，包括必要的RBAC权限和服务。
                安装过程可能需要几分钟，请耐心等待。
              </AlertDescription>
            </Alert>
          </div>
        ) : isInstalling ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>正在安装Ingress Controller...</span>
            </div>
            <Progress value={(currentStep / installSteps.length) * 100} />
            <div className="space-y-2">
              {installSteps.map((step, index) => (
                <div key={index} className="flex items-center gap-3">
                  {getStepIcon(index, step)}
                  <span className="text-sm">{step}</span>
                </div>
              ))}
            </div>
          </div>
        ) : installResult ? (
          <div className="space-y-4">
            {installResult.success ? (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription className="text-green-700">
                  {installResult.message}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  {installResult.error || "安装失败"}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2 max-h-60 overflow-y-auto">
              <Label>安装步骤详情：</Label>
              {installResult.steps?.map((step: string, index: number) => (
                <div key={index} className="text-sm font-mono bg-gray-50 p-2 rounded">
                  {step}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {!isInstalling && !installResult ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                取消
              </Button>
              <Button onClick={handleInstall}>
                开始安装
              </Button>
            </>
          ) : installResult ? (
            <Button onClick={handleClose}>
              关闭
            </Button>
          ) : (
            <Button variant="outline" onClick={handleClose} disabled={isInstalling}>
              取消
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
