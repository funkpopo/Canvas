"use client";

import { useEffect, useMemo, useState } from "react";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { Modal } from "./modal";
import { Button } from "./button";

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
  const [text, setText] = useState<string>(initialYaml);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string>("");

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

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!dirty || confirm("Discard unsaved changes?")) onClose();
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
    </Modal>
  );
}

