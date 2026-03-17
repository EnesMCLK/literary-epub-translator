import { BookStats } from '../design';

export interface DynamicStats {
  dynamicEstimatedTokens: number;
  dynamicDurationFree: number;
  dynamicDurationPro: number;
  dynamicDurationFreeMax: number;
  duration: number;
  dynamicCost: number;
  isFastTier: boolean;
  durationDisplay: string;
  costDisplay: string;
}

export const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
};

export function calculateDynamicStats(
  stats: BookStats | null,
  targetLang: string | undefined,
  modelId: string | undefined,
  hasPaidKey: boolean,
  isPaidTier: boolean,
  freeCostText: string = "FREE"
): DynamicStats | null {
  if (!stats) return null;

  // Token Estimation based on language
  let langRatio = 2.0; // default
  if (targetLang === 'tr') langRatio = 2.5;
  else if (targetLang === 'en') langRatio = 1.3;
  else if (['fr', 'de', 'es', 'it', 'pt', 'nl', 'pl'].includes(targetLang || '')) langRatio = 1.5;
  else if (['ru', 'ar', 'hi', 'vi'].includes(targetLang || '')) langRatio = 2.0;
  else if (['zh', 'ja', 'ko'].includes(targetLang || '')) langRatio = 2.5;

  const promptTokenCount = 1180; // Estimated tokens for system instructions per chunk
  
  // Dynamic token calculation
  const dynamicEstimatedTokens = Math.ceil((stats.totalWords * langRatio) + (stats.estimatedChunks * promptTokenCount));

  // Dinamik olarak seçili modele göre süre ve maliyet hesapla
  let rpmPaid = 360;
  let tpmPaid = 4_000_000;
  let inputPricePerM = 0.075;
  let outputPricePerM = 0.30;

  switch (modelId) {
      case 'gemini-2.5-flash-lite':
      case 'gemini-2.5-flash':
      case 'gemini-3.1-flash-lite-preview':
      case 'gemini-3-flash-preview':
          rpmPaid = (modelId === 'gemini-3-flash-preview' || modelId === 'gemini-3.1-flash-lite-preview') ? 120 : 360;
          tpmPaid = 4_000_000;
          inputPricePerM = 0.075;
          outputPricePerM = 0.30;
          break;
      case 'gemini-3.1-pro-preview':
          rpmPaid = 60;
          tpmPaid = 2_000_000;
          inputPricePerM = 1.25;
          outputPricePerM = 5.00;
          break;
      default:
          rpmPaid = 360;
          tpmPaid = 4_000_000;
          inputPricePerM = 0.075;
          outputPricePerM = 0.30;
  }

  // Calculate duration based on both RPM and TPM
  const freeRPM = 15;
  const freeTPM = 1_000_000;
  
  const durationFreeByRPM = Math.ceil(stats.estimatedChunks / freeRPM);
  const durationFreeByTPM = Math.ceil(dynamicEstimatedTokens / freeTPM);
  const dynamicDurationFree = Math.max(durationFreeByRPM, durationFreeByTPM);

  const durationProByRPM = Math.ceil(stats.estimatedChunks / rpmPaid);
  const durationProByTPM = Math.ceil(dynamicEstimatedTokens / tpmPaid);
  const dynamicDurationPro = Math.max(durationProByRPM, durationProByTPM);

  const dynamicDurationFreeMax = Math.ceil(stats.estimatedChunks * 24 / 60);

  const isFastTier = hasPaidKey && isPaidTier;
  const duration = isFastTier ? dynamicDurationPro : dynamicDurationFree;
  
  const durationDisplay = `~${formatDuration(duration)}`;

  const inputTokensM = dynamicEstimatedTokens / 1_000_000;
  const outputTokensM = (stats.totalWords * langRatio) / 1_000_000; // Output is roughly the translated text
  const dynamicCost = (inputTokensM * inputPricePerM) + (outputTokensM * outputPricePerM);
  const costDisplay = isFastTier ? `$${dynamicCost.toFixed(4)}` : freeCostText;

  return {
    dynamicEstimatedTokens,
    dynamicDurationFree,
    dynamicDurationPro,
    dynamicDurationFreeMax,
    duration,
    dynamicCost,
    isFastTier,
    durationDisplay,
    costDisplay
  };
}
