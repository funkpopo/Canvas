"use client";

import { useCallback } from "react";
import { toast } from "sonner";

interface FeedbackMessages {
  loading: string;
  success: string;
  error: string;
}

export function useAsyncActionFeedback() {
  const runWithFeedback = useCallback(
    async <T>(action: () => Promise<T>, messages: FeedbackMessages): Promise<T> => {
      const toastId = toast.loading(messages.loading);
      try {
        const result = await action();
        toast.success(messages.success, { id: toastId });
        return result;
      } catch (error) {
        const detail = error instanceof Error ? error.message : "";
        const message = detail ? `${messages.error}: ${detail}` : messages.error;
        toast.error(message, { id: toastId });
        throw error;
      }
    },
    []
  );

  return { runWithFeedback };
}
