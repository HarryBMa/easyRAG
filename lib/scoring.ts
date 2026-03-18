/**
 * Confidence scoring & trash detection.
 * Flags guidelines that are likely outdated, low-quality, or conflicting.
 */

export type GuidelineStatus = 'active' | 'flagged' | 'needs_review'

export interface FlagResult {
  status: GuidelineStatus
  reasons: string[]
}

export interface PubmedRescore extends FlagResult {
  adjustedConfidence: number
}

/**
 * Determine whether a guideline should be flagged for review.
 */
export function evaluateGuideline(params: {
  confidenceScore: number
  sourceQuality: number
  rawText: string
  pubmedCount?: number
}): FlagResult {
  const { confidenceScore, sourceQuality, rawText, pubmedCount = 0 } = params
  const reasons: string[] = []

  // Low confidence from LLM
  if (confidenceScore < 0.4) {
    reasons.push('Low AI confidence score (<0.4) — content may be vague or conflicting')
  }

  // No verifiable sources
  if (sourceQuality < 0.3) {
    reasons.push('No identifiable sources or citations found')
  }

  // Outdated: year markers before 2015
  const yearMatch = rawText.match(/\b(19\d{2}|200\d|201[0-4])\b/)
  if (yearMatch) {
    reasons.push(`Potentially outdated — references year ${yearMatch[1]}`)
  }

  // Very short content
  if (rawText.trim().split(/\s+/).length < 30) {
    reasons.push('Guideline text is too short to be clinically useful')
  }

  // PubMed cross-check failed
  if (pubmedCount === 0 && sourceQuality < 0.5) {
    reasons.push('No matching PubMed studies found and low source quality')
  }

  if (reasons.length === 0) return { status: 'active', reasons: [] }
  if (reasons.length >= 2 || confidenceScore < 0.3) {
    return { status: 'flagged', reasons }
  }
  return { status: 'needs_review', reasons }
}

/**
 * Compute a trending score for sorting guidelines.
 * Weights: recency × (upvotes - downvotes) × confidence × pubmed_boost
 */
export function trendingScore(params: {
  upvotes: number
  downvotes: number
  confidenceScore: number
  pubmedCount: number
  createdAt: string
}): number {
  const { upvotes, downvotes, confidenceScore, pubmedCount, createdAt } = params
  const ageHours =
    (Date.now() - new Date(createdAt).getTime()) / 3_600_000

  const voteScore = upvotes - downvotes * 0.5
  const recencyDecay = 1 / (1 + ageHours / 168) // halves after 1 week
  const pubmedBoost = 1 + Math.log1p(pubmedCount) * 0.2

  return voteScore * recencyDecay * confidenceScore * pubmedBoost
}

/**
 * Re-evaluate a guideline after PubMed results arrive.
 * Boosts confidence when studies validate it, penalises when contradictions appear.
 * Call this after the verify-sources Edge Function completes.
 */
export function rescoreAfterPubmed(params: {
  confidenceScore: number
  sourceQuality: number
  rawText: string
  pubmedCount: number
  contradictionDetected?: boolean
}): PubmedRescore {
  const { confidenceScore, sourceQuality, rawText, pubmedCount, contradictionDetected = false } =
    params
  const base = evaluateGuideline({ confidenceScore, sourceQuality, rawText, pubmedCount })
  const reasons = [...base.reasons]
  let adjusted = confidenceScore

  if (contradictionDetected) {
    reasons.push('PubMed studies contain findings that may contradict this guideline')
    adjusted = Math.max(0, adjusted - 0.2)
  } else if (pubmedCount >= 3) {
    adjusted = Math.min(1, adjusted + 0.1)
  } else if (pubmedCount >= 1) {
    adjusted = Math.min(1, adjusted + 0.05)
  }

  // Re-derive status using the adjusted confidence
  const reEvaled = evaluateGuideline({
    confidenceScore: adjusted,
    sourceQuality,
    rawText,
    pubmedCount,
  })

  return {
    status: contradictionDetected ? 'flagged' : reEvaled.status,
    reasons: reEvaled.reasons.length ? reEvaled.reasons : reasons,
    adjustedConfidence: adjusted,
  }
}

/**
 * Badge logic for crowd-sourced tricks.
 */
export function computeBadges(params: {
  upvotes: number
  hospitalCount: number
  studyCount: number
}): string[] {
  const { upvotes, hospitalCount, studyCount } = params
  const badges: string[] = []

  if (upvotes >= 50) badges.push('community_approved')
  if (hospitalCount >= 5) badges.push('multi_site')
  if (studyCount >= 1) badges.push('evidence_backed')
  if (hospitalCount >= 10 && studyCount === 0)
    badges.push('research_opportunity')

  return badges
}
