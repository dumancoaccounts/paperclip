import { useMemo } from "react";

export type Locale = "en" | "tr";

type TranslationTree = {
  [key: string]: string | TranslationTree;
};

const translations = {
  en: {
    issueContract: {
      title: "Contract",
      collapsedSummary: "Optional output, success, verification, scope, estimate, and phase.",
      emptySummary: "This issue is tracked from its free-form description.",
      edit: "Edit contract",
      save: "Save contract",
      cancel: "Cancel",
      addItem: "Add item",
      removeItem: "Remove item",
      expectedOutput: "Expected output",
      expectedOutputPlaceholder: "Artifact, decision, PR, document, screenshot set, or other board-visible output.",
      successCriteria: "Success criteria",
      successCriteriaPlaceholder: "Measurable condition for marking this issue done",
      minimumVerification: "Minimum verification",
      minimumVerificationPlaceholder: "Smallest check that proves the work",
      outOfScope: "Out of scope",
      outOfScopePlaceholder: "Work this issue should not include",
      estimate: "Estimate",
      estimateSize: "Size",
      estimateRisk: "Risk",
      expectedHeartbeatCount: "Expected heartbeats",
      expectedHeartbeatRange: "Heartbeat range",
      effectiveParallelism: "Effective parallelism",
      estimateNotes: "Estimate notes",
      estimateNotesPlaceholder: "Risk, assumptions, or split notes.",
      phase: "Phase",
      noPhase: "No phase",
      noSize: "No size",
      noRisk: "No risk",
      notSpecified: "Not specified yet",
      none: "None",
      validationRange: "Range minimum must be less than or equal to maximum.",
      validationPositiveInteger: "Use a whole number from 1 to 100.",
      validationParallelism: "Use a whole number from 1 to 20.",
      saveFailed: "Contract save failed. Your local values were kept.",
    },
    issuePhase: {
      triage: "Triage",
      planning: "Planning",
      implementation: "Implementation",
      verification: "Verification",
      review: "Review",
      delivery: "Delivery",
    },
    issueEstimate: {
      riskLow: "Low risk",
      riskMedium: "Medium risk",
      riskHigh: "High risk",
      sizeXS: "XS",
      sizeS: "S",
      sizeM: "M",
      sizeL: "L",
      sizeXL: "XL",
    },
  },
  tr: {
    issueContract: {
      title: "Sözleşme",
      collapsedSummary: "İsteğe bağlı çıktı, başarı, doğrulama, kapsam, tahmin ve faz.",
      emptySummary: "Bu görev serbest açıklaması üzerinden izleniyor.",
      edit: "Sözleşmeyi düzenle",
      save: "Sözleşmeyi kaydet",
      cancel: "İptal",
      addItem: "Madde ekle",
      removeItem: "Maddeyi kaldır",
      expectedOutput: "Beklenen çıktı",
      expectedOutputPlaceholder: "Artifact, karar, PR, doküman, ekran görüntüsü seti veya board tarafından görülecek başka çıktı.",
      successCriteria: "Başarı kriterleri",
      successCriteriaPlaceholder: "Bu görevi bitti saydıran ölçülebilir koşul",
      minimumVerification: "Minimum doğrulama",
      minimumVerificationPlaceholder: "İşi kanıtlayan en küçük kontrol",
      outOfScope: "Kapsam dışı",
      outOfScopePlaceholder: "Bu göreve dahil edilmemesi gereken iş",
      estimate: "Tahmin",
      estimateSize: "Boyut",
      estimateRisk: "Risk",
      expectedHeartbeatCount: "Beklenen heartbeat",
      expectedHeartbeatRange: "Heartbeat aralığı",
      effectiveParallelism: "Etkili paralellik",
      estimateNotes: "Tahmin notları",
      estimateNotesPlaceholder: "Risk, varsayım veya bölme notları.",
      phase: "Faz",
      noPhase: "Faz yok",
      noSize: "Boyut yok",
      noRisk: "Risk yok",
      notSpecified: "Henüz belirtilmedi",
      none: "Yok",
      validationRange: "Aralık minimumu maksimumdan küçük veya eşit olmalı.",
      validationPositiveInteger: "1 ile 100 arasında tam sayı kullanın.",
      validationParallelism: "1 ile 20 arasında tam sayı kullanın.",
      saveFailed: "Sözleşme kaydedilemedi. Yerel değerler korundu.",
    },
    issuePhase: {
      triage: "Triyaj",
      planning: "Planlama",
      implementation: "Uygulama",
      verification: "Doğrulama",
      review: "İnceleme",
      delivery: "Teslim",
    },
    issueEstimate: {
      riskLow: "Düşük risk",
      riskMedium: "Orta risk",
      riskHigh: "Yüksek risk",
      sizeXS: "XS",
      sizeS: "S",
      sizeM: "M",
      sizeL: "L",
      sizeXL: "XL",
    },
  },
} as const satisfies Record<Locale, TranslationTree>;

function readTranslation(tree: TranslationTree, key: string): string | null {
  let node: string | TranslationTree | undefined = tree;
  for (const part of key.split(".")) {
    if (typeof node === "string") return null;
    node = node[part];
    if (node === undefined) return null;
  }
  return typeof node === "string" ? node : null;
}

export function resolveLocale(input?: string | null): Locale {
  const normalized = input?.toLowerCase() ?? "";
  return normalized.startsWith("tr") ? "tr" : "en";
}

export function detectLocale(): Locale {
  if (typeof document !== "undefined" && document.documentElement.lang) {
    return resolveLocale(document.documentElement.lang);
  }
  if (typeof navigator !== "undefined") {
    return resolveLocale(navigator.language);
  }
  return "en";
}

export function translate(key: string, locale: Locale = detectLocale()): string {
  return readTranslation(translations[locale], key)
    ?? readTranslation(translations.en, key)
    ?? key;
}

export function useLocale() {
  const locale = detectLocale();
  return useMemo(
    () => ({
      locale,
      t: (key: string) => translate(key, locale),
    }),
    [locale],
  );
}

