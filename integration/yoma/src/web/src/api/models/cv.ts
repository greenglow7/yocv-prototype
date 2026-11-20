// Written to the Yoma repository's patterns by the YoCV prototype. Not compiled.
// The CV request and response types, as `CVController` returns them (Yoma.Core.Domain.CV.Models).

/**
 * One interview answer set. The place the person names stays in the browser and is never sent.
 * Months and the number are flat fields, as in `CVInterviewEntry`.
 */
export interface CVInterviewEntry {
  title: string;
  what: string;
  forWhom: string | null;
  /** One of the frequency chips, or null. The API refuses any other value. */
  frequency: string | null;
  /** YYYY-MM, or null when not given. */
  monthStart: string | null;
  /** YYYY-MM, or null when the person is still doing it. */
  monthEnd: string | null;
  /** A whole number from 0 to 100000 as digits, or null for no number. */
  numberValue: string | null;
  numberUnit: string | null;
  numberHedge: string | null;
  outcome: string | null;
}

export interface CVDraftRequest {
  role: string;
  entries: CVInterviewEntry[];
}

export interface CVBullet {
  entryIndex: number;
  /** The sentence. On a refused skill proposal, the skill name. */
  text: string;
  sourceQuote: string | null;
  sourceFields: string[] | null;
  usedNumbers: string[] | null;
  /** model or template. */
  origin: string;
  /** True when every model bullet for the entry was refused and the template wording is shown. */
  templateWording: boolean;
  checks: string[] | null;
  /** The reason code, set on a refused bullet only. */
  reason: string | null;
}

/** Strongest first. Enum *name* on the wire. */
export enum CVSkillLevel {
  RecordedOnYoma,
  Vouched,
  ShownInWork,
  SelfStated,
}

export interface CVSkill {
  name: string;
  skillId: string | null;
  level: CVSkillLevel | string; //NB: string
  /** The strongest source's label, printed after the skill on the CV. */
  label: string;
  sources: string[];
}

/** A completed learning opportunity or an issued credential. Never called a qualification. */
export interface CVLearningItem {
  /** completion or credential. */
  kind: string;
  title: string;
  issuer: string;
  date: string | null;
  skills: string[];
}

export interface CVEvidenceRecord {
  learning: CVLearningItem[];
  skills: CVSkill[];
  /** available or unavailable. */
  wallet: string;
  walletNotice: string | null;
}

export interface CVDraft {
  draft: boolean;
  bullets: CVBullet[];
  rejected: CVBullet[];
  skills: CVSkill[];
  /** live, or template when the environment is not enabled. */
  mode: string;
  provider: string;
  model: string;
  notice: string;
}
