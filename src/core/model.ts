import { createHash } from "node:crypto";
import { FIELD_SOURCES, createFieldEnvelope, normalizeFieldEnvelope } from "./provenance.js";

export function nowIso() {
  return new Date().toISOString();
}

export function createEmptyParseEvidence() {
  return {
    version: "",
    paradigm: "jadeai-section-first",
    template: "",
    overall_confidence: 0,
    sections: []
  };
}

export function sha256Text(input) {
  return createHash("sha256").update(String(input || ""), "utf8").digest("hex");
}

export function splitDateRange(rawRange) {
  const raw = String(rawRange || "").trim();
  if (!raw) {
    return { start: "", end: "" };
  }
  const normalized = raw.replace(/至今|现在|current|present/gi, "至今");
  const tokens = normalized.match(/(?:19|20)\d{2}[./-]\d{1,2}(?:[./-]\d{1,2})?|至今/gi) || [];
  if (tokens.length >= 2) {
    return { start: tokens[0], end: tokens[1] };
  }
  if (tokens.length === 1) {
    return { start: tokens[0], end: "" };
  }
  return { start: normalized, end: "" };
}

export function normalizeBulletList(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry : entry?.text || entry?.description || ""))
      .map((s) => String(s || "").trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\n|;|；|•|·/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function collectCustomSectionLines(section) {
  const itemLines = normalizeBulletList(section?.items || []);
  const contentLines = typeof section?.content === "string" ? normalizeBulletList(section.content) : [];
  const merged = [...itemLines, ...contentLines].filter(Boolean);
  return merged.filter((line, index) => merged.indexOf(line) === index);
}

function normalizeStructuredLines(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return { text: entry.trim(), metrics: [] };
        }
        const text = String(entry?.text || entry?.description || "").trim();
        return { text, metrics: Array.isArray(entry?.metrics) ? entry.metrics : [] };
      })
      .filter((entry) => Boolean(entry.text));
  }
  return normalizeBulletList(value).map((text) => ({ text, metrics: [] }));
}

function normalizeCustomSections(rawSections) {
  if (!Array.isArray(rawSections)) {
    return [];
  }
  return rawSections
    .map((section) => {
      const title = String(section?.title || "附加信息").trim();
      const mergedLines = collectCustomSectionLines(section);
      return {
        title,
        content: mergedLines.join("\n"),
        items: mergedLines,
        provenance: section?.provenance
      };
    })
    .filter((section) => section.items.length);
}

function normalizeRenderConfig(raw) {
  const source = raw?.render_config || raw?.renderConfig || {};
  const menuSections = Array.isArray(raw?.menuSections) ? raw.menuSections : [];
  const sectionTypes = menuSections
    .map((item) => String(item?.type || item || "").trim())
    .filter(Boolean);
  return {
    template:
      source.template ||
      source.templateId ||
      raw?.templateId ||
      raw?.meta?.template ||
      "",
    pages: Number(source.pages || 1),
    modules: Array.isArray(source.modules) ? source.modules : sectionTypes,
    module_order: Array.isArray(source.module_order) ? source.module_order : sectionTypes,
    theme_color: source.theme_color || source.themeColor || raw?.globalSettings?.themeColor || "",
    font_size: source.font_size || source.fontSize || raw?.globalSettings?.baseFontSize || "",
    output_formats: Array.isArray(source.output_formats) ? source.output_formats : []
  };
}

export function buildEmptyModel() {
  return {
    basic: {
      name: buildEmptyField(),
      title: buildEmptyField(),
      photo: buildEmptyField(),
      birth_date: buildEmptyField(),
      email: buildEmptyField(),
      phone: buildEmptyField(),
      location: buildEmptyField(),
      website: buildEmptyField(),
      linkedin: buildEmptyField(),
      github: buildEmptyField(),
      employment_status: buildEmptyField(),
      summary: buildEmptyField()
    },
    education: [],
    skills: [],
    experience: [],
    projects: [],
    certifications: [],
    languages: [],
    github: [],
    qr_codes: [],
    custom_sections: [],
    render_config: {
      template: "",
      pages: 1,
      modules: [],
      module_order: [],
      theme_color: "",
      font_size: "",
      output_formats: [],
      provenance: normalizeEntryProvenance(undefined, FIELD_SOURCES.USER_EXPLICIT)
    },
    meta: {
      created_at: nowIso(),
      source: "cn-resume-cli",
      template: "",
      parse_evidence: createEmptyParseEvidence()
    }
  };
}

export function buildEmptyField(options = {}) {
  return createFieldEnvelope(options);
}

function pickPrimaryField(fields) {
  return fields.find((field) => String(field?.value || "").trim()) || fields[0] || buildEmptyField();
}

function buildItemProvenance(fields) {
  const primary = pickPrimaryField(fields);
  return {
    source: primary.source,
    confidence: primary.confidence,
    status: primary.status,
    updatedBy: primary.updatedBy,
    updatedAt: primary.updatedAt
  };
}

function normalizeEntryProvenance(rawProvenance, fallbackSource) {
  return createFieldEnvelope({
    value: "present",
    source: rawProvenance?.source || fallbackSource,
    confidence: rawProvenance?.confidence ?? 1,
    status: rawProvenance?.status || "",
    updatedBy: rawProvenance?.updatedBy || rawProvenance?.source || fallbackSource,
    updatedAt: rawProvenance?.updatedAt
  });
}

export function normalizeReactiveJson(raw) {
  const model = buildEmptyModel();
  const basicSource = raw?.basic || raw?.personalInfo || raw?.personal_info || raw?.basicInfo || raw?.basic_info || {};
  const basicFieldSource = raw?.basic ? FIELD_SOURCES.USER_EXPLICIT : FIELD_SOURCES.PARSED_EXACT;
  const supportSectionSource =
    raw?.basicInfo || raw?.personalInfo || raw?.templateId || raw?.menuSections || raw?.globalSettings
      ? FIELD_SOURCES.PARSED_EXACT
      : FIELD_SOURCES.USER_EXPLICIT;
  if (basicSource && typeof basicSource === "object" && !Array.isArray(basicSource)) {
    model.basic.name = normalizeFieldEnvelope(
      basicSource.name || basicSource.fullName || basicSource.full_name || basicSource.姓名 || "",
      { source: basicFieldSource }
    );
    model.basic.title = normalizeFieldEnvelope(
      basicSource.title || basicSource.jobTitle || basicSource.position || basicSource.职位 || "",
      { source: basicFieldSource }
    );
    model.basic.photo = normalizeFieldEnvelope(basicSource.photo || "", { source: basicFieldSource });
    model.basic.birth_date = normalizeFieldEnvelope(basicSource.birth_date || basicSource.birthDate || "", { source: basicFieldSource });
    model.basic.email = normalizeFieldEnvelope(basicSource.email || basicSource.邮箱 || "", { source: basicFieldSource });
    model.basic.phone = normalizeFieldEnvelope(
      basicSource.phone || basicSource.tel || basicSource.mobile || basicSource.电话 || basicSource.手机 || "",
      { source: basicFieldSource }
    );
    model.basic.location = normalizeFieldEnvelope(
      basicSource.location || basicSource.city || basicSource.address || basicSource.地址 || basicSource.城市 || "",
      { source: basicFieldSource }
    );
    model.basic.website = normalizeFieldEnvelope(
      basicSource.website || basicSource.url || basicSource.homepage || basicSource.linkedin || "",
      { source: basicFieldSource }
    );
    model.basic.linkedin = normalizeFieldEnvelope(basicSource.linkedin || "", { source: basicFieldSource });
    model.basic.github = normalizeFieldEnvelope(basicSource.github || "", { source: basicFieldSource });
    model.basic.employment_status = normalizeFieldEnvelope(
      basicSource.employment_status || basicSource.employementStatus || "",
      { source: basicFieldSource }
    );
    const summaryValue = basicSource.summary || basicSource.profile || raw?.summary || raw?.objective || "";
    const summarySource = basicSource.summary || basicSource.profile ? basicFieldSource : FIELD_SOURCES.PARSED_EXACT;
    model.basic.summary = normalizeFieldEnvelope(summaryValue, { source: summarySource });
  }

  const work = raw.experience || raw.work || raw.work_experience || raw.workExperience || [];
  model.experience = work.map((item) => {
    const dateRange = splitDateRange(item?.date);
    const entrySource = item.position || item.date || item.startDate || item.endDate ? FIELD_SOURCES.PARSED_EXACT : FIELD_SOURCES.USER_EXPLICIT;
    const company = normalizeFieldEnvelope(item.company || "", { source: entrySource });
    const role = normalizeFieldEnvelope(item.role || item.position || "", {
      source: item.role ? FIELD_SOURCES.USER_EXPLICIT : entrySource
    });
    const startDate = normalizeFieldEnvelope(item.start_date || item.startDate || item.start || dateRange.start, {
      source: item.start_date || item.start ? FIELD_SOURCES.USER_EXPLICIT : item.startDate ? FIELD_SOURCES.PARSED_EXACT : FIELD_SOURCES.PARSED_INFERRED
    });
    const endDate = normalizeFieldEnvelope(item.end_date || item.endDate || item.end || dateRange.end, {
      source: item.end_date || item.end ? FIELD_SOURCES.USER_EXPLICIT : item.endDate ? FIELD_SOURCES.PARSED_EXACT : FIELD_SOURCES.PARSED_INFERRED
    });
    const start = normalizeFieldEnvelope(item.start || item.startDate || item.start_date || dateRange.start, {
      source: item.start || item.start_date ? FIELD_SOURCES.USER_EXPLICIT : item.startDate ? FIELD_SOURCES.PARSED_EXACT : FIELD_SOURCES.PARSED_INFERRED
    });
    const end = normalizeFieldEnvelope(item.end || item.endDate || item.end_date || dateRange.end || item.date || "", {
      source: item.end || item.end_date ? FIELD_SOURCES.USER_EXPLICIT : item.endDate ? FIELD_SOURCES.PARSED_EXACT : FIELD_SOURCES.PARSED_INFERRED
    });
    return {
      company,
      role,
      start_date: startDate,
      end_date: endDate,
      start,
      end,
      provenance: buildItemProvenance([company, role, startDate, endDate]),
      bullets: normalizeStructuredLines(item.bullets || item.highlights || item.description || item.details || []),
      technologies: Array.isArray(item.technologies) ? item.technologies : []
    };
  });

  const projects = raw.projects || [];
  model.projects = projects.map((item) => {
    const dateRange = splitDateRange(item?.date);
    const entrySource = item.startDate || item.endDate || item.link ? FIELD_SOURCES.PARSED_EXACT : FIELD_SOURCES.USER_EXPLICIT;
    const name = normalizeFieldEnvelope(item.name || "", { source: entrySource });
    const role = normalizeFieldEnvelope(item.role || "", { source: entrySource });
    const startDate = normalizeFieldEnvelope(item.start_date || item.startDate || item.start || dateRange.start, {
      source: item.start_date || item.start ? FIELD_SOURCES.USER_EXPLICIT : item.startDate ? FIELD_SOURCES.PARSED_EXACT : FIELD_SOURCES.PARSED_INFERRED
    });
    const endDate = normalizeFieldEnvelope(item.end_date || item.endDate || item.end || dateRange.end, {
      source: item.end_date || item.end ? FIELD_SOURCES.USER_EXPLICIT : item.endDate ? FIELD_SOURCES.PARSED_EXACT : FIELD_SOURCES.PARSED_INFERRED
    });
    const start = normalizeFieldEnvelope(item.start || item.startDate || item.start_date || dateRange.start, {
      source: item.start || item.start_date ? FIELD_SOURCES.USER_EXPLICIT : item.startDate ? FIELD_SOURCES.PARSED_EXACT : FIELD_SOURCES.PARSED_INFERRED
    });
    const end = normalizeFieldEnvelope(item.end || item.endDate || item.end_date || dateRange.end, {
      source: item.end || item.end_date ? FIELD_SOURCES.USER_EXPLICIT : item.endDate ? FIELD_SOURCES.PARSED_EXACT : FIELD_SOURCES.PARSED_INFERRED
    });
    const description = normalizeFieldEnvelope(typeof item.description === "string" ? item.description : item.description?.value || "", {
      source: entrySource
    });
    const url = normalizeFieldEnvelope(item.url || item.link || "", {
      source: item.url ? entrySource : item.link ? FIELD_SOURCES.PARSED_EXACT : entrySource
    });
    return {
      name,
      role,
      start_date: startDate,
      end_date: endDate,
      start,
      end,
      description,
      provenance: buildItemProvenance([name, role, startDate, endDate, description]),
      bullets: normalizeStructuredLines(item.bullets || item.highlights || item.description || item.details || []),
      technologies: Array.isArray(item.technologies) ? item.technologies : [],
      url
    };
  });

  const edu = raw.education || raw.edu || [];
  model.education = edu.map((item) => {
    const dateRange = splitDateRange(item?.date);
    const entrySource = item.institution || item.field || item.startDate || item.endDate ? FIELD_SOURCES.PARSED_EXACT : FIELD_SOURCES.USER_EXPLICIT;
    const school = normalizeFieldEnvelope(item.school || item.institution || "", {
      source: item.school ? FIELD_SOURCES.USER_EXPLICIT : entrySource
    });
    const degree = normalizeFieldEnvelope(item.degree || "", { source: entrySource });
    const major = normalizeFieldEnvelope(item.major || item.field || "", {
      source: item.major ? FIELD_SOURCES.USER_EXPLICIT : item.field ? FIELD_SOURCES.PARSED_EXACT : entrySource
    });
    const startDate = normalizeFieldEnvelope(item.start_date || item.startDate || item.start || dateRange.start, {
      source: item.start_date || item.start ? FIELD_SOURCES.USER_EXPLICIT : item.startDate ? FIELD_SOURCES.PARSED_EXACT : FIELD_SOURCES.PARSED_INFERRED
    });
    const endDate = normalizeFieldEnvelope(item.end_date || item.endDate || item.end || dateRange.end, {
      source: item.end_date || item.end ? FIELD_SOURCES.USER_EXPLICIT : item.endDate ? FIELD_SOURCES.PARSED_EXACT : FIELD_SOURCES.PARSED_INFERRED
    });
    const start = normalizeFieldEnvelope(item.start || item.startDate || item.start_date || dateRange.start, {
      source: item.start || item.start_date ? FIELD_SOURCES.USER_EXPLICIT : item.startDate ? FIELD_SOURCES.PARSED_EXACT : FIELD_SOURCES.PARSED_INFERRED
    });
    const end = normalizeFieldEnvelope(item.end || item.endDate || item.end_date || dateRange.end, {
      source: item.end || item.end_date ? FIELD_SOURCES.USER_EXPLICIT : item.endDate ? FIELD_SOURCES.PARSED_EXACT : FIELD_SOURCES.PARSED_INFERRED
    });
    const gpa = normalizeFieldEnvelope(item.gpa || "", { source: entrySource });
    const description = normalizeFieldEnvelope(typeof item.description === "string" ? item.description : item.description?.value || "", {
      source: entrySource
    });
    return {
      school,
      degree,
      major,
      start_date: startDate,
      end_date: endDate,
      start,
      end,
      gpa,
      description,
      provenance: buildItemProvenance([school, degree, major, startDate, endDate])
    };
  });

  const skills = raw.skills || [];
  model.skills = skills.map((item) => {
    if (Array.isArray(item)) {
      return {
        category: "技能",
        items: item.map((name) => ({
          name,
          provenance: normalizeEntryProvenance(undefined, supportSectionSource)
        })),
        provenance: normalizeEntryProvenance(undefined, supportSectionSource)
      };
    }
    const entrySource = item?.skills ? FIELD_SOURCES.PARSED_EXACT : item?.provenance?.source || supportSectionSource;
    return {
      category: item.category || item.name || "技能",
      items: (item.items || item.skills || []).map((entry) =>
        typeof entry === "string"
          ? {
              name: entry,
              provenance: normalizeEntryProvenance(undefined, entrySource)
            }
          : {
              name: entry.name || entry.skill || "",
              detail: entry.detail || "",
              provenance: normalizeEntryProvenance(entry.provenance, entry.skill ? FIELD_SOURCES.PARSED_EXACT : entrySource)
            }
      ),
      provenance: normalizeEntryProvenance(item.provenance, entrySource)
    };
  });

  model.custom_sections = normalizeCustomSections(raw.custom_sections).map((section) => ({
    ...section,
    provenance: normalizeEntryProvenance(section.provenance, supportSectionSource)
  }));

  model.certifications = Array.isArray(raw.certifications)
    ? raw.certifications.map((item) => ({
        name: item.name || "",
        issuer: item.issuer || "",
        date: item.date || "",
        url: item.url || "",
        provenance: normalizeEntryProvenance(item.provenance, supportSectionSource)
      }))
    : [];

  model.languages = Array.isArray(raw.languages)
    ? raw.languages.map((item) => ({
        language: item.language || item.name || "",
        proficiency: item.proficiency || item.level || "",
        description: item.description || "",
        provenance: normalizeEntryProvenance(item.provenance, item.level ? FIELD_SOURCES.PARSED_EXACT : supportSectionSource)
      }))
    : [];

  model.github = Array.isArray(raw.github)
    ? raw.github.map((item) => ({
        repo_url: item.repo_url || item.repoUrl || item.url || "",
        name: item.name || "",
        stars: Number(item.stars || 0),
        language: item.language || "",
        description: item.description || "",
        provenance: normalizeEntryProvenance(item.provenance, item.repoUrl ? FIELD_SOURCES.PARSED_EXACT : supportSectionSource)
      }))
    : [];

  model.qr_codes = Array.isArray(raw.qr_codes)
    ? raw.qr_codes.map((item) => ({
        label: item.label || item.name || item.title || "",
        url: item.url || "",
        provenance: normalizeEntryProvenance(item.provenance, item.title ? FIELD_SOURCES.PARSED_EXACT : supportSectionSource)
      }))
    : [];

  if (raw?.meta && typeof raw.meta === "object" && !Array.isArray(raw.meta)) {
    model.meta = {
      ...model.meta,
      ...raw.meta
    };
  }

  model.render_config = {
    ...normalizeRenderConfig(raw),
    provenance: normalizeEntryProvenance(
      raw?.render_config?.provenance || raw?.renderConfig?.provenance,
      raw?.render_config || raw?.renderConfig ? FIELD_SOURCES.USER_EXPLICIT : supportSectionSource
    )
  };

  if (!model.custom_sections.length) {
    model.custom_sections.push({
      title: "个人优势",
      content: "学习能力强，具备跨团队协作与持续交付能力。",
      items: ["学习能力强，具备跨团队协作与持续交付能力。"],
      provenance: normalizeEntryProvenance(undefined, supportSectionSource)
    });
  }

  return model;
}
