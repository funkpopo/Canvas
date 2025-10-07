"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/shared/ui/modal";
import { Button } from "@/shared/ui/button";

interface AlertRuleModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    severity: string;
    expr: string;
    summary?: string;
    description?: string;
    labels?: Record<string, any>;
    annotations?: Record<string, any>;
    enabled: boolean;
  }) => Promise<void>;
  initialData?: {
    name: string;
    severity: string;
    expr: string;
    summary?: string | null;
    description?: string | null;
    labels?: Record<string, any> | null;
    annotations?: Record<string, any> | null;
    enabled: boolean;
  } | null;
  mode: "create" | "edit";
}

const inputCls = "w-full rounded-md border border-[var(--canvas-border)] bg-[var(--canvas-surface)] px-3 py-2 text-sm text-[var(--canvas-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--canvas-primary)] font-mono";
const labelCls = "block text-sm font-medium text-[var(--canvas-text-primary)] mb-1";

export function AlertRuleModal({ open, onClose, onSubmit, initialData, mode }: AlertRuleModalProps) {
  const [name, setName] = useState("");
  const [severity, setSeverity] = useState("warning");
  const [expr, setExpr] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [labelsJson, setLabelsJson] = useState("{}");
  const [annotationsJson, setAnnotationsJson] = useState("{}");
  const [enabled, setEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && initialData) {
      setName(initialData.name || "");
      setSeverity(initialData.severity || "warning");
      setExpr(initialData.expr || "");
      setSummary(initialData.summary || "");
      setDescription(initialData.description || "");
      setLabelsJson(JSON.stringify(initialData.labels || {}, null, 2));
      setAnnotationsJson(JSON.stringify(initialData.annotations || {}, null, 2));
      setEnabled(initialData.enabled ?? true);
    } else if (open && !initialData) {
      // Reset for create mode
      setName("");
      setSeverity("warning");
      setExpr("");
      setSummary("");
      setDescription("");
      setLabelsJson("{}");
      setAnnotationsJson("{}");
      setEnabled(true);
    }
    setError(null);
  }, [open, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !expr.trim()) {
      setError("Name and expression are required");
      return;
    }

    // Validate JSON
    let labels: Record<string, any> = {};
    let annotations: Record<string, any> = {};
    try {
      labels = JSON.parse(labelsJson || "{}");
    } catch {
      setError("Invalid JSON in Labels field");
      return;
    }
    try {
      annotations = JSON.parse(annotationsJson || "{}");
    } catch {
      setError("Invalid JSON in Annotations field");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        severity: severity.trim(),
        expr: expr.trim(),
        summary: summary.trim() || undefined,
        description: description.trim() || undefined,
        labels,
        annotations,
        enabled,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save rule");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setError(null);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={mode === "create" ? "Create Alert Rule" : "Edit Alert Rule"}
      description={mode === "create" ? "Add a new alert rule template" : "Modify alert rule template"}
      className="max-w-4xl"
      footer={
        <div className="flex items-center justify-between">
          <div className="text-sm text-[var(--canvas-text-muted)]">
            {error && <span className="text-red-400">{error}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Saving..." : mode === "create" ? "Create" : "Save"}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="name" className={labelCls}>
              Rule Name <span className="text-red-400">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="PodMemoryHigh"
              required
            />
          </div>

          <div>
            <label htmlFor="severity" className={labelCls}>
              Severity <span className="text-red-400">*</span>
            </label>
            <select
              id="severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className={inputCls}
              required
            >
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="critical">critical</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="expr" className={labelCls}>
            PromQL Expression <span className="text-red-400">*</span>
          </label>
          <textarea
            id="expr"
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            className={inputCls}
            placeholder='container_memory_usage_bytes{pod="my-pod"} > 1000000000'
            rows={3}
            required
          />
          <p className="mt-1 text-xs text-[var(--canvas-text-muted)]">
            Prometheus query expression
          </p>
        </div>

        <div>
          <label htmlFor="summary" className={labelCls}>
            Summary
          </label>
          <input
            id="summary"
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className={inputCls}
            placeholder="Pod memory usage is high"
          />
        </div>

        <div>
          <label htmlFor="description" className={labelCls}>
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls}
            placeholder="Detailed explanation of the alert condition..."
            rows={2}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="labels" className={labelCls}>
              Labels (JSON)
            </label>
            <textarea
              id="labels"
              value={labelsJson}
              onChange={(e) => setLabelsJson(e.target.value)}
              className={inputCls}
              placeholder='{"team": "platform"}'
              rows={4}
            />
          </div>

          <div>
            <label htmlFor="annotations" className={labelCls}>
              Annotations (JSON)
            </label>
            <textarea
              id="annotations"
              value={annotationsJson}
              onChange={(e) => setAnnotationsJson(e.target.value)}
              className={inputCls}
              placeholder='{"runbook": "https://..."}'
              rows={4}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="enabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--canvas-border)]"
          />
          <label htmlFor="enabled" className="text-sm text-[var(--canvas-text-primary)]">
            Rule enabled
          </label>
        </div>
      </form>
    </Modal>
  );
}
