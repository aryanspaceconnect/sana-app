import {
  PerfectCorpRawOutput,
  SkinAnalysisIntegrityLog,
  FacialScanResult,
  SkinTrendGraphPoint
} from '../../types.js';

/**
 * Skin Analysis Context Manager & Validation Service
 * Inspects structural integrity of Perfect Corp API output and builds enriched agent context.
 */
export class SkinContextManager {
  /**
   * Validates the integrity and structure of Perfect Corp raw output before agent reasoning.
   */
  public static validatePerfectCorpPayload(rawOutput: PerfectCorpRawOutput): SkinAnalysisIntegrityLog {
    const passedChecks: string[] = [];
    const integrityErrors: string[] = [];

    // Check 1: Scan ID, Task ID, and S2S Provider Signature
    if (rawOutput.scanId && rawOutput.taskId && rawOutput.fileId) {
      passedChecks.push(`Valid Perfect Corp S2S v2.0 signature (task_id: ${rawOutput.taskId}, file_id: ${rawOutput.fileId})`);
    } else {
      integrityErrors.push('Missing or invalid S2S v2.0 task/file identifier signature');
    }

    // Check 2: Metrics Schema Integrity
    const metrics = rawOutput.rawMetrics || {};
    const requiredKeys = ['poresScore', 'darkCirclesScore', 'barrierRednessScore', 'acneBlemishScore', 'moistureScore', 'skinAge'];
    let schemaVerified = true;

    for (const key of requiredKeys) {
      if (typeof (metrics as any)[key] !== 'number') {
        schemaVerified = false;
        integrityErrors.push(`Missing or non-numeric metric key: ${key}`);
      } else {
        const val = (metrics as any)[key];
        if (key !== 'skinAge' && (val < 0 || val > 100)) {
          integrityErrors.push(`Metric ${key} out of range (0-100): ${val}`);
        }
      }
    }

    if (schemaVerified && integrityErrors.length === 0) {
      passedChecks.push('Verified complete 6-point dermatological metrics schema');
    }

    // Check 3: Region Overlays Validation
    if (Array.isArray(rawOutput.annotatedRegions) && rawOutput.annotatedRegions.length > 0) {
      passedChecks.push(`Verified ${rawOutput.annotatedRegions.length} annotated feature region overlays`);
    } else {
      integrityErrors.push('Annotated region overlays missing or empty');
    }

    // Check 4: Verify Non-Direct Raw Image Bypass
    const directUploadFlag = !rawOutput.provider || !rawOutput.rawResponseLog;
    if (!directUploadFlag) {
      passedChecks.push('Verified Perfect Corp API processing pipeline provenance (non-direct upload)');
    } else {
      integrityErrors.push('Direct raw image upload detected without API pipeline provenance');
    }

    const integrityStatus: 'VALID' | 'WARNING' | 'FAILED' =
      integrityErrors.length === 0 ? 'VALID' : integrityErrors.length <= 2 ? 'WARNING' : 'FAILED';

    return {
      integrityStatus,
      passedChecks,
      integrityErrors,
      schemaVerified,
      directUploadFlag,
      validatedAt: new Date().toISOString()
    };
  }

  /**
   * Assembles the multi-layer context package for SANA Agent, incorporating:
   * 1. Fresh Perfect Corp raw report & region overlays
   * 2. Integrity validation log
   * 3. Last 2 scan reports
   * 4. 2-week skin profile trend graph & notes
   */
  public static buildAgentScanContext(
    currentOutput: PerfectCorpRawOutput,
    integrityLog: SkinAnalysisIntegrityLog,
    past2Scans: FacialScanResult[],
    twoWeekTrend: SkinTrendGraphPoint[]
  ): string {
    const metrics = currentOutput.rawMetrics;

    let pastScansSummary = "No previous scan history available (First baseline onboarding scan).";
    if (past2Scans && past2Scans.length > 0) {
      pastScansSummary = past2Scans.map((scan, idx) => {
        const dateStr = scan.timestamp ? new Date(scan.timestamp).toLocaleDateString() : `Scan -${idx + 1}`;
        return `[Past Scan #${idx + 1} - ${dateStr}]: Hydration=${scan.hydrationScore}%, Barrier=${scan.barrierScore}%, Clarity=${scan.clarityScore}%. Summary: "${scan.summary}"`;
      }).join("\n");
    }

    let trendSummary = "2-week skin profile graph tracking: Initial baseline establishing.";
    if (twoWeekTrend && twoWeekTrend.length > 0) {
      const avgHydration = Math.round(twoWeekTrend.reduce((acc, p) => acc + p.hydrationScore, 0) / twoWeekTrend.length);
      const avgBarrier = Math.round(twoWeekTrend.reduce((acc, p) => acc + p.barrierScore, 0) / twoWeekTrend.length);
      const avgClarity = Math.round(twoWeekTrend.reduce((acc, p) => acc + p.clarityScore, 0) / twoWeekTrend.length);
      const latestNotes = twoWeekTrend[twoWeekTrend.length - 1]?.notes || "Stable barrier progression";

      trendSummary = `14-Day Trend Graph Data (${twoWeekTrend.length} logged data points):
- Average 14-Day Hydration: ${avgHydration}%
- Average 14-Day Barrier Integrity: ${avgBarrier}%
- Average 14-Day Clarity: ${avgClarity}%
- Recent Incident/Progress Notes: "${latestNotes}"`;
    }

    return `=== SANA DERMATOLOGICAL FACIAL SCAN ANALYSIS CONTEXT ===
Scan Identifier: ${currentOutput.scanId}
S2S Task ID: ${currentOutput.taskId}
S2S File ID: ${currentOutput.fileId}
Timestamp: ${currentOutput.timestamp}
Integrity Validation Status: ${integrityLog.integrityStatus}
Passed Checks: ${integrityLog.passedChecks.join("; ")}
${integrityLog.integrityErrors.length > 0 ? `Integrity Warnings: ${integrityLog.integrityErrors.join("; ")}` : ''}

PERFECT CORP S2S V2.0 PROTOCOL TRACE:
${currentOutput.s2sStepLogs?.map(step => `- ${step}`).join("\n") || 'Direct S2S pipeline'}

FRESH PERFECT CORP METRICS (score_info.json):
- Overall Health Score (all): ${currentOutput.scoreInfo?.all || metrics.overallScore}/100
- Pores Score: ${metrics.poresScore}/100
- Dark Circles Score: ${metrics.darkCirclesScore}/100
- Barrier Redness Score: ${metrics.barrierRednessScore}/100 (Higher is healthier / less redness)
- Acne / Blemish Score: ${metrics.acneBlemishScore}/100 (Higher is clearer)
- Moisture Retention Score: ${metrics.moistureScore}/100
- Estimated Skin Age: ${metrics.skinAge} years
- Firmness Score: ${metrics.firmnessScore}/100

DETECTED FEATURE OVERLAYS (${currentOutput.annotatedRegions.length} Regions):
${currentOutput.annotatedRegions.map(r => `- [${r.label}] (${r.regionName}): Severity=${r.severityScore}/100 (${r.severityLevel}). Detail: ${r.description}`).join("\n")}

HISTORICAL CONTEXT (LAST 2 SCANS):
${pastScansSummary}

14-DAY SKIN PROFILE TREND GRAPH CONTEXT:
${trendSummary}
============================================================`;
  }
}
