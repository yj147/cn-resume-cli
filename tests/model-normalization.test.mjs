import test from "node:test";
import assert from "node:assert/strict";

const modelModule = await import("../dist/core/model.js");
const provenanceModule = await import("../dist/core/provenance.js");

test("createFieldEnvelope keeps empty fields empty with stable provenance metadata", () => {
  const updatedAt = "2026-03-12T00:00:00.000Z";
  const field = provenanceModule.createFieldEnvelope({ updatedAt });

  assert.deepEqual(field, {
    value: "",
    source: provenanceModule.FIELD_SOURCES.USER_EXPLICIT,
    confidence: 0,
    status: provenanceModule.FIELD_STATUSES.EMPTY,
    updatedBy: provenanceModule.FIELD_SOURCES.USER_EXPLICIT,
    updatedAt
  });
});

test("buildEmptyField in model uses provenance defaults for parsed candidate values", () => {
  const updatedAt = "2026-03-12T01:23:45.000Z";
  const field = modelModule.buildEmptyField({
    value: "张三",
    source: provenanceModule.FIELD_SOURCES.PARSED_EXACT,
    confidence: 0.92,
    updatedAt
  });

  assert.equal(field.value, "张三");
  assert.equal(field.source, provenanceModule.FIELD_SOURCES.PARSED_EXACT);
  assert.equal(field.confidence, 0.92);
  assert.equal(field.status, provenanceModule.FIELD_STATUSES.SUGGESTED);
  assert.equal(field.updatedBy, provenanceModule.FIELD_SOURCES.PARSED_EXACT);
  assert.equal(field.updatedAt, updatedAt);
});

test("upgradeFieldStatus only moves forward to a stronger confirmed state", () => {
  assert.equal(
    provenanceModule.upgradeFieldStatus(
      provenanceModule.FIELD_STATUSES.EMPTY,
      provenanceModule.FIELD_STATUSES.SUGGESTED
    ),
    provenanceModule.FIELD_STATUSES.SUGGESTED
  );
  assert.equal(
    provenanceModule.upgradeFieldStatus(
      provenanceModule.FIELD_STATUSES.SUGGESTED,
      provenanceModule.FIELD_STATUSES.CONFIRMED
    ),
    provenanceModule.FIELD_STATUSES.CONFIRMED
  );
  assert.equal(
    provenanceModule.upgradeFieldStatus(
      provenanceModule.FIELD_STATUSES.CONFIRMED,
      provenanceModule.FIELD_STATUSES.SUGGESTED
    ),
    provenanceModule.FIELD_STATUSES.CONFIRMED
  );
});

test("buildEmptyModel wraps basic fields in empty envelopes", () => {
  const model = modelModule.buildEmptyModel();

  assert.deepEqual(model.basic.name, {
    value: "",
    source: provenanceModule.FIELD_SOURCES.USER_EXPLICIT,
    confidence: 0,
    status: provenanceModule.FIELD_STATUSES.EMPTY,
    updatedBy: provenanceModule.FIELD_SOURCES.USER_EXPLICIT,
    updatedAt: model.basic.name.updatedAt
  });
  assert.equal(typeof model.basic.email.updatedAt, "string");
  assert.equal(model.basic.summary.status, provenanceModule.FIELD_STATUSES.EMPTY);
});

test("normalizeReactiveJson tags parse-first basic fields as suggested parsed values", () => {
  const model = modelModule.normalizeReactiveJson({
    basicInfo: {
      fullName: "杨进",
      jobTitle: "全栈工程师",
      email: "yj@example.com",
      phone: "13800000000",
      city: "广州"
    },
    summary: "负责复杂系统交付。"
  });

  assert.deepEqual(model.basic.name, {
    value: "杨进",
    source: provenanceModule.FIELD_SOURCES.PARSED_EXACT,
    confidence: 1,
    status: provenanceModule.FIELD_STATUSES.SUGGESTED,
    updatedBy: provenanceModule.FIELD_SOURCES.PARSED_EXACT,
    updatedAt: model.basic.name.updatedAt
  });
  assert.equal(model.basic.title.value, "全栈工程师");
  assert.equal(model.basic.email.source, provenanceModule.FIELD_SOURCES.PARSED_EXACT);
  assert.equal(model.basic.summary.status, provenanceModule.FIELD_STATUSES.SUGGESTED);
});

test("normalizeReactiveJson wraps parse-first experience, projects and education fields with collection provenance", () => {
  const model = modelModule.normalizeReactiveJson({
    experience: [
      {
        company: "A 公司",
        position: "后端工程师",
        date: "2021-01 - 2022-12",
        details: ["优化查询链路"]
      }
    ],
    projects: [
      {
        name: "SaaS 平台",
        role: "开发负责人",
        startDate: "2023-02",
        endDate: "2024-11",
        description: "负责核心数据服务。"
      }
    ],
    education: [
      {
        institution: "中山大学",
        degree: "本科",
        field: "软件工程",
        startDate: "2014-09",
        endDate: "2018-06"
      }
    ]
  });

  assert.equal(model.experience[0].company.value, "A 公司");
  assert.equal(model.experience[0].role.source, provenanceModule.FIELD_SOURCES.PARSED_EXACT);
  assert.equal(model.experience[0].start_date.source, provenanceModule.FIELD_SOURCES.PARSED_INFERRED);
  assert.equal(model.experience[0].end_date.status, provenanceModule.FIELD_STATUSES.SUGGESTED);
  assert.equal(model.experience[0].provenance.status, provenanceModule.FIELD_STATUSES.SUGGESTED);

  assert.equal(model.projects[0].name.value, "SaaS 平台");
  assert.equal(model.projects[0].start_date.source, provenanceModule.FIELD_SOURCES.PARSED_EXACT);
  assert.equal(model.projects[0].description.status, provenanceModule.FIELD_STATUSES.SUGGESTED);

  assert.equal(model.education[0].school.value, "中山大学");
  assert.equal(model.education[0].major.source, provenanceModule.FIELD_SOURCES.PARSED_EXACT);
  assert.equal(model.education[0].provenance.source, provenanceModule.FIELD_SOURCES.PARSED_EXACT);
});

test("normalizeReactiveJson preserves confirmed authoring envelopes for collection fields", () => {
  const confirmedAt = "2026-03-12T08:00:00.000Z";
  const model = modelModule.normalizeReactiveJson({
    experience: [
      {
        company: {
          value: "B 公司",
          source: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          confidence: 1,
          status: provenanceModule.FIELD_STATUSES.CONFIRMED,
          updatedBy: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          updatedAt: confirmedAt
        },
        role: {
          value: "技术负责人",
          source: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          confidence: 1,
          status: provenanceModule.FIELD_STATUSES.CONFIRMED,
          updatedBy: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          updatedAt: confirmedAt
        },
        start_date: {
          value: "2020-01",
          source: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          confidence: 1,
          status: provenanceModule.FIELD_STATUSES.CONFIRMED,
          updatedBy: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          updatedAt: confirmedAt
        },
        end_date: {
          value: "至今",
          source: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          confidence: 1,
          status: provenanceModule.FIELD_STATUSES.CONFIRMED,
          updatedBy: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          updatedAt: confirmedAt
        }
      }
    ],
    projects: [
      {
        name: {
          value: "增长平台",
          source: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          confidence: 1,
          status: provenanceModule.FIELD_STATUSES.CONFIRMED,
          updatedBy: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          updatedAt: confirmedAt
        },
        description: {
          value: "负责增长实验体系。",
          source: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          confidence: 1,
          status: provenanceModule.FIELD_STATUSES.CONFIRMED,
          updatedBy: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          updatedAt: confirmedAt
        }
      }
    ],
    education: [
      {
        school: {
          value: "华工",
          source: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          confidence: 1,
          status: provenanceModule.FIELD_STATUSES.CONFIRMED,
          updatedBy: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          updatedAt: confirmedAt
        },
        degree: {
          value: "硕士",
          source: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          confidence: 1,
          status: provenanceModule.FIELD_STATUSES.CONFIRMED,
          updatedBy: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          updatedAt: confirmedAt
        }
      }
    ]
  });

  assert.equal(model.experience[0].company.status, provenanceModule.FIELD_STATUSES.CONFIRMED);
  assert.equal(model.experience[0].provenance.source, provenanceModule.FIELD_SOURCES.USER_CONFIRMED);
  assert.equal(model.projects[0].description.status, provenanceModule.FIELD_STATUSES.CONFIRMED);
  assert.equal(model.education[0].school.updatedAt, confirmedAt);
});

test("normalizeReactiveJson adds provenance to skills plus supporting sections for parse-first input", () => {
  const model = modelModule.normalizeReactiveJson({
    skills: [
      {
        name: "工程能力",
        skills: ["TypeScript", "Node.js"]
      }
    ],
    certifications: [
      {
        name: "AWS SAA",
        issuer: "AWS",
        date: "2024-05",
        url: "https://www.credly.com/"
      }
    ],
    languages: [
      {
        name: "英语",
        level: "熟练",
        description: "可直接参加英文技术会议"
      }
    ],
    github: [
      {
        repoUrl: "https://github.com/example/core-sdk",
        name: "core-sdk",
        stars: 320,
        language: "TypeScript",
        description: "企业级 SDK"
      }
    ],
    qr_codes: [
      {
        title: "作品集",
        url: "https://portfolio.example.com"
      }
    ],
    custom_sections: [
      {
        title: "个人优势",
        content: "推进复杂项目落地",
        items: ["推进复杂项目落地"]
      }
    ],
    templateId: "single-clean",
    menuSections: ["summary", "skills", "custom"],
    globalSettings: {
      themeColor: "#0ea5e9",
      baseFontSize: 13
    }
  });

  assert.equal(model.skills[0].provenance.source, provenanceModule.FIELD_SOURCES.PARSED_EXACT);
  assert.equal(model.skills[0].items[0].provenance.source, provenanceModule.FIELD_SOURCES.PARSED_EXACT);
  assert.equal(model.certifications[0].provenance.status, provenanceModule.FIELD_STATUSES.SUGGESTED);
  assert.equal(model.languages[0].provenance.source, provenanceModule.FIELD_SOURCES.PARSED_EXACT);
  assert.equal(model.github[0].provenance.source, provenanceModule.FIELD_SOURCES.PARSED_EXACT);
  assert.equal(model.qr_codes[0].provenance.source, provenanceModule.FIELD_SOURCES.PARSED_EXACT);
  assert.equal(model.custom_sections[0].provenance.source, provenanceModule.FIELD_SOURCES.PARSED_EXACT);
  assert.equal(model.render_config.provenance.source, provenanceModule.FIELD_SOURCES.PARSED_EXACT);
  assert.deepEqual(model.render_config.modules, ["summary", "skills", "custom"]);
});

test("normalizeReactiveJson keeps user-authored supporting sections confirmed", () => {
  const confirmedAt = "2026-03-12T09:00:00.000Z";
  const model = modelModule.normalizeReactiveJson({
    skills: [
      {
        category: "后端",
        items: [
          {
            name: "Go",
            provenance: {
              source: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
              confidence: 1,
              status: provenanceModule.FIELD_STATUSES.CONFIRMED,
              updatedBy: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
              updatedAt: confirmedAt
            }
          }
        ],
        provenance: {
          source: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          confidence: 1,
          status: provenanceModule.FIELD_STATUSES.CONFIRMED,
          updatedBy: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          updatedAt: confirmedAt
        }
      }
    ],
    custom_sections: [
      {
        title: "个人优势",
        items: ["跨团队协作"],
        provenance: {
          source: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          confidence: 1,
          status: provenanceModule.FIELD_STATUSES.CONFIRMED,
          updatedBy: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
          updatedAt: confirmedAt
        }
      }
    ],
    render_config: {
      template: "single-clean",
      modules: ["skills"],
      module_order: ["skills"],
      theme_color: "#2563eb",
      font_size: 14,
      output_formats: ["pdf"],
      provenance: {
        source: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
        confidence: 1,
        status: provenanceModule.FIELD_STATUSES.CONFIRMED,
        updatedBy: provenanceModule.FIELD_SOURCES.USER_CONFIRMED,
        updatedAt: confirmedAt
      }
    }
  });

  assert.equal(model.skills[0].provenance.status, provenanceModule.FIELD_STATUSES.CONFIRMED);
  assert.equal(model.skills[0].items[0].provenance.updatedAt, confirmedAt);
  assert.equal(model.custom_sections[0].provenance.source, provenanceModule.FIELD_SOURCES.USER_CONFIRMED);
  assert.equal(model.render_config.provenance.status, provenanceModule.FIELD_STATUSES.CONFIRMED);
  assert.equal(model.render_config.theme_color, "#2563eb");
});
