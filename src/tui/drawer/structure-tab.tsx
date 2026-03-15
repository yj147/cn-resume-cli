import { Box, Text } from "ink";
import { TUI_THEME } from "../theme.js";

function readTextField(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value && typeof value === "object" && typeof value.value === "string") {
    return value.value.trim();
  }
  return "";
}

function truncatePreviewText(value, maxLength = 36) {
  const glyphs = Array.from(String(value || ""));
  if (glyphs.length <= maxLength) {
    return glyphs.join("");
  }
  return `${glyphs.slice(0, Math.max(0, maxLength - 1)).join("")}…`;
}

function extractBulletLines(experience = []) {
  if (!Array.isArray(experience)) {
    return [];
  }
  for (const item of experience) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const details = Array.isArray(item.details) ? item.details : [];
    if (details.length > 0) {
      return details.slice(0, 3).map((line) => readTextField(line)).filter(Boolean);
    }
    const bullets = Array.isArray(item.bullets) ? item.bullets : [];
    if (bullets.length > 0) {
      return bullets.slice(0, 3).map((line) => readTextField(line)).filter(Boolean);
    }
  }
  return [];
}

function extractExperienceEntries(experience = []) {
  if (!Array.isArray(experience)) {
    return [];
  }
  return experience.slice(0, 2).map((item) => {
    const company = readTextField(item?.company) || "未命名公司";
    const role = readTextField(item?.position) || readTextField(item?.role) || "未命名岗位";
    const date = (readTextField(item?.date) || [
      readTextField(item?.start),
      readTextField(item?.end)
    ].filter(Boolean).join("—")).trim();
    const bullets = extractBulletLines([item]).slice(0, 3);
    return { company, role, date, bullets };
  });
}

function extractSkillGroups(skills = []) {
  if (!Array.isArray(skills)) {
    return [];
  }
  return skills.slice(0, 4).map((group) => {
    const category = readTextField(group?.category) || "技能";
    const items = Array.isArray(group?.items)
      ? group.items.map((item) => readTextField(item)).filter(Boolean)
      : [];
    return { category, items: items.slice(0, 4) };
  }).filter((group) => group.items.length > 0);
}

export function StructureTab({ session }) {
  const model = session?.currentResume?.model || {};
  const basic = model?.basic && typeof model.basic === "object" ? model.basic : {};
  const name = readTextField(basic.fullName) || readTextField(basic.name) || "当前会话";
  const role = readTextField(basic.jobTitle);
  const summary = readTextField(model?.summary) || readTextField(basic.summary) || "加载简历后，这里会显示结构化预览。";
  const contact = [
    readTextField(basic.location),
    readTextField(basic.email),
    readTextField(basic.github)
  ].filter(Boolean).join(" | ");
  const experiences = extractExperienceEntries(model?.experience);
  const skillGroups = extractSkillGroups(model?.skills);
  const skillRows = [];
  for (let index = 0; index < skillGroups.length; index += 2) {
    skillRows.push(skillGroups.slice(index, index + 2));
  }
  const pendingPatchCount = Array.isArray(session?.pendingPatches) ? session.pendingPatches.length : 0;
  const sectionDivider = " ─────────────────────";

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="column" borderStyle="single" borderColor={TUI_THEME.frame.border} paddingX={2} paddingY={1} width="100%">
        <Box flexDirection="column" alignItems="center" marginBottom={1}>
          <Text color={TUI_THEME.chrome.accent} bold>{name.toUpperCase()}</Text>
          {role ? <Text color={TUI_THEME.frame.muted}>{truncatePreviewText(role, 30)}</Text> : null}
          <Text color={TUI_THEME.frame.muted}>{truncatePreviewText(contact || "请加载简历以查看联系信息", 38)}</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text color={TUI_THEME.preview.accent} bold>SUMMARY</Text>
          <Text color={TUI_THEME.frame.border}>{sectionDivider}</Text>
          <Text color={TUI_THEME.frame.muted}>{truncatePreviewText(summary, 76)}</Text>
        </Box>

        {experiences.length > 0 ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text color={TUI_THEME.preview.accent} bold>EXPERIENCE</Text>
            <Text color={TUI_THEME.frame.border}>{sectionDivider}</Text>
            {experiences.map((entry, index) => (
              <Box key={`preview-exp-${index}`} flexDirection="column" marginBottom={index < experiences.length - 1 ? 1 : 0}>
                <Box flexDirection="column">
                  <Text color={TUI_THEME.tool.diff.add} bold>{truncatePreviewText(`${entry.role} @ ${entry.company}`, 32)}</Text>
                  {entry.date ? <Text color={TUI_THEME.frame.muted}>{truncatePreviewText(entry.date, 20)}</Text> : null}
                  {entry.bullets.map((line, bulletIndex) => (
                    <Text
                      key={`preview-exp-${index}-${bulletIndex}`}
                      color={line.includes("[...") ? TUI_THEME.frame.muted : undefined}
                    >
                      {`▪ ${truncatePreviewText(line, 34)}`}
                    </Text>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        ) : null}

        {skillGroups.length > 0 ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text color={TUI_THEME.preview.accent} bold>TECHNICAL SKILLS</Text>
            <Text color={TUI_THEME.frame.border}>{sectionDivider}</Text>
            {skillRows.map((row, index) => (
              <Box key={`preview-skill-row-${index}`}>
                {row.map((group, groupIndex) => (
                  <Box
                    key={`preview-skill-${group.category}`}
                    flexBasis={0}
                    flexGrow={1}
                    paddingRight={groupIndex === 0 ? 2 : 0}
                  >
                    <Text wrap="truncate-end">
                      <Text color={TUI_THEME.chrome.accent}>{`${group.category}: `}</Text>
                      {truncatePreviewText(group.items.join(", "), 18)}
                    </Text>
                  </Box>
                ))}
                {row.length < 2 ? <Box flexBasis={0} flexGrow={1} /> : null}
              </Box>
            ))}
          </Box>
        ) : null}

        <Text color={TUI_THEME.frame.muted}>{`STATE: ${String(session?.workflowState || "intake")}   PATCHES: ${pendingPatchCount}`}</Text>
      </Box>
    </Box>
  );
}
