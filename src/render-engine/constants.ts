export const APP_NAME = 'JadeAI';

export const SECTION_TYPES = [
  'personal_info',
  'summary',
  'work_experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'languages',
  'github',
  'qr_codes',
  'custom',
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export const DEFAULT_SECTIONS: { type: SectionType; titleZh: string; titleEn: string }[] = [
  { type: 'personal_info', titleZh: '个人信息', titleEn: 'Personal Info' },
  { type: 'summary', titleZh: '个人简介', titleEn: 'Summary' },
  { type: 'work_experience', titleZh: '工作经历', titleEn: 'Work Experience' },
  { type: 'education', titleZh: '教育背景', titleEn: 'Education' },
  { type: 'skills', titleZh: '技能特长', titleEn: 'Skills' },
  { type: 'qr_codes', titleZh: '二维码', titleEn: 'QR Codes' },
];

/** Templates with full-bleed background headers — no outer padding needed */
export const BACKGROUND_TEMPLATES: ReadonlySet<string> = new Set([
  'single-accent',
  'split-clean',
  'split-formal',
  'split-dark',
  'split-ats',
  'sidebar-clean',
  'sidebar-dark',
  'compact-clean',
  'compact-ats',
]);

export const AUTOSAVE_DELAY = 500;
export const MAX_UNDO_STACK = 50;
