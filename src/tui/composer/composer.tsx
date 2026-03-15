import { Box, Text } from "ink";
import { buildComposerModel } from "./model.js";
import { TUI_THEME } from "../theme.js";

export function Composer(props) {
  const model = buildComposerModel(props);
  const lastLineIndex = model.lines.length - 1;
  const hintText = model.hints.join("  ");
  const hasDraft = model.lines.some((line) => String(line || "").length > 0);
  const inlineHints = !hasDraft
    && model.lines.length === 1
    && model.chips.length === 0
    && Array.from(model.lines[0] || "").length + Array.from(hintText).length <= 72;

  return (
    <Box flexDirection="column" paddingY={1}>
      {model.chips.length > 0 ? (
        <Box marginBottom={1}>
          {model.chips.map((chip) => (
            <Text key={chip} color={TUI_THEME.frame.muted}>{`[${chip}] `}</Text>
          ))}
        </Box>
      ) : null}
      {inlineHints ? (
        <Box justifyContent="space-between" width="100%">
          <Box flexGrow={1} flexShrink={1} flexBasis={0}>
            <Text wrap="truncate-end">
              <Text color={TUI_THEME.chrome.success} bold>{`${TUI_THEME.user.prompt} `}</Text>
              <Text color={TUI_THEME.input.text}>{model.lines[0]}</Text>
              {model.showCursor ? <Text color={TUI_THEME.input.cursor}>▉</Text> : null}
              <Text>{`  `}</Text>
            </Text>
          </Box>
          <Box flexShrink={0}>
            <Text color={TUI_THEME.input.hint} dimColor>{hintText}</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" width="100%">
          {model.lines.map((line, index) => (
            <Box key={`composer-line-${index}`}>
              <Text color={index === 0 ? TUI_THEME.chrome.success : TUI_THEME.frame.muted} bold={index === 0}>
                {index === 0 ? `${TUI_THEME.user.prompt} ` : "  "}
              </Text>
              <Text color={TUI_THEME.input.text}>{line}</Text>
              {model.showCursor && index === lastLineIndex ? (
                <Text color={TUI_THEME.input.cursor}>▉</Text>
              ) : null}
            </Box>
          ))}
        </Box>
      )}
      {!inlineHints && !hasDraft ? (
        <Box marginTop={1} justifyContent="flex-end" width="100%">
          <Text color={TUI_THEME.input.hint} dimColor wrap="truncate-end">{hintText}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
