"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Trash2,
  RotateCcw,
  Tag,
  CheckSquare,
  Square,
  AlertTriangle
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "sonner";

export interface BatchOperationItem {
  id: string;
  name: string;
  namespace: string;
  cluster_id: number;
  cluster_name: string;
}

export interface BatchOperationsProps<T extends BatchOperationItem> {
  items: T[];
  selectedItems: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  onBatchDelete?: (items: T[]) => Promise<void>;
  onBatchRestart?: (items: T[]) => Promise<void>;
  onBatchLabelUpdate?: (items: T[], labels: Record<string, string>) => Promise<void>;
  resourceType: string;
  supportedOperations: {
    delete?: boolean;
    restart?: boolean;
    label?: boolean;
  };
}

export function BatchOperations<T extends BatchOperationItem>({
  items,
  selectedItems,
  onSelectionChange,
  onBatchDelete,
  onBatchRestart,
  onBatchLabelUpdate,
  resourceType,
  supportedOperations,
}: BatchOperationsProps<T>) {
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
    variant: "destructive" as "default" | "destructive",
  });
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSelectAll = () => {
    if (selectedItems.length === items.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(items.map(item => item.id));
    }
  };

  const handleItemSelect = (itemId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedItems, itemId]);
    } else {
      onSelectionChange(selectedItems.filter(id => id !== itemId));
    }
  };

  const handleBatchDelete = () => {
    if (!onBatchDelete || selectedItems.length === 0) return;

    const selectedItemsData = items.filter(item => selectedItems.includes(item.id));
    setConfirmDialog({
      open: true,
      title: `批量删除${resourceType}`,
      description: `确定要删除选中的 ${selectedItems.length} 个${resourceType}吗？此操作不可撤销。\n\n选中项目：\n${selectedItemsData.map(item => `- ${item.namespace}/${item.name}`).join('\n')}`,
      onConfirm: () => performBatchDelete(selectedItemsData),
      variant: "destructive",
    });
  };

  const performBatchDelete = async (selectedItemsData: T[]) => {
    if (!onBatchDelete) return;

    setIsProcessing(true);
    try {
      await onBatchDelete(selectedItemsData);
      toast.success(`批量删除${resourceType}成功`);
      onSelectionChange([]);
    } catch (error) {
      toast.error(`批量删除${resourceType}失败: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchRestart = () => {
    if (!onBatchRestart || selectedItems.length === 0) return;

    const selectedItemsData = items.filter(item => selectedItems.includes(item.id));
    setConfirmDialog({
      open: true,
      title: `批量重启${resourceType}`,
      description: `确定要重启选中的 ${selectedItems.length} 个${resourceType}吗？\n\n选中项目：\n${selectedItemsData.map(item => `- ${item.namespace}/${item.name}`).join('\n')}`,
      onConfirm: () => performBatchRestart(selectedItemsData),
      variant: "default",
    });
  };

  const performBatchRestart = async (selectedItemsData: T[]) => {
    if (!onBatchRestart) return;

    setIsProcessing(true);
    try {
      await onBatchRestart(selectedItemsData);
      toast.success(`批量重启${resourceType}成功`);
      onSelectionChange([]);
    } catch (error) {
      toast.error(`批量重启${resourceType}失败: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedCount = selectedItems.length;
  const hasSelection = selectedCount > 0;

  return (
    <>
      {hasSelection && (
        <Alert className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            已选择 {selectedCount} 个{resourceType}，
            <Button
              variant="link"
              className="p-0 h-auto font-normal"
              onClick={() => onSelectionChange([])}
            >
              取消选择
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* 批量操作栏 */}
      {hasSelection && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-muted rounded-lg">
          <Badge variant="secondary">
            {selectedCount} 项已选择
          </Badge>

          <div className="flex gap-2 ml-auto">
            {supportedOperations.delete && (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleBatchDelete}
                disabled={isProcessing}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                批量删除
              </Button>
            )}

            {supportedOperations.restart && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleBatchRestart}
                disabled={isProcessing}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                批量重启
              </Button>
            )}

            {supportedOperations.label && (
              <Button
                size="sm"
                variant="outline"
                disabled={isProcessing}
              >
                <Tag className="h-4 w-4 mr-1" />
                批量标签
              </Button>
            )}
          </div>
        </div>
      )}

      {/* 全选复选框 */}
      <div className="flex items-center gap-2 mb-4">
        <Checkbox
          checked={selectedItems.length === items.length && items.length > 0}
          onCheckedChange={handleSelectAll}
        />
        <span className="text-sm text-muted-foreground">
          全选 ({items.length} 项)
        </span>
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant={confirmDialog.variant}
      />
    </>
  );
}

// 单个项目的选择复选框组件
export interface ItemCheckboxProps {
  itemId: string;
  isSelected: boolean;
  onChange: (itemId: string, checked: boolean) => void;
}

export function ItemCheckbox({ itemId, isSelected, onChange }: ItemCheckboxProps) {
  return (
    <Checkbox
      checked={isSelected}
      onCheckedChange={(checked) => {
        onChange(itemId, checked as boolean);
      }}
      onClick={(e) => e.stopPropagation()}
      className="mr-2"
    />
  );
}
