import { Box, Text } from "ink";
import { buildComposerModel } from "./model.js";
import { TUI_THEME } from "../theme.js";

export function Composer(props) {
  const model = buildComposerModel(props);
  const lastLineIndex = model.lines.length - 1;

  return (
    <Box flexDirection="column">
      {model.chips.length > 0 ? (
        <Box marginBottom={1}>
          {model.chips.map((chip) => (
            <Text key={chip} color={TUI_THEME.frame.muted}>{`[${chip}] `}</Text>
          ))}
        </Box>
      ) : null}
      <Box flexDirection="column">
        {model.lines.map((line, index) => (
          <Box key={`composer-line-${index}`}>
            <Text color={TUI_THEME.user.accent}>{line}</Text>
            {model.showCursor && index === lastLineIndex ? <Text color={TUI_THEME.input.cursor}>│</Text> : null}
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={TUI_THEME.input.hint}>{model.hints.join(" · ")}</Text>
      </Box>
    </Box>
  );
}
