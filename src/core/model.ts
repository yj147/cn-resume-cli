import { createHash } from "node:crypto";

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
      const itemLines = normalizeBulletList(section?.items || []);
      const contentLines = typeof section?.content === "string" ? normalizeBulletList(section.content) : [];
      const mergedLines = [...itemLines, ...contentLines].filter(Boolean);
      return {
        title,
        content: mergedLines.join("\n"),
        items: mergedLines
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
      name: "",
      title: "",
      photo: "",
      birth_date: "",
      email: "",
      phone: "",
      location: "",
      website: "",
      linkedin: "",
      github: "",
      employment_status: "",
      summary: ""
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
      output_formats: []
    },
    meta: {
      created_at: nowIso(),
      source: "cn-resume-cli",
      template: "",
      parse_evidence: createEmptyParseEvidence()
    }
  };
}

export function normalizeReactiveJson(raw) {
  const model = buildEmptyModel();
  const basicSource =
    raw?.basic ||
    raw?.personalInfo ||
    raw?.personal_info ||
    raw?.basicInfo ||
    raw?.basic_info ||
    {};
  if (basicSource && typeof basicSource === "object" && !Array.isArray(basicSource)) {
    model.basic.name = basicSource.name || basicSource.fullName || basicSource.full_name || basicSource.姓名 || "";
    model.basic.title = basicSource.title || basicSource.jobTitle || basicSource.position || basicSource.职位 || "";
    model.basic.photo = basicSource.photo || "";
    model.basic.birth_date = basicSource.birth_date || basicSource.birthDate || "";
    model.basic.email = basicSource.email || basicSource.邮箱 || "";
    model.basic.phone = basicSource.phone || basicSource.tel || basicSource.mobile || basicSource.电话 || basicSource.手机 || "";
    model.basic.location = basicSource.location || basicSource.city || basicSource.address || basicSource.地址 || basicSource.城市 || "";
    model.basic.website = basicSource.website || basicSource.url || basicSource.homepage || basicSource.linkedin || "";
    model.basic.linkedin = basicSource.linkedin || "";
    model.basic.github = basicSource.github || "";
    model.basic.employment_status = basicSource.employment_status || basicSource.employementStatus || "";
    model.basic.summary = basicSource.summary || basicSource.profile || raw?.summary || raw?.objective || "";
  }

  const work = raw.experience || raw.work || raw.work_experience || raw.workExperience || [];
  model.experience = work.map((item) => ({
    company: item.company || "",
    role: item.role || item.position || "",
    start_date: item.start_date || item.startDate || item.start || splitDateRange(item.date).start,
    end_date: item.end_date || item.endDate || item.end || splitDateRange(item.date).end,
    start: item.start || item.startDate || item.start_date || splitDateRange(item.date).start,
    end: item.end || item.endDate || item.end_date || splitDateRange(item.date).end || item.date || "",
    bullets: normalizeStructuredLines(item.bullets || item.highlights || item.description || item.details || []),
    technologies: Array.isArray(item.technologies) ? item.technologies : []
  }));

  const projects = raw.projects || [];
  model.projects = projects.map((item) => ({
    name: item.name || "",
    role: item.role || "",
    start_date: item.start_date || item.startDate || item.start || splitDateRange(item.date).start,
    end_date: item.end_date || item.endDate || item.end || splitDateRange(item.date).end,
    start: item.start || item.startDate || item.start_date || splitDateRange(item.date).start,
    end: item.end || item.endDate || item.end_date || splitDateRange(item.date).end,
    description: typeof item.description === "string" ? item.description : "",
    bullets: normalizeStructuredLines(item.bullets || item.highlights || item.description || item.details || []),
    technologies: Array.isArray(item.technologies) ? item.technologies : [],
    url: item.url || item.link || ""
  }));

  const edu = raw.education || raw.edu || [];
  model.education = edu.map((item) => ({
    school: item.school || item.institution || "",
    degree: item.degree || "",
    major: item.major || item.field || "",
    start_date: item.start_date || item.startDate || item.start || splitDateRange(item.date).start,
    end_date: item.end_date || item.endDate || item.end || splitDateRange(item.date).end,
    start: item.start || item.startDate || item.start_date || splitDateRange(item.date).start,
    end: item.end || item.endDate || item.end_date || splitDateRange(item.date).end,
    gpa: item.gpa || "",
    description: typeof item.description === "string" ? item.description : ""
  }));

  const skills = raw.skills || [];
  model.skills = skills.map((item) => {
    if (Array.isArray(item)) {
      return { category: "技能", items: item.map((name) => ({ name })) };
    }
    return {
      category: item.category || item.name || "技能",
      items: (item.items || item.skills || []).map((entry) =>
        typeof entry === "string" ? { name: entry } : { name: entry.name || entry.skill || "", detail: entry.detail || "" }
      )
    };
  });

  model.custom_sections = normalizeCustomSections(raw.custom_sections);

  model.certifications = Array.isArray(raw.certifications)
    ? raw.certifications.map((item) => ({
        name: item.name || "",
        issuer: item.issuer || "",
        date: item.date || "",
        url: item.url || ""
      }))
    : [];

  model.languages = Array.isArray(raw.languages)
    ? raw.languages.map((item) => ({
        language: item.language || item.name || "",
        proficiency: item.proficiency || item.level || "",
        description: item.description || ""
      }))
    : [];

  model.github = Array.isArray(raw.github)
    ? raw.github.map((item) => ({
        repo_url: item.repo_url || item.repoUrl || item.url || "",
        name: item.name || "",
        stars: Number(item.stars || 0),
        language: item.language || "",
        description: item.description || ""
      }))
    : [];

  model.qr_codes = Array.isArray(raw.qr_codes)
    ? raw.qr_codes.map((item) => ({
        label: item.label || item.name || item.title || "",
        url: item.url || ""
      }))
    : [];

  if (raw?.meta && typeof raw.meta === "object" && !Array.isArray(raw.meta)) {
    model.meta = {
      ...model.meta,
      ...raw.meta
    };
  }

  model.render_config = normalizeRenderConfig(raw);

  if (!model.custom_sections.length) {
    model.custom_sections.push({
      title: "个人优势",
      content: "学习能力强，具备跨团队协作与持续交付能力。",
      items: ["学习能力强，具备跨团队协作与持续交付能力。"]
    });
  }

  return model;
}

