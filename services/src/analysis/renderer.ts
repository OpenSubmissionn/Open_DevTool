/**
 * Interfaces to ensure type safety and professional structure
 */
interface RenderOutput {
  transaction: {
    signature: string;
    slot: number;
    timestamp: number | null;
    success: boolean;
    error: any;
  };
  computeUnits: {
    consumed: number;
    limit: number;
    utilization: number;
  };
  accounts: any[];
  insights: Array<{
    type: string;
    level: string;
    message: string;
    details: any;
  }>;
  metadata: {
    version: string;
    generatedAt: string;
    engine: string;
  };
}

/**
 * Renders the analysis result and insights into a professional, 
 * structured JSON format suitable for CLI export or Frontend consumption.
 * * @param analyzed - The processed transaction data from the Engine
 * @param insights - Intelligence insights generated during analysis
 * @returns A strictly formatted and validated JSON string
 */
export function renderJSON(analyzed: any, insights: any[] = []): string {
  try {
    // Structural validation - ensures the core data exists
    if (!analyzed) {
      throw new Error("No analysis data provided to the renderer.");
    }

    const output: RenderOutput = {
      transaction: {
        signature: analyzed.signature || 'unknown',
        slot: analyzed.slot || 0,
        timestamp: analyzed.blockTime || null,
        success: !analyzed.error,
        error: analyzed.error || null,
      },
      computeUnits: {
        consumed: analyzed.computeUnits?.consumed ?? 0,
        limit: analyzed.computeUnits?.limit ?? 0,
        utilization: Number(analyzed.computeUnits?.utilization?.toFixed(4)) ?? 0,
      },
      accounts: analyzed.accountDiffs || [],
      insights: insights.map(insight => ({
        type: insight.type || 'GENERIC',
        level: insight.level || 'info',
        message: insight.message || '',
        details: insight.details || {},
      })),
      metadata: {
        version: "1.0.0",
        generatedAt: new Date().toISOString(),
        engine: "OPEN-Insight-Engine-God-Mode" // Aquele toque de autoridade
      }
    };

    return JSON.stringify(output, null, 2);
  } catch (error) {
    // Professional error wrapping
    return JSON.stringify({
      error: "Render Error",
      message: error instanceof Error ? error.message : "Unknown error occurred during rendering",
      timestamp: new Date().toISOString()
    }, null, 2);
  }
}