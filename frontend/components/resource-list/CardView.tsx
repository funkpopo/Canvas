"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ItemCheckbox } from "@/components/BatchOperations";
import type { ActionDef, BaseResource, CardRenderConfig } from "./types";

export interface ResourceListCardViewProps<T extends BaseResource> {
  items: T[];
  actions: ActionDef<T>[];
  cardConfig: CardRenderConfig<T>;
  batchOpsEnabled: boolean;
  selectedItems: string[];
  onSelectionChange: (ids: string[]) => void;
  onCardClick?: (item: T) => void;
}

export function ResourceListCardView<T extends BaseResource>({
  items,
  actions,
  cardConfig,
  batchOpsEnabled,
  selectedItems,
  onSelectionChange,
  onCardClick,
}: ResourceListCardViewProps<T>) {
  const toggleSelection = (itemId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedItems, itemId]);
    } else {
      onSelectionChange(selectedItems.filter((id) => id !== itemId));
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((item) => {
        const defaultActionsNode =
          actions.length > 0 ? (
            <div className="flex justify-end space-x-2">
              {actions.map((action) => {
                const visible = action.visible ? action.visible(item) : true;
                const disabled = action.disabled ? action.disabled(item) : false;
                if (!visible) return null;

                const ActionIcon = action.icon;
                return (
                  <Button
                    key={action.key}
                    variant={action.variant || "outline"}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      action.onClick(item);
                    }}
                    disabled={disabled}
                    className={action.danger ? "text-red-600 hover:text-red-700" : ""}
                    title={action.tooltip}
                  >
                    <ActionIcon className="w-4 h-4" />
                  </Button>
                );
              })}
            </div>
          ) : null;

        return (
          <Card
            key={item.id}
            className={`hover:shadow-lg transition-shadow ${onCardClick ? "cursor-pointer" : ""}`}
            onClick={onCardClick ? () => onCardClick(item) : undefined}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {batchOpsEnabled && (
                    <ItemCheckbox
                      itemId={item.id}
                      isSelected={selectedItems.includes(item.id)}
                      onChange={toggleSelection}
                    />
                  )}
                  <CardTitle className="text-lg truncate max-w-[200px]" title={item.name}>
                    {cardConfig.title(item)}
                  </CardTitle>
                </div>
                {cardConfig.status && cardConfig.status(item)}
              </div>
              {cardConfig.subtitle && <CardDescription>{cardConfig.subtitle(item)}</CardDescription>}
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {cardConfig.content(item)}
                {cardConfig.actions ? cardConfig.actions(item, defaultActionsNode) : defaultActionsNode}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}


