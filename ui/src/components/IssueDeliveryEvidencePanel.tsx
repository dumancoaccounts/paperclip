import { useMemo, useState, type FormEvent } from "react";
import type {
  Issue,
  IssueDeliveryEvidenceSummary,
  IssueEvidenceKind,
  IssueEvidenceValidity,
  IssueEvidenceVerificationRole,
  IssueWorkProduct,
} from "@paperclipai/shared";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  GitPullRequest,
  History,
  Image,
  Link as LinkIcon,
  NotebookText,
  Pencil,
  Plus,
  RotateCcw,
  TestTube2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/lib/router";
import { useLocale } from "@/lib/i18n";
import { cn, relativeTime } from "@/lib/utils";

const evidenceKinds: IssueEvidenceKind[] = [
  "test_result",
  "screenshot",
  "pull_request",
  "report",
  "release_artifact",
  "document",
  "manual_verification_note",
];

const verificationRoles: IssueEvidenceVerificationRole[] = [
  "minimum_verification",
  "expected_output",
  "completion_summary",
  "supporting",
];

const validityStates: IssueEvidenceValidity[] = [
  "current",
  "stale",
  "superseded",
  "revoked",
];

type EvidenceFormState = {
  id: string | null;
  title: string;
  url: string;
  summary: string;
  evidenceKind: IssueEvidenceKind;
  verificationRole: IssueEvidenceVerificationRole;
  validity: IssueEvidenceValidity;
  isPrimary: boolean;
  satisfiesMinimumVerification: boolean;
  coversExpectedOutput: boolean;
  staleReason: string;
  supersededReason: string;
};

function emptyForm(): EvidenceFormState {
  return {
    id: null,
    title: "",
    url: "",
    summary: "",
    evidenceKind: "manual_verification_note",
    verificationRole: "supporting",
    validity: "current",
    isPrimary: false,
    satisfiesMinimumVerification: false,
    coversExpectedOutput: false,
    staleReason: "",
    supersededReason: "",
  };
}

function formFromProduct(product: IssueWorkProduct): EvidenceFormState {
  return {
    id: product.id,
    title: product.title,
    url: product.url ?? "",
    summary: product.summary ?? "",
    evidenceKind: product.evidenceKind ?? "manual_verification_note",
    verificationRole: product.verificationRole,
    validity: product.validity,
    isPrimary: product.isPrimary,
    satisfiesMinimumVerification: product.satisfiesMinimumVerification,
    coversExpectedOutput: product.coversExpectedOutput,
    staleReason: product.staleReason ?? "",
    supersededReason: product.supersededReason ?? "",
  };
}

export function issueEvidenceConfidenceLabel(
  confidence: IssueDeliveryEvidenceSummary["closeConfidence"] | null | undefined,
  t: (key: string) => string,
) {
  return t(`issueEvidence.confidence.${confidence ?? "missing"}`);
}

export function isIssueEvidenceCloseWarningNeeded(issue: Pick<Issue, "status" | "deliveryEvidence">) {
  if (issue.status === "done" || issue.status === "cancelled") return false;
  const confidence = issue.deliveryEvidence?.closeConfidence ?? "missing";
  return confidence !== "ready";
}

function evidenceKindIcon(kind: IssueEvidenceKind | null) {
  switch (kind) {
    case "test_result":
      return TestTube2;
    case "screenshot":
      return Image;
    case "pull_request":
      return GitPullRequest;
    case "report":
      return NotebookText;
    case "release_artifact":
      return ClipboardCheck;
    case "document":
      return FileText;
    case "manual_verification_note":
    default:
      return CheckCircle2;
  }
}

function confidenceClassName(confidence: IssueDeliveryEvidenceSummary["closeConfidence"]) {
  switch (confidence) {
    case "ready":
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "partial":
    case "review_required":
      return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "weak":
      return "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300";
    case "missing":
    default:
      return "border-destructive/35 bg-destructive/10 text-destructive";
  }
}

function hasEvidenceContract(issue: Issue) {
  return Boolean(
    issue.expectedOutput?.trim() ||
    (Array.isArray(issue.minimumVerification) && issue.minimumVerification.some((item) => item.trim())),
  );
}

function isHistoricalEvidence(product: IssueWorkProduct) {
  return product.validity === "stale" ||
    product.validity === "superseded" ||
    product.validity === "revoked" ||
    Boolean(product.staleAt || product.supersededAt || product.supersededByWorkProductId);
}

function evidencePayload(form: EvidenceFormState) {
  const now = new Date().toISOString();
  return {
    type: form.evidenceKind,
    provider: "paperclip",
    title: form.title.trim(),
    url: form.url.trim() || null,
    summary: form.summary.trim() || null,
    evidenceKind: form.evidenceKind,
    verificationRole: form.verificationRole,
    validity: form.validity,
    isPrimary: form.isPrimary,
    satisfiesMinimumVerification: form.satisfiesMinimumVerification,
    coversExpectedOutput: form.coversExpectedOutput,
    verifiedAt:
      form.validity === "current" &&
      (form.satisfiesMinimumVerification || form.coversExpectedOutput || form.isPrimary)
        ? now
        : null,
    staleAt: form.validity === "stale" ? now : null,
    staleReason: form.staleReason.trim() || null,
    supersededAt: form.validity === "superseded" ? now : null,
    supersededReason: form.supersededReason.trim() || null,
  };
}

function EvidenceSelect<TValue extends string>({
  label,
  value,
  options,
  labelFor,
  onChange,
}: {
  label: string;
  value: TValue;
  options: TValue[];
  labelFor: (value: TValue) => string;
  onChange: (value: TValue) => void;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <select
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
        value={value}
        onChange={(event) => onChange(event.target.value as TValue)}
      >
        {options.map((option) => (
          <option key={option} value={option}>{labelFor(option)}</option>
        ))}
      </select>
    </label>
  );
}

function EvidenceItem({
  issue,
  product,
  onEdit,
}: {
  issue: Issue;
  product: IssueWorkProduct;
  onEdit: (product: IssueWorkProduct) => void;
}) {
  const { t } = useLocale();
  const Icon = evidenceKindIcon(product.evidenceKind);
  const runHref = product.createdByRunId && issue.assigneeAgentId
    ? `/agents/${issue.assigneeAgentId}/runs/${product.createdByRunId}`
    : null;
  const lastVerified = product.verifiedAt ?? product.updatedAt ?? product.createdAt;

  return (
    <div className="rounded-md border border-border/70 bg-background/70 p-3" data-testid={`evidence-item-${product.validity}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/30">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {product.url ? (
              <a
                href={product.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 truncate text-sm font-medium hover:underline"
              >
                {product.title}
              </a>
            ) : (
              <span className="min-w-0 truncate text-sm font-medium">{product.title}</span>
            )}
            {product.isPrimary ? (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                {t("issueEvidence.primary")}
              </span>
            ) : null}
          </div>
          {product.summary ? <p className="text-xs leading-5 text-muted-foreground">{product.summary}</p> : null}
          <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded-full border border-border px-2 py-0.5">
              {t(`issueEvidence.type.${product.evidenceKind ?? "manual_verification_note"}`)}
            </span>
            <span className="rounded-full border border-border px-2 py-0.5">
              {t(`issueEvidence.role.${product.verificationRole}`)}
            </span>
            <span className="rounded-full border border-border px-2 py-0.5">
              {t(`issueEvidence.validity.${product.validity}`)}
            </span>
            {product.satisfiesMinimumVerification ? (
              <span className="rounded-full border border-emerald-500/30 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
                {t("issueEvidence.satisfiesMinimumVerification")}
              </span>
            ) : null}
            {product.coversExpectedOutput ? (
              <span className="rounded-full border border-emerald-500/30 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
                {t("issueEvidence.coversExpectedOutput")}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>{t("issueEvidence.lastVerified")}: {relativeTime(lastVerified)}</span>
            {runHref ? (
              <Link to={runHref} className="inline-flex items-center gap-1 hover:text-foreground">
                <LinkIcon className="h-3 w-3" />
                {t("issueEvidence.sourceRun")}
              </Link>
            ) : product.createdByRunId ? (
              <span>{t("issueEvidence.sourceRun")}: {product.createdByRunId.slice(0, 8)}</span>
            ) : null}
            {product.url ? (
              <a href={product.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                <ExternalLink className="h-3 w-3" />
                {t("issueEvidence.sourceLink")}
              </a>
            ) : null}
          </div>
          {product.staleReason || product.supersededReason ? (
            <p className="rounded-md bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
              {product.staleReason ?? product.supersededReason}
            </p>
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="icon-xs" onClick={() => onEdit(product)} title={t("issueEvidence.editEvidence")}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function IssueDeliveryEvidencePanel({
  issue,
  workProducts,
  workProductsLoading,
  workProductsError,
  onRetryWorkProducts,
  onCreateWorkProduct,
  onUpdateWorkProduct,
  saving,
  className,
}: {
  issue: Issue;
  workProducts: IssueWorkProduct[];
  workProductsLoading?: boolean;
  workProductsError?: unknown;
  onRetryWorkProducts?: () => void;
  onCreateWorkProduct: (data: Record<string, unknown>) => Promise<unknown>;
  onUpdateWorkProduct: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  saving?: boolean;
  className?: string;
}) {
  const { t } = useLocale();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<EvidenceFormState>(() => emptyForm());
  const [formError, setFormError] = useState<string | null>(null);

  const summary = issue.deliveryEvidence;
  const confidence = summary?.closeConfidence ?? "missing";
  const currentEvidence = useMemo(
    () => workProducts.filter((product) => !isHistoricalEvidence(product)),
    [workProducts],
  );
  const historicalEvidence = useMemo(
    () => workProducts.filter(isHistoricalEvidence),
    [workProducts],
  );
  const hasContract = hasEvidenceContract(issue);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    if (!form.title.trim()) {
      setFormError(t("issueEvidence.titleRequired"));
      return;
    }
    try {
      if (form.id) {
        await onUpdateWorkProduct(form.id, evidencePayload(form));
      } else {
        await onCreateWorkProduct(evidencePayload(form));
      }
      setForm(emptyForm());
      setFormOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("issueEvidence.saveFailed"));
    }
  };

  return (
    <section className={cn("rounded-lg border border-border/70 bg-muted/10 p-3", className)} data-testid="issue-delivery-evidence-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h3 className="text-sm font-medium">{t("issueEvidence.title")}</h3>
            <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", confidenceClassName(confidence))}>
              {issueEvidenceConfidenceLabel(confidence, t)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {hasContract ? t("issueEvidence.summaryWithContract") : t("issueEvidence.summaryWithoutContract")}
          </p>
        </div>
        {summary ? (
          <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded-full border border-border px-2 py-0.5">
              {t("issueEvidence.currentCount")}: {summary.currentEvidenceCount}
            </span>
            <span className="rounded-full border border-border px-2 py-0.5">
              {t("issueEvidence.historyCount")}: {summary.staleEvidenceCount + summary.supersededEvidenceCount}
            </span>
          </div>
        ) : null}
      </div>

      {confidence !== "ready" ? (
        <div className="mt-3 flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t("issueEvidence.closeWarning.body")}</span>
        </div>
      ) : null}

      {workProductsError ? (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <p className="text-destructive">{t("issueEvidence.error")}</p>
          {onRetryWorkProducts ? (
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetryWorkProducts}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {t("issueEvidence.retry")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {workProductsLoading ? (
          <p className="text-sm text-muted-foreground">{t("issueEvidence.loading")}</p>
        ) : currentEvidence.length > 0 ? (
          currentEvidence.map((product) => (
            <EvidenceItem
              key={product.id}
              issue={issue}
              product={product}
              onEdit={(next) => {
                setForm(formFromProduct(next));
                setFormOpen(true);
              }}
            />
          ))
        ) : (
          <p className="rounded-md border border-dashed border-border/80 p-3 text-sm text-muted-foreground">
            {hasContract ? t("issueEvidence.emptyWithContract") : t("issueEvidence.emptyWithoutContract")}
          </p>
        )}
      </div>

      {historicalEvidence.length > 0 ? (
        <div className="mt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => setHistoryOpen((value) => !value)}>
            <History className="mr-1.5 h-3.5 w-3.5" />
            {historyOpen ? t("issueEvidence.hideHistory") : t("issueEvidence.showHistory")}
            <span className="ml-1 text-muted-foreground">({historicalEvidence.length})</span>
          </Button>
          {historyOpen ? (
            <div className="mt-2 space-y-2">
              {historicalEvidence.map((product) => (
                <EvidenceItem
                  key={product.id}
                  issue={issue}
                  product={product}
                  onEdit={(next) => {
                    setForm(formFromProduct(next));
                    setFormOpen(true);
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!formOpen ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => {
            setForm(emptyForm());
            setFormOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("issueEvidence.addEvidence")}
        </Button>
      ) : (
      <form className="mt-4 space-y-3 rounded-md border border-border/70 bg-background/60 p-3" onSubmit={submit}>
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">{form.id ? t("issueEvidence.editEvidence") : t("issueEvidence.addEvidence")}</h4>
          {form.id ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => {
                setForm(emptyForm());
                setFormOpen(false);
              }}
            >
              {t("issueEvidence.cancelEdit")}
            </Button>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-medium text-muted-foreground sm:col-span-2">
            <span>{t("issueEvidence.formTitle")}</span>
            <Input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder={t("issueEvidence.formTitlePlaceholder")}
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground sm:col-span-2">
            <span>{t("issueEvidence.formUrl")}</span>
            <Input
              value={form.url}
              onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
              placeholder="https://..."
            />
          </label>
          <EvidenceSelect
            label={t("issueEvidence.formKind")}
            value={form.evidenceKind}
            options={evidenceKinds}
            labelFor={(value) => t(`issueEvidence.type.${value}`)}
            onChange={(value) => setForm((current) => ({ ...current, evidenceKind: value }))}
          />
          <EvidenceSelect
            label={t("issueEvidence.formRole")}
            value={form.verificationRole}
            options={verificationRoles}
            labelFor={(value) => t(`issueEvidence.role.${value}`)}
            onChange={(value) => setForm((current) => ({ ...current, verificationRole: value }))}
          />
          <EvidenceSelect
            label={t("issueEvidence.formValidity")}
            value={form.validity}
            options={validityStates}
            labelFor={(value) => t(`issueEvidence.validity.${value}`)}
            onChange={(value) => setForm((current) => ({ ...current, validity: value }))}
          />
          <div className="grid gap-2 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.isPrimary}
                onChange={(event) => setForm((current) => ({ ...current, isPrimary: event.target.checked }))}
              />
              <span>{t("issueEvidence.formPrimary")}</span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.satisfiesMinimumVerification}
                onChange={(event) => setForm((current) => ({ ...current, satisfiesMinimumVerification: event.target.checked }))}
              />
              <span>{t("issueEvidence.formSatisfiesMinimumVerification")}</span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.coversExpectedOutput}
                onChange={(event) => setForm((current) => ({ ...current, coversExpectedOutput: event.target.checked }))}
              />
              <span>{t("issueEvidence.formCoversExpectedOutput")}</span>
            </label>
          </div>
          <label className="space-y-1 text-xs font-medium text-muted-foreground sm:col-span-2">
            <span>{t("issueEvidence.formSummary")}</span>
            <Textarea
              value={form.summary}
              onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
              className="min-h-[72px]"
            />
          </label>
          {form.validity === "stale" ? (
            <label className="space-y-1 text-xs font-medium text-muted-foreground sm:col-span-2">
              <span>{t("issueEvidence.staleReason")}</span>
              <Input
                value={form.staleReason}
                onChange={(event) => setForm((current) => ({ ...current, staleReason: event.target.value }))}
              />
            </label>
          ) : null}
          {form.validity === "superseded" ? (
            <label className="space-y-1 text-xs font-medium text-muted-foreground sm:col-span-2">
              <span>{t("issueEvidence.supersededReason")}</span>
              <Input
                value={form.supersededReason}
                onChange={(event) => setForm((current) => ({ ...current, supersededReason: event.target.value }))}
              />
            </label>
          ) : null}
        </div>
        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? t("issueEvidence.saving") : form.id ? t("issueEvidence.saveEvidence") : t("issueEvidence.addEvidence")}
          </Button>
        </div>
      </form>
      )}
    </section>
  );
}
