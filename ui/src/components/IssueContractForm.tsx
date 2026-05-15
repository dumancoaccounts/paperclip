import { Plus, X } from "lucide-react";
import type { IssueContractFormState, IssueContractValidationErrors } from "../lib/issue-contract";
import {
  ISSUE_ESTIMATE_RISK_OPTIONS,
  ISSUE_ESTIMATE_SIZE_OPTIONS,
  ISSUE_PHASE_OPTIONS,
  issueEstimateRiskLabel,
  issueEstimateSizeLabel,
  issuePhaseLabel,
} from "../lib/issue-contract";
import { useLocale } from "../lib/i18n";
import { cn } from "../lib/utils";

type ListField = "successCriteria" | "minimumVerification" | "outOfScope";

type IssueContractFormProps = {
  value: IssueContractFormState;
  onChange: (value: IssueContractFormState) => void;
  errors?: IssueContractValidationErrors;
  disabled?: boolean;
  compact?: boolean;
};

function updateList(
  state: IssueContractFormState,
  field: ListField,
  updater: (items: string[]) => string[],
) {
  return { ...state, [field]: updater(state[field]) };
}

function ContractListInput({
  state,
  field,
  label,
  placeholder,
  disabled,
  onChange,
}: {
  state: IssueContractFormState;
  field: ListField;
  label: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: IssueContractFormState) => void;
}) {
  const { t } = useLocale();
  const items = state[field];
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="space-y-1.5">
        {items.map((item, index) => (
          <div key={`${field}:${index}`} className="flex items-center gap-1.5">
            <input
              className="min-h-9 min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground/50"
              value={item}
              placeholder={placeholder}
              disabled={disabled}
              onChange={(event) =>
                onChange(updateList(state, field, (current) =>
                  current.map((candidate, candidateIndex) => candidateIndex === index ? event.target.value : candidate),
                ))
              }
            />
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-50"
              aria-label={t("issueContract.removeItem")}
              title={t("issueContract.removeItem")}
              disabled={disabled}
              onClick={() =>
                onChange(updateList(state, field, (current) =>
                  current.filter((_, candidateIndex) => candidateIndex !== index),
                ))
              }
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-50"
        disabled={disabled}
        onClick={() => onChange(updateList(state, field, (current) => [...current, ""]))}
      >
        <Plus className="h-3.5 w-3.5" />
        {t("issueContract.addItem")}
      </button>
    </div>
  );
}

export function IssueContractForm({
  value,
  onChange,
  errors = {},
  disabled,
  compact,
}: IssueContractFormProps) {
  const { t, locale } = useLocale();
  const fieldClassName = "w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground/50 disabled:opacity-50";

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="issue-contract-expected-output">
          {t("issueContract.expectedOutput")}
        </label>
        <textarea
          id="issue-contract-expected-output"
          className={cn(fieldClassName, "min-h-20 resize-y")}
          value={value.expectedOutput}
          placeholder={t("issueContract.expectedOutputPlaceholder")}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, expectedOutput: event.target.value })}
        />
      </div>

      <ContractListInput
        state={value}
        field="successCriteria"
        label={t("issueContract.successCriteria")}
        placeholder={t("issueContract.successCriteriaPlaceholder")}
        disabled={disabled}
        onChange={onChange}
      />

      <ContractListInput
        state={value}
        field="minimumVerification"
        label={t("issueContract.minimumVerification")}
        placeholder={t("issueContract.minimumVerificationPlaceholder")}
        disabled={disabled}
        onChange={onChange}
      />

      <ContractListInput
        state={value}
        field="outOfScope"
        label={t("issueContract.outOfScope")}
        placeholder={t("issueContract.outOfScopePlaceholder")}
        disabled={disabled}
        onChange={onChange}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1.5">
          <span className="block text-xs font-medium text-muted-foreground">{t("issueContract.phase")}</span>
          <select
            className={fieldClassName}
            value={value.phase}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, phase: event.target.value as IssueContractFormState["phase"] })}
          >
            <option value="">{t("issueContract.noPhase")}</option>
            {ISSUE_PHASE_OPTIONS.map((phase) => (
              <option key={phase} value={phase}>{issuePhaseLabel(phase, locale)}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="block text-xs font-medium text-muted-foreground">{t("issueContract.estimateSize")}</span>
          <select
            className={fieldClassName}
            value={value.estimateSize}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, estimateSize: event.target.value as IssueContractFormState["estimateSize"] })}
          >
            <option value="">{t("issueContract.noSize")}</option>
            {ISSUE_ESTIMATE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{issueEstimateSizeLabel(size, locale)}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="block text-xs font-medium text-muted-foreground">{t("issueContract.estimateRisk")}</span>
          <select
            className={fieldClassName}
            value={value.estimateRisk}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, estimateRisk: event.target.value as IssueContractFormState["estimateRisk"] })}
          >
            <option value="">{t("issueContract.noRisk")}</option>
            {ISSUE_ESTIMATE_RISK_OPTIONS.map((risk) => (
              <option key={risk} value={risk}>{issueEstimateRiskLabel(risk, locale)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1.5">
          <span className="block text-xs font-medium text-muted-foreground">{t("issueContract.expectedHeartbeatCount")}</span>
          <input
            className={fieldClassName}
            inputMode="numeric"
            value={value.expectedHeartbeatCount}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, expectedHeartbeatCount: event.target.value })}
          />
          {errors.expectedHeartbeatCount ? <span className="text-xs text-destructive">{errors.expectedHeartbeatCount}</span> : null}
        </label>
        <label className="space-y-1.5">
          <span className="block text-xs font-medium text-muted-foreground">{t("issueContract.expectedHeartbeatRange")}</span>
          <div className="flex items-center gap-1.5">
            <input
              className={fieldClassName}
              inputMode="numeric"
              value={value.expectedHeartbeatRangeMin}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, expectedHeartbeatRangeMin: event.target.value })}
            />
            <span className="text-muted-foreground">-</span>
            <input
              className={fieldClassName}
              inputMode="numeric"
              value={value.expectedHeartbeatRangeMax}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, expectedHeartbeatRangeMax: event.target.value })}
            />
          </div>
          {errors.expectedHeartbeatRange ? <span className="text-xs text-destructive">{errors.expectedHeartbeatRange}</span> : null}
        </label>
        <label className="space-y-1.5">
          <span className="block text-xs font-medium text-muted-foreground">{t("issueContract.effectiveParallelism")}</span>
          <input
            className={fieldClassName}
            inputMode="numeric"
            value={value.effectiveParallelism}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, effectiveParallelism: event.target.value })}
          />
          {errors.effectiveParallelism ? <span className="text-xs text-destructive">{errors.effectiveParallelism}</span> : null}
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="block text-xs font-medium text-muted-foreground">{t("issueContract.estimateNotes")}</span>
        <textarea
          className={cn(fieldClassName, "min-h-16 resize-y")}
          value={value.estimateNotes}
          placeholder={t("issueContract.estimateNotesPlaceholder")}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, estimateNotes: event.target.value })}
        />
      </label>
    </div>
  );
}

