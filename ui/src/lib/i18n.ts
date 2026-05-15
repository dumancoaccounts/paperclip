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
    issueEvidence: {
      title: "Delivery evidence",
      summaryWithContract: "Current proof is checked against expected output and minimum verification.",
      summaryWithoutContract: "No explicit evidence contract is set for this issue.",
      currentCount: "Current",
      historyCount: "History",
      primary: "Primary",
      lastVerified: "Last verified",
      sourceRun: "Run",
      sourceLink: "Source",
      loading: "Loading evidence...",
      error: "Evidence could not be loaded. The issue body is still available.",
      retry: "Retry",
      emptyWithContract: "No closing evidence has been added yet.",
      emptyWithoutContract: "Evidence is not expected for this issue unless the team adds it.",
      showHistory: "Show stale and superseded history",
      hideHistory: "Hide stale and superseded history",
      addEvidence: "Add evidence",
      editEvidence: "Edit evidence",
      cancelEdit: "Cancel edit",
      saveEvidence: "Save evidence",
      saving: "Saving...",
      titleRequired: "Evidence title is required.",
      saveFailed: "Evidence could not be saved.",
      formTitle: "Title",
      formTitlePlaceholder: "Test result, PR, screenshot, report, document, or verification note",
      formUrl: "Link",
      formKind: "Evidence kind",
      formRole: "Verification role",
      formValidity: "Validity",
      formPrimary: "Primary evidence",
      formSatisfiesMinimumVerification: "Satisfies minimum verification",
      formCoversExpectedOutput: "Covers expected output",
      formSummary: "Summary",
      staleReason: "Stale reason",
      supersededReason: "Superseded reason",
      satisfiesMinimumVerification: "Minimum verification satisfied",
      coversExpectedOutput: "Expected output covered",
      confidence: {
        missing: "Missing",
        weak: "Weak",
        partial: "Partial",
        ready: "Ready",
        review_required: "Review required",
      },
      type: {
        test_result: "Test result",
        screenshot: "Screenshot",
        pull_request: "Pull request",
        report: "Report",
        release_artifact: "Release artifact",
        document: "Document",
        manual_verification_note: "Manual verification note",
      },
      role: {
        minimum_verification: "Minimum verification",
        expected_output: "Expected output",
        completion_summary: "Completion summary",
        supporting: "Supporting",
      },
      validity: {
        current: "Current",
        stale: "Stale",
        superseded: "Superseded",
        revoked: "Revoked",
      },
      closeWarning: {
        title: "Evidence warning",
        description: "This issue can still be closed, but the current evidence is not ready.",
        body: "Closing evidence is missing, weak, partial, stale, or awaiting review.",
        reasonLabel: "Override reason",
        reasonPlaceholder: "Explain why this issue can close without ready evidence.",
        cancel: "Keep open",
        confirm: "Close anyway",
      },
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
    issueEvidence: {
      title: "Teslim kanıtı",
      summaryWithContract: "Güncel kanıt beklenen çıktı ve minimum doğrulamaya göre kontrol edilir.",
      summaryWithoutContract: "Bu görev için açık bir kanıt sözleşmesi yok.",
      currentCount: "Güncel",
      historyCount: "Geçmiş",
      primary: "Birincil",
      lastVerified: "Son doğrulama",
      sourceRun: "Run",
      sourceLink: "Kaynak",
      loading: "Kanıt yükleniyor...",
      error: "Kanıt yüklenemedi. Görev gövdesi kullanılabilir kalır.",
      retry: "Tekrar dene",
      emptyWithContract: "Kapanış kanıtı henüz eklenmedi.",
      emptyWithoutContract: "Ekip eklemediği sürece bu görev için kanıt beklenmiyor.",
      showHistory: "Eski ve yerini alan kanıt geçmişini göster",
      hideHistory: "Eski ve yerini alan kanıt geçmişini gizle",
      addEvidence: "Kanıt ekle",
      editEvidence: "Kanıtı düzenle",
      cancelEdit: "Düzenlemeyi iptal et",
      saveEvidence: "Kanıtı kaydet",
      saving: "Kaydediliyor...",
      titleRequired: "Kanıt başlığı zorunlu.",
      saveFailed: "Kanıt kaydedilemedi.",
      formTitle: "Başlık",
      formTitlePlaceholder: "Test sonucu, PR, ekran görüntüsü, rapor, doküman veya doğrulama notu",
      formUrl: "Bağlantı",
      formKind: "Kanıt türü",
      formRole: "Doğrulama rolü",
      formValidity: "Geçerlilik",
      formPrimary: "Birincil kanıt",
      formSatisfiesMinimumVerification: "Minimum doğrulamayı karşılar",
      formCoversExpectedOutput: "Beklenen çıktıyı kapsar",
      formSummary: "Özet",
      staleReason: "Eskime nedeni",
      supersededReason: "Yerini alma nedeni",
      satisfiesMinimumVerification: "Minimum doğrulama karşılandı",
      coversExpectedOutput: "Beklenen çıktı kapsandı",
      confidence: {
        missing: "Eksik",
        weak: "Zayıf",
        partial: "Kısmi",
        ready: "Hazır",
        review_required: "İnceleme bekliyor",
      },
      type: {
        test_result: "Test sonucu",
        screenshot: "Ekran görüntüsü",
        pull_request: "Pull request",
        report: "Rapor",
        release_artifact: "Sürüm çıktısı",
        document: "Doküman",
        manual_verification_note: "Manuel doğrulama notu",
      },
      role: {
        minimum_verification: "Minimum doğrulama",
        expected_output: "Beklenen çıktı",
        completion_summary: "Tamamlama özeti",
        supporting: "Destekleyici",
      },
      validity: {
        current: "Güncel",
        stale: "Eski",
        superseded: "Yerini aldı",
        revoked: "Geri çekildi",
      },
      closeWarning: {
        title: "Kanıt uyarısı",
        description: "Bu görev yine de kapatılabilir, ancak güncel kanıt hazır değil.",
        body: "Kapanış kanıtı eksik, zayıf, kısmi, eski veya inceleme bekliyor.",
        reasonLabel: "Override gerekçesi",
        reasonPlaceholder: "Hazır kanıt olmadan neden kapatılabileceğini açıklayın.",
        cancel: "Açık bırak",
        confirm: "Yine de kapat",
      },
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
