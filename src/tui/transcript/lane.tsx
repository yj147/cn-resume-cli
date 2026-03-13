import { Box } from "ink";
import { AssistantMessage } from "./assistant-message.js";
import { UserMessage } from "./user-message.js";
import { ToolCard } from "./tool-card.js";
import { StatusCard } from "./status-card.js";

const TRANSCRIPT_WINDOW_SIZE = 100;

function renderTranscriptItem(item) {
  if (item.kind === "assistant") {
    return <AssistantMessage item={item} />;
  }
  if (item.kind === "user") {
    return <UserMessage item={item} />;
  }
  if (item.kind === "tool") {
    return <ToolCard item={item} />;
  }
  return <StatusCard item={item} />;
}

export function TranscriptLane({ items = [], windowSize = TRANSCRIPT_WINDOW_SIZE }) {
  const visibleItems = Array.isArray(items) ? items.slice(-windowSize) : [];
  return (
    <Box flexDirection="column">
      {visibleItems.map((item) => (
        <Box key={item.id || `${item.kind}-${item.content || item.summary || "item"}`} flexDirection="column">
          {renderTranscriptItem(item)}
        </Box>
      ))}
    </Box>
  );
}
