"use client";

import { useEffect, useMemo, useState } from "react";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { Modal } from "./modal";
import { Button } from "./button";
import { ConfirmDialog } from "./confirm-dialog";
import { useI18n } from "@/shared/i18n/i18n";

export type YamlEditorProps = {
  open: boolean;
  title: string;
  description?: string;
  initialYaml?: string;
  onClose: () => void;
  onSave: (yaml: string) => Promise<void> | void;
  validateKind?: string | string[] | null;
};

export function YamlEditor({ open, title, description, initialYaml = "", onClose, onSave, validateKind }: YamlEditorProps) {
  const { t, language } = useI18n();
  const [text, setText] = useState<string>(initialYaml);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string>("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    setText(initialYaml);
    setDirty(false);
    setError("");
  }, [initialYaml, open]);

  const canSave = useMemo(() => {
    if (!text || text.trim().length === 0) return false;
    try {
      const obj = parseYaml(text) as any;
      if (validateKind) {
        const kinds = Array.isArray(validateKind) ? validateKind : [validateKind];
        const kind = String(obj?.kind || "");
        if (kinds.length > 0 && kind && !kinds.includes(kind)) {
          setError(`YAML kind must be one of: ${kinds.join(", ")}`);
          return false;
        }
      }
      setError("");
      return true;
    } catch (e: any) {
      setError(e?.message || "Invalid YAML");
      return false;
    }
  }, [text, validateKind]);

  function handleFormat() {
    try {
      const obj = parseYaml(text);
      const pretty = stringifyYaml(obj as any);
      setText(pretty);
      setDirty(true);
    } catch (e: any) {
      setError(e?.message || "Invalid YAML");
    }
  }

  async function handleSave() {
    if (!canSave) return;
    try {
      await onSave(text);
      setDirty(false);
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    }
  }

  const discardTitle = (() => {
    const k = t("yaml.discard.title" as any);
    return k === "yaml.discard.title" ? "Discard unsaved changes?" : k;
  })();
  const discardDesc = (() => {
    const k = t("yaml.discard.desc" as any);
    return k === "yaml.discard.desc" ? "You have unsaved changes that will be lost." : k;
  })();

  const continueText = (() => {
    const k = t("actions.continue" as any);
    if (k === "actions.continue") return language === "zh" ? "继续" : "Continue";
    return k;
  })();

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!dirty) return onClose();
        setConfirmDiscard(true);
      }}
      title={title}
      description={description}
      className="max-w-4xl"
    >
      <div className="mb-3 flex items-center gap-2">
        <Button type="button" variant="outline" onClick={handleFormat}>Format</Button>
        <Button type="button" onClick={handleSave} disabled={!canSave}>Apply</Button>
        {dirty && <span className="text-xs text-text-muted">Unsaved</span>}
        {error && <span className="ml-auto text-xs text-error">{error}</span>}
      </div>
      <textarea
        className="w-full min-h-[420px] rounded-md border border-border bg-background p-2 font-mono text-sm text-text-primary"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
      />
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={(o) => { if (!o) setConfirmDiscard(false); }}
        title={discardTitle}
        description={discardDesc}
        confirmText={continueText}
        cancelText={t("actions.cancel")}
        confirmVariant="destructive"
        onConfirm={async () => { setConfirmDiscard(false); onClose(); }}
      />
    </Modal>
  );
}
