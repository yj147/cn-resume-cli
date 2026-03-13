export type ChatDiffPreviewLineKind = "add" | "remove" | "meta";

export interface ChatDiffPreviewLine {
  kind: ChatDiffPreviewLineKind;
  text: string;
}

export interface ChatEvent {
  type:
    | "user_message"
    | "assistant_delta"
    | "assistant_completed"
    | "plan_proposed"
    | "approval_requested"
    | "task_started"
    | "task_finished"
    | "layout_overflow"
    | "layout_decision_requested"
    | "layout_decision_recorded"
    | "template_comparison_ready"
    | "template_selected"
    | "error";
  at: string;
  [key: string]: unknown;
}

export function createChatEvent(type: ChatEvent["type"], payload: Record<string, unknown> = {}): ChatEvent {
  return {
    type,
    at: new Date().toISOString(),
    ...payload
  };
}
