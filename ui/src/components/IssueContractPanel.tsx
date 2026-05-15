import { useEffect, useMemo, useState } from "react";
import type { Issue } from "@paperclipai/shared";
import { ClipboardList, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";
import { useLocale } from "../lib/i18n";
import {
  buildIssueContractPayload,
  issueContractFormStateFromIssue,
  issueEstimateSummary,
  issueHasStructuredContract,
  issuePhaseLabel,
  type IssueContractFormState,
  type IssueContractValidationErrors,
} from "../lib/issue-contract";
import { IssueContractForm } from "./IssueContractForm";

function ContractList({ title, items }: { title: string; items: string[] | null | undefined }) {
  const { t } = useLocale();
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
      {items?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6">
          {items.map((item, index) => <li key={`${title}:${index}`}>{item}</li>)}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("issueContract.notSpecified")}</p>
      )}
    </div>
  );
}

export function IssueContractPanel({
  issue,
  onUpdate,
  className,
}: {
  issue: Issue;
  onUpdate: (data: Record<string, unknown>) => Promise<unknown>;
  className?: string;
}) {
  const { t, locale } = useLocale();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<IssueContractFormState>(() => issueContractFormStateFromIssue(issue));
  const [errors, setErrors] = useState<IssueContractValidationErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const hasContract = issueHasStructuredContract(issue);

  useEffect(() => {
    if (!editing) {
      setDraft(issueContractFormStateFromIssue(issue));
      setErrors({});
      setSaveError(null);
    }
  }, [editing, issue]);

  const badges = useMemo(
    () => [
      issue.phase ? issuePhaseLabel(issue.phase, locale) : null,
      issue.estimate ? issueEstimateSummary(issue.estimate, locale) : null,
      issue.progress?.state ? issue.progress.state.replace(/_/g, " ") : null,
    ].filter(Boolean).slice(0, 3),
    [issue.estimate, issue.phase, issue.progress?.state, locale],
  );

  const save = async () => {
    const result = buildIssueContractPayload(draft, { includeEmptyFields: true, locale });
    setErrors(result.errors);
    setSaveError(null);
    if (Object.keys(result.errors).length > 0) return;
    setSaving(true);
    try {
      await onUpdate(result.payload);
      setEditing(false);
    } catch {
      setSaveError(t("issueContract.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={cn("rounded-lg border border-border/70 bg-muted/10 p-3", className)} data-testid="issue-contract-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h3 className="text-sm font-medium">{t("issueContract.title")}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasContract ? t("issueContract.collapsedSummary") : t("issueContract.emptySummary")}
          </p>
          {badges.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {badges.map((badge) => (
                <span key={badge} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => setEditing((value) => !value)}
        >
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          {editing ? t("issueContract.cancel") : t("issueContract.edit")}
        </Button>
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
          <IssueContractForm
            value={draft}
            onChange={setDraft}
            errors={errors}
            disabled={saving}
          />
          {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              {t("issueContract.cancel")}
            </Button>
            <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
              {t("issueContract.save")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <h4 className="text-xs font-medium text-muted-foreground">{t("issueContract.expectedOutput")}</h4>
            <p className="whitespace-pre-wrap text-sm leading-6">
              {issue.expectedOutput || <span className="text-muted-foreground">{t("issueContract.notSpecified")}</span>}
            </p>
          </div>
          <ContractList title={t("issueContract.successCriteria")} items={issue.successCriteria} />
          <ContractList title={t("issueContract.minimumVerification")} items={issue.minimumVerification} />
          <ContractList title={t("issueContract.outOfScope")} items={issue.outOfScope} />
          <div className="space-y-1">
            <h4 className="text-xs font-medium text-muted-foreground">{t("issueContract.phase")}</h4>
            <p className="text-sm">{issuePhaseLabel(issue.phase, locale)}</p>
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-medium text-muted-foreground">{t("issueContract.estimate")}</h4>
            <p className="text-sm">{issueEstimateSummary(issue.estimate, locale)}</p>
            {issue.estimate?.notes ? <p className="text-xs text-muted-foreground">{issue.estimate.notes}</p> : null}
          </div>
        </div>
      )}
    </section>
  );
}

