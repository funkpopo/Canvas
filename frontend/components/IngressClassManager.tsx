"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Edit, Loader2, Layers, Star } from "lucide-react";
import { ingressApi } from "@/lib/api";
import { toast } from "sonner";
import IngressClassForm from "@/components/IngressClassForm";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface IngressClassData {
  name: string;
  controller: string;
  is_default: boolean;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  age: string;
}

interface IngressClassManagerProps {
  clusterId: number | null;
}

export default function IngressClassManager({ clusterId }: IngressClassManagerProps) {
  const [classes, setClasses] = useState<IngressClassData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingClass, setEditingClass] = useState<IngressClassData | null>(null);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  const fetchClasses = async () => {
    if (!clusterId) return;

    setIsLoading(true);
    try {
      const response = await ingressApi.getIngressClasses(clusterId);
      if (response.data) {
        setClasses(response.data);
      } else {
        toast.error(`获取IngressClass列表失败: ${response.error}`);
      }
    } catch (error) {
      toast.error("获取IngressClass列表失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, [clusterId]);

  const handleCreateSuccess = () => {
    setShowCreateForm(false);
    fetchClasses();
  };

  const handleEditSuccess = () => {
    setEditingClass(null);
    fetchClasses();
  };

  const handleDeleteClass = (className: string) => {
    if (!clusterId) return;

    setConfirmDialog({
      open: true,
      title: "确认删除",
      description: `确定要删除IngressClass "${className}" 吗？此操作无法撤销。`,
      onConfirm: async () => {
        try {
          const response = await ingressApi.deleteIngressClass(clusterId, className);
          if (response.data) {
            toast.success("IngressClass删除成功");
            fetchClasses();
          } else {
            toast.error(`删除失败: ${response.error}`);
          }
        } catch (error) {
          toast.error("删除IngressClass失败");
        }
      },
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5" />
                IngressClass管理
              </CardTitle>
              <CardDescription>
                定义不同的Ingress控制器配置，支持多控制器共存
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              创建IngressClass
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="ml-2">加载中...</span>
            </div>
          ) : classes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>暂无IngressClass</p>
              <p className="text-sm">创建IngressClass来定义不同的入口控制器配置</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>控制器</TableHead>
                  <TableHead>默认</TableHead>
                  <TableHead>标签数量</TableHead>
                  <TableHead>注解数量</TableHead>
                  <TableHead>年龄</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((cls) => (
                  <TableRow key={cls.name}>
                    <TableCell className="font-medium">{cls.name}</TableCell>
                    <TableCell className="font-mono text-sm">{cls.controller}</TableCell>
                    <TableCell>
                      {cls.is_default && (
                        <Badge variant="default" className="bg-blue-500">
                          <Star className="w-3 h-3 mr-1" />
                          默认
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {Object.keys(cls.labels || {}).length}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {Object.keys(cls.annotations || {}).length}
                      </Badge>
                    </TableCell>
                    <TableCell>{cls.age}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingClass(cls)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteClass(cls.name)}
                          className="text-red-600 hover:text-red-700"
                          disabled={cls.is_default} // 不允许删除默认的
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 创建IngressClass对话框 */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>创建IngressClass</DialogTitle>
          </DialogHeader>
          <IngressClassForm
            clusterId={clusterId}
            onSuccess={handleCreateSuccess}
            onCancel={() => setShowCreateForm(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 编辑IngressClass对话框 */}
      <Dialog open={!!editingClass} onOpenChange={() => setEditingClass(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑IngressClass: {editingClass?.name}</DialogTitle>
          </DialogHeader>
          <IngressClassForm
            clusterId={clusterId}
            initialData={editingClass}
            onSuccess={handleEditSuccess}
            onCancel={() => setEditingClass(null)}
          />
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        confirmText="删除"
        variant="destructive"
      />
    </div>
  );
}
