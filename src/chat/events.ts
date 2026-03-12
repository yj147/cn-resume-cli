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
