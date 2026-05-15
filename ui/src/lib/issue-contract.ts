import type { Issue, IssueEstimate, IssuePhase } from "@paperclipai/shared";
import { translate, type Locale } from "./i18n";

export type IssueContractFormState = {
  expectedOutput: string;
  successCriteria: string[];
  minimumVerification: string[];
  outOfScope: string[];
  phase: "" | IssuePhase;
  estimateSize: "" | NonNullable<IssueEstimate["size"]>;
  estimateRisk: "" | NonNullable<IssueEstimate["risk"]>;
  expectedHeartbeatCount: string;
  expectedHeartbeatRangeMin: string;
  expectedHeartbeatRangeMax: string;
  effectiveParallelism: string;
  estimateNotes: string;
};

export type IssueContractValidationErrors = Partial<Record<
  "expectedHeartbeatCount" | "expectedHeartbeatRange" | "effectiveParallelism",
  string
>>;

export const ISSUE_PHASE_OPTIONS: IssuePhase[] = [
  "triage",
  "planning",
  "implementation",
  "verification",
  "review",
  "delivery",
];

export const ISSUE_ESTIMATE_SIZE_OPTIONS: NonNullable<IssueEstimate["size"]>[] = ["XS", "S", "M", "L", "XL"];
export const ISSUE_ESTIMATE_RISK_OPTIONS: NonNullable<IssueEstimate["risk"]>[] = ["low", "medium", "high"];

function compactList(values: string[]) {
  const next = values.map((value) => value.trim()).filter(Boolean);
  return next.length > 0 ? next : null;
}

function compactText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberFromInput(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function validateBoundedInteger(value: string, min: number, max: number) {
  const parsed = numberFromInput(value);
  if (parsed === null) return { value: null, valid: true };
  if (!Number.isInteger(parsed) || parsed < min || parsed > max || String(parsed) !== value.trim()) {
    return { value: parsed, valid: false };
  }
  return { value: parsed, valid: true };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asIssueEstimate(value: unknown): IssueEstimate | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as IssueEstimate
    : null;
}

function asIssuePhase(value: unknown): IssuePhase | "" {
  return ISSUE_PHASE_OPTIONS.includes(value as IssuePhase) ? value as IssuePhase : "";
}

export function issueContractFormStateFromIssue(issue?: unknown): IssueContractFormState {
  const record = asRecord(issue);
  const estimate = asIssueEstimate(record.estimate);
  return {
    expectedOutput: typeof record.expectedOutput === "string" ? record.expectedOutput : "",
    successCriteria: asStringList(record.successCriteria),
    minimumVerification: asStringList(record.minimumVerification),
    outOfScope: asStringList(record.outOfScope),
    phase: asIssuePhase(record.phase),
    estimateSize: estimate?.size ?? "",
    estimateRisk: estimate?.risk ?? "",
    expectedHeartbeatCount: estimate?.expectedHeartbeatCount
      ? String(estimate.expectedHeartbeatCount)
      : "",
    expectedHeartbeatRangeMin: estimate?.expectedHeartbeatRange?.min
      ? String(estimate.expectedHeartbeatRange.min)
      : "",
    expectedHeartbeatRangeMax: estimate?.expectedHeartbeatRange?.max
      ? String(estimate.expectedHeartbeatRange.max)
      : "",
    effectiveParallelism: estimate?.effectiveParallelism
      ? String(estimate.effectiveParallelism)
      : "",
    estimateNotes: estimate?.notes ?? "",
  };
}

export function buildIssueContractPayload(
  state: IssueContractFormState,
  options: { includeEmptyFields?: boolean; locale?: Locale } = {},
): {
  payload: Record<string, unknown>;
  errors: IssueContractValidationErrors;
  hasContract: boolean;
} {
  const locale = options.locale ?? "en";
  const errors: IssueContractValidationErrors = {};
  const expectedHeartbeatCount = validateBoundedInteger(state.expectedHeartbeatCount, 1, 100);
  if (!expectedHeartbeatCount.valid) {
    errors.expectedHeartbeatCount = translate("issueContract.validationPositiveInteger", locale);
  }

  const rangeMin = validateBoundedInteger(state.expectedHeartbeatRangeMin, 1, 100);
  const rangeMax = validateBoundedInteger(state.expectedHeartbeatRangeMax, 1, 100);
  if (!rangeMin.valid || !rangeMax.valid) {
    errors.expectedHeartbeatRange = translate("issueContract.validationPositiveInteger", locale);
  } else if (rangeMin.value !== null && rangeMax.value !== null && rangeMin.value > rangeMax.value) {
    errors.expectedHeartbeatRange = translate("issueContract.validationRange", locale);
  }

  const effectiveParallelism = validateBoundedInteger(state.effectiveParallelism, 1, 20);
  if (!effectiveParallelism.valid) {
    errors.effectiveParallelism = translate("issueContract.validationParallelism", locale);
  }

  const estimate: IssueEstimate = {
    size: state.estimateSize || null,
  };
  if (expectedHeartbeatCount.value !== null) estimate.expectedHeartbeatCount = expectedHeartbeatCount.value;
  if (rangeMin.value !== null || rangeMax.value !== null) {
    estimate.expectedHeartbeatRange = {
      min: rangeMin.value ?? rangeMax.value ?? 1,
      max: rangeMax.value ?? rangeMin.value ?? 1,
    };
  }
  if (state.estimateRisk) estimate.risk = state.estimateRisk;
  if (effectiveParallelism.value !== null) estimate.effectiveParallelism = effectiveParallelism.value;
  const notes = compactText(state.estimateNotes);
  if (notes) estimate.notes = notes;

  const hasEstimate = Boolean(
    estimate.size
    || estimate.expectedHeartbeatCount
    || estimate.expectedHeartbeatRange
    || estimate.risk
    || estimate.effectiveParallelism
    || estimate.notes,
  );
  const normalized = {
    expectedOutput: compactText(state.expectedOutput),
    successCriteria: compactList(state.successCriteria),
    minimumVerification: compactList(state.minimumVerification),
    outOfScope: compactList(state.outOfScope),
    phase: state.phase || null,
    estimate: hasEstimate ? estimate : null,
  };
  const hasContract = Boolean(
    normalized.expectedOutput
    || normalized.successCriteria
    || normalized.minimumVerification
    || normalized.outOfScope
    || normalized.phase
    || normalized.estimate,
  );
  const payload = options.includeEmptyFields || hasContract
    ? normalized
    : {};

  return { payload, errors, hasContract };
}

export function issueHasStructuredContract(issue: Pick<
  Issue,
  "successCriteria" | "minimumVerification" | "expectedOutput" | "outOfScope" | "estimate" | "phase"
>) {
  return Boolean(
    issue.expectedOutput
    || issue.successCriteria?.length
    || issue.minimumVerification?.length
    || issue.outOfScope?.length
    || issue.estimate
    || issue.phase,
  );
}

export function issuePhaseLabel(phase: IssuePhase | null | undefined, locale?: Locale) {
  return phase ? translate(`issuePhase.${phase}`, locale) : translate("issueContract.noPhase", locale);
}

export function issueEstimateSizeLabel(size: IssueEstimate["size"] | null | undefined, locale?: Locale) {
  return size ? translate(`issueEstimate.size${size}`, locale) : translate("issueContract.noSize", locale);
}

export function issueEstimateRiskLabel(risk: IssueEstimate["risk"] | null | undefined, locale?: Locale) {
  if (!risk) return translate("issueContract.noRisk", locale);
  return translate(`issueEstimate.risk${risk.charAt(0).toUpperCase()}${risk.slice(1)}`, locale);
}

export function issueEstimateSummary(estimate: IssueEstimate | null | undefined, locale?: Locale) {
  if (!estimate) return translate("issueContract.notSpecified", locale);
  const parts = [
    estimate.size ? issueEstimateSizeLabel(estimate.size, locale) : null,
    estimate.expectedHeartbeatCount ? `${estimate.expectedHeartbeatCount} hb` : null,
    estimate.expectedHeartbeatRange ? `${estimate.expectedHeartbeatRange.min}-${estimate.expectedHeartbeatRange.max} hb` : null,
    estimate.risk ? issueEstimateRiskLabel(estimate.risk, locale) : null,
    estimate.effectiveParallelism ? `P${estimate.effectiveParallelism}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : translate("issueContract.notSpecified", locale);
}
