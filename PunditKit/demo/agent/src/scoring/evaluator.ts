import type { ScoreComponents, ScoringResult, ResearchPath, ResearchSource } from '../types';

/**
 * Scoring System
 *
 * 3-Factor Model:
 * - Source Authenticity (40%): Primary vs secondary sources, domain authority, recency, corroboration
 * - Confidence Level (35%): Evidence convergence, contradiction detection, completeness
 * - Sizing Factor (25%): Kelly criterion, bankroll %, liquidity constraints
 */

const WEIGHTS = {
  sourceAuthenticity: 0.40,
  confidenceLevel: 0.35,
  sizingFactor: 0.25
};

export function calculateScores(
  researchPaths: ResearchPath[],
  sources: ResearchSource[],
  marketOdds: number,
  liquidity: number,
  maxPositionPercent: number = 5
): ScoreComponents {
  return {
    sourceAuthenticity: calculateSourceAuthenticity(sources),
    confidenceLevel: calculateConfidenceLevel(researchPaths),
    sizingFactor: calculateSizingFactor(liquidity, maxPositionPercent)
  };
}

export function calculateCompositeScore(scores: ScoreComponents): number {
  return Math.round(
    scores.sourceAuthenticity * WEIGHTS.sourceAuthenticity +
    scores.confidenceLevel * WEIGHTS.confidenceLevel +
    scores.sizingFactor * WEIGHTS.sizingFactor
  );
}

export function calculateEdge(
  estimatedProbability: number,
  marketOdds: number
): number {
  // Edge = estimated probability - market implied probability
  // Returns as decimal (e.g., 0.05 for 5% edge)
  return estimatedProbability - marketOdds;
}

export function calculateKellyPosition(
  edge: number,
  odds: number,
  compositeScore: number,
  maxPositionPercent: number = 5,
  minConfidence: number = 60
): number {
  // Don't trade if composite score is below threshold
  if (compositeScore < minConfidence) {
    return 0;
  }

  // Don't trade if edge is negligible (< 2% absolute)
  if (Math.abs(edge) < 0.02) {
    return 0;
  }

  // Kelly Criterion: f* = (bp - q) / b
  // where b = odds/(1-odds) - 1, p = estimated probability, q = 1-p
  const p = odds + edge;
  const q = 1 - p;
  const b = odds / (1 - odds);

  let kellyFraction = (b * p - q) / b;

  // Apply confidence scaling
  kellyFraction *= compositeScore / 100;

  // Half-Kelly for safety
  kellyFraction *= 0.5;

  // Cap at max position
  kellyFraction = Math.max(0, Math.min(kellyFraction * 100, maxPositionPercent));

  return Math.round(kellyFraction * 100) / 100;
}

function calculateSourceAuthenticity(sources: ResearchSource[]): number {
  if (sources.length === 0) return 0;

  let score = 0;
  const maxSources = Math.min(sources.length, 10);

  for (let i = 0; i < maxSources; i++) {
    const source = sources[i];

    // Domain authority contribution (0-40 points)
    const authorityScore = (source.domain_authority || 50) * 0.4;

    // Recency contribution (0-30 points)
    let recencyScore = 15; // Default for unknown dates
    if (source.publish_date) {
      const daysSince = (Date.now() - new Date(source.publish_date).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) recencyScore = 30;
      else if (daysSince < 30) recencyScore = 25;
      else if (daysSince < 90) recencyScore = 20;
      else if (daysSince < 365) recencyScore = 10;
      else recencyScore = 5;
    }

    // Relevance contribution (0-30 points)
    const relevanceScore = (source.relevance_score || 0.5) * 30;

    score += (authorityScore + recencyScore + relevanceScore) / maxSources;
  }

  // Bonus for multiple corroborating sources
  if (sources.length >= 5) score *= 1.1;
  if (sources.length >= 10) score *= 1.1;

  return Math.min(100, Math.round(score));
}

function calculateConfidenceLevel(researchPaths: ResearchPath[]): number {
  if (researchPaths.length === 0) return 0;

  let score = 50; // Base score

  const completedPaths = researchPaths.filter(p => p.status === 'completed');
  if (completedPaths.length === 0) return 20;

  // Completeness bonus (up to +20)
  score += Math.min(20, completedPaths.length * 5);

  // Analyze convergence across research paths
  const allFacts: string[] = [];
  const allContradictions: string[] = [];

  for (const path of completedPaths) {
    if (path.key_facts) {
      try {
        const facts = JSON.parse(path.key_facts) as string[];
        allFacts.push(...facts);
      } catch {}
    }
    if (path.contradictions) {
      try {
        const contradictions = JSON.parse(path.contradictions) as string[];
        allContradictions.push(...contradictions);
      } catch {}
    }
  }

  // Evidence quantity bonus (up to +15)
  score += Math.min(15, allFacts.length * 1.5);

  // Contradiction penalty (up to -30)
  score -= Math.min(30, allContradictions.length * 10);

  // Summary quality bonus
  const avgSummaryLength = completedPaths.reduce(
    (sum, p) => sum + (p.summary?.length || 0),
    0
  ) / completedPaths.length;

  if (avgSummaryLength > 500) score += 10;
  else if (avgSummaryLength > 200) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function calculateSizingFactor(
  liquidity: number,
  maxPositionPercent: number
): number {
  let score = 50;

  // Liquidity assessment
  if (liquidity >= 1000000) score += 30; // $1M+ excellent
  else if (liquidity >= 500000) score += 25;
  else if (liquidity >= 100000) score += 20;
  else if (liquidity >= 50000) score += 15;
  else if (liquidity >= 10000) score += 10;
  else score += 5;

  // Max position constraint acknowledgment
  if (maxPositionPercent >= 5) score += 10;
  else if (maxPositionPercent >= 3) score += 7;
  else if (maxPositionPercent >= 1) score += 3;

  // Slippage consideration for large orders
  // Assuming we'd want to take < 1% of liquidity
  score += 10;

  return Math.min(100, Math.round(score));
}

export function generateScoringReasoning(
  scores: ScoreComponents,
  compositeScore: number,
  edge: number,
  recommendedPosition: number,
  sourceCount: number,
  factCount: number,
  contradictionCount: number
): string {
  const parts: string[] = [];

  // Source authenticity assessment
  if (scores.sourceAuthenticity >= 80) {
    parts.push(`Strong source quality (${scores.sourceAuthenticity}/100) with ${sourceCount} high-authority sources.`);
  } else if (scores.sourceAuthenticity >= 60) {
    parts.push(`Moderate source quality (${scores.sourceAuthenticity}/100) from ${sourceCount} sources.`);
  } else {
    parts.push(`Limited source quality (${scores.sourceAuthenticity}/100). Consider additional research.`);
  }

  // Confidence assessment
  if (scores.confidenceLevel >= 80) {
    parts.push(`High confidence (${scores.confidenceLevel}/100) with ${factCount} supporting facts and strong evidence convergence.`);
  } else if (scores.confidenceLevel >= 60) {
    parts.push(`Moderate confidence (${scores.confidenceLevel}/100). ${factCount} key facts identified.`);
  } else {
    parts.push(`Low confidence (${scores.confidenceLevel}/100).`);
  }

  if (contradictionCount > 0) {
    parts.push(`Note: ${contradictionCount} contradiction(s) detected in research.`);
  }

  // Sizing assessment
  if (scores.sizingFactor >= 70) {
    parts.push(`Good market conditions (${scores.sizingFactor}/100) for position sizing.`);
  } else {
    parts.push(`Limited liquidity affects sizing (${scores.sizingFactor}/100).`);
  }

  // Edge assessment
  const edgePercent = edge * 100;
  const edgeSign = edgePercent >= 0 ? '+' : '';
  parts.push(`Calculated edge: ${edgeSign}${edgePercent.toFixed(1)}%.`);

  // Position recommendation
  if (recommendedPosition > 0) {
    parts.push(`Recommended position: ${recommendedPosition.toFixed(2)}% of bankroll.`);
  } else {
    parts.push(`No position recommended at current confidence level.`);
  }

  return parts.join(' ');
}
