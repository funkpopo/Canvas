"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, AlertCircle } from "lucide-react";

interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  error?: string;
  placeholder?: string;
  label?: string;
  template?: string;
  onApplyTemplate?: () => void;
  className?: string;
  readOnly?: boolean;
  height?: string;
}

export default function YamlEditor({
  value,
  onChange,
  onSave,
  error,
  placeholder = "请输入YAML配置...",
  label = "YAML配置",
  template,
  onApplyTemplate,
  className = "",
  readOnly = false,
  height = "300px"
}: YamlEditorProps) {
  const [isValid, setIsValid] = useState(true);

  useEffect(() => {
    // 非常宽松的YAML验证 - 只检查最基本的语法问题
    try {
      if (value.trim()) {
        const lines = value.split('\n');
        let inMultilineString = false;
        let multilineIndent = -1;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();

          // 跳过空行和注释
          if (!trimmed || trimmed.startsWith('#')) continue;

          // 检查多行字符串
          if (trimmed.includes('|-') || trimmed.includes('>') || trimmed.includes('|')) {
            inMultilineString = true;
            multilineIndent = line.length - line.trimStart().length;
          }

          // 如果在多行字符串中，检查缩进
          if (inMultilineString && multilineIndent >= 0) {
            const currentIndent = line.length - line.trimStart().length;
            if (currentIndent < multilineIndent && !trimmed.includes('|-') && !trimmed.includes('>')) {
              // 可能是多行字符串结束
              inMultilineString = false;
              multilineIndent = -1;
            }
          }

          // 基本检查：确保YAML结构合理
          // 只检查最明显的问题，避免过于严格
          if (!inMultilineString) {
            // 检查是否有不成对的引号（非常基本）
            const quoteCount = (trimmed.match(/"/g) || []).length;
            if (quoteCount % 2 !== 0 && !trimmed.includes('\\"')) {
              // 允许在注释或特定上下文中存在不成对的引号
              if (!trimmed.includes('#') && !trimmed.includes('|')) {
                // 这个检查过于严格，先注释掉
                // throw new Error(`第${i + 1}行: 引号不匹配`);
              }
            }
          }
        }
      }
      setIsValid(true);
    } catch (err) {
      setIsValid(false);
    }
  }, [value]);

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        {template && onApplyTemplate && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onApplyTemplate}
            className="h-6 text-xs"
          >
            <FileText className="w-3 h-3 mr-1" />
            使用模板
          </Button>
        )}
      </div>

      <Textarea
        placeholder={placeholder}
        value={value}
        onChange={(e) => !readOnly && onChange(e.target.value)}
        readOnly={readOnly}
        className={`font-mono text-sm ${!isValid || error ? 'border-red-500' : ''}`}
        style={{
          fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
          minHeight: height,
          height: height
        }}
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {!isValid && !error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">YAML语法错误，请检查配置</AlertDescription>
        </Alert>
      )}

      {onSave && (
        <div className="flex justify-end">
          <Button
            onClick={onSave}
            disabled={!isValid || !!error}
            size="sm"
          >
            保存配置
          </Button>
        </div>
      )}
    </div>
  );
}
