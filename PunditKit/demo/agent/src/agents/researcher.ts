import type { GeminiResearchResult, ResearchTechnique, ResearchPath } from '../types';

/**
 * Researcher Agent
 * Supports multiple research techniques:
 * - deep_research: Gemini Deep Research Pro (autonomous multi-step research)
 * - quick_search: Gemini 3 Pro with Google Search grounding (fast)
 * - analysis: Claude Opus (analyze aggregated research, no search)
 */

// Model IDs - NEVER use flash models
const MODELS = {
  DEEP_RESEARCH: 'deep-research-pro-preview-12-2025',
  GEMINI_3_PRO: 'gemini-3-pro-preview',
  CLAUDE_OPUS: 'claude-opus-4-5-20251101'
};

// Progress callback for poll updates
export type PollProgressCallback = (pollCount: number) => Promise<void>;

// Result of creating a Deep Research interaction
export interface DeepResearchInteraction {
  interactionId: string;
  initialStatus: string;
}

/**
 * Execute research based on technique
 */
export async function executeResearch(
  technique: ResearchTechnique,
  apiKey: string,
  query: string,
  model?: string,
  existingResearch?: ResearchPath[]
): Promise<GeminiResearchResult> {
  switch (technique) {
    case 'deep_research':
      return executeDeepResearch(apiKey, query, model);
    case 'quick_search':
      return executeQuickSearch(apiKey, query, model);
    case 'analysis':
      return executeAnalysis(apiKey, query, existingResearch || []);
    default:
      throw new Error(`Unknown research technique: ${technique}`);
  }
}

/**
 * Deep Research Pro - Autonomous multi-step research agent
 * Uses Gemini Interactions API for comprehensive autonomous research
 *
 * Split into two functions for robustness:
 * 1. createDeepResearchInteraction() - Creates interaction, returns ID immediately
 * 2. pollDeepResearchUntilComplete() - Polls until done, with progress callback
 *
 * This allows the caller to save the interaction ID to DB before polling,
 * enabling resume on crash/retry.
 */

const DEEP_RESEARCH_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

/**
 * Create a Deep Research interaction - returns immediately with interaction ID
 * Caller should save this ID to DB before starting to poll
 */
export async function createDeepResearchInteraction(
  geminiApiKey: string,
  query: string
): Promise<DeepResearchInteraction> {
  const agent = MODELS.DEEP_RESEARCH;

  console.log(`[Deep Research] Creating interaction with agent: ${agent}`);
  console.log(`[Deep Research] Query length: ${query.length} chars`);

  const createBody = {
    input: query,
    agent: agent,
    background: true
  };

  const createResponse = await fetch(`${DEEP_RESEARCH_BASE_URL}?key=${geminiApiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(createBody)
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    console.error(`[Deep Research] CREATE ERROR: ${createResponse.status} - ${errorText}`);
    throw new Error(`Gemini Interactions API error: ${createResponse.status} - ${errorText}`);
  }

  const createResult = await createResponse.json() as {
    id: string;
    status: string;
  };

  console.log(`[Deep Research] Interaction created: ${createResult.id}`);
  console.log(`[Deep Research] Initial status: ${createResult.status}`);

  return {
    interactionId: createResult.id,
    initialStatus: createResult.status
  };
}

/**
 * Poll an existing Deep Research interaction until completion
 * Calls onProgress callback after each poll so caller can update DB
 */
export async function pollDeepResearchUntilComplete(
  geminiApiKey: string,
  interactionId: string,
  onProgress?: PollProgressCallback
): Promise<GeminiResearchResult> {
  const maxPollTime = 10 * 60 * 1000; // 10 minutes max
  const pollInterval = 10 * 1000; // 10 seconds between polls
  const startTime = Date.now();
  let pollCount = 0;

  console.log(`[Deep Research] Starting to poll interaction: ${interactionId}`);

  while (Date.now() - startTime < maxPollTime) {
    pollCount++;
    await sleep(pollInterval);

    console.log(`[Deep Research] Polling #${pollCount} for interaction ${interactionId}...`);

    // Report progress to caller
    if (onProgress) {
      await onProgress(pollCount);
    }

    const pollResponse = await fetch(`${DEEP_RESEARCH_BASE_URL}/${interactionId}?key=${geminiApiKey}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!pollResponse.ok) {
      const errorText = await pollResponse.text();
      console.error(`[Deep Research] POLL ERROR: ${pollResponse.status} - ${errorText}`);
      throw new Error(`Gemini poll error: ${pollResponse.status} - ${errorText}`);
    }

    const pollResult = await pollResponse.json() as {
      id: string;
      status: string;
      outputs?: Array<{
        text?: string;
        sources?: Array<{
          url: string;
          title?: string;
        }>;
      }>;
      error?: {
        message: string;
        code: number;
      };
      // Potential progress fields - let's see what's available
      progress?: unknown;
      steps?: unknown;
      currentStep?: unknown;
      metadata?: unknown;
    };

    // Log full response to see what intermediate data is available
    console.log(`[Deep Research] Poll #${pollCount} status: ${pollResult.status}`);
    console.log(`[Deep Research] Poll #${pollCount} full response keys:`, Object.keys(pollResult));
    if (pollResult.status !== 'completed') {
      console.log(`[Deep Research] Poll #${pollCount} response:`, JSON.stringify(pollResult, null, 2));
    }

    if (pollResult.status === 'completed') {
      console.log(`[Deep Research] Research completed after ${pollCount} polls (${Math.round((Date.now() - startTime) / 1000)}s)`);
      return parseDeepResearchOutput(pollResult.outputs || []);
    }

    if (pollResult.status === 'failed') {
      const errorMsg = pollResult.error?.message || 'Unknown error';
      console.error(`[Deep Research] Research FAILED: ${errorMsg}`);
      throw new Error(`Deep Research failed: ${errorMsg}`);
    }

    // Status is still "in_progress", continue polling
    console.log(`[Deep Research] Still in progress, continuing to poll...`);
  }

  // Timeout
  throw new Error(`Deep Research timed out after ${maxPollTime / 1000} seconds`);
}

/**
 * Parse the outputs from a completed Deep Research interaction
 */
function parseDeepResearchOutput(outputs: Array<{
  text?: string;
  sources?: Array<{ url: string; title?: string }>;
}>): GeminiResearchResult {
  const textContent = outputs.map(o => o.text || '').join('\n\n');

  if (!textContent) {
    throw new Error('Deep Research completed but no text output found');
  }

  // Extract sources from outputs if available
  const sources: GeminiResearchResult['sources'] = [];
  for (const output of outputs) {
    if (output.sources) {
      for (const source of output.sources) {
        sources.push({
          url: source.url,
          title: source.title || 'Unknown',
          domainAuthority: estimateDomainAuthority(source.url),
          publishDate: null,
          relevanceScore: 0.85
        });
      }
    }
  }

  // Also try to extract URLs from the text content (citations)
  const urlMatches = textContent.match(/https?:\/\/[^\s\)\]]+/g) || [];
  const seenUrls = new Set(sources.map(s => s.url));
  for (const url of urlMatches) {
    const cleanUrl = url.replace(/[.,;:]+$/, ''); // Remove trailing punctuation
    if (!seenUrls.has(cleanUrl)) {
      seenUrls.add(cleanUrl);
      sources.push({
        url: cleanUrl,
        title: 'Cited Source',
        domainAuthority: estimateDomainAuthority(cleanUrl),
        publishDate: null,
        relevanceScore: 0.7
      });
    }
  }

  console.log(`[Deep Research] Extracted ${sources.length} sources`);

  return {
    summary: textContent,
    keyFacts: extractBulletPoints(textContent),
    contradictions: [],
    sources
  };
}

/**
 * Convenience function that creates and polls in one call
 * Used when you don't need to save interaction ID (e.g., playground testing)
 */
export async function executeDeepResearch(
  geminiApiKey: string,
  query: string,
  _model?: string,
  onProgress?: PollProgressCallback
): Promise<GeminiResearchResult> {
  const { interactionId } = await createDeepResearchInteraction(geminiApiKey, query);
  return pollDeepResearchUntilComplete(geminiApiKey, interactionId, onProgress);
}

/**
 * Helper function for async sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Quick Search - Gemini 3 Pro with Google grounding for fast research
 */
export async function executeQuickSearch(
  geminiApiKey: string,
  query: string,
  model?: string
): Promise<GeminiResearchResult> {
  const modelId = model || MODELS.GEMINI_3_PRO;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${geminiApiKey.substring(0, 8)}...`;

  console.log(`[Quick Search] Starting with model: ${modelId}`);
  console.log(`[Quick Search] URL (key masked): ${url}`);
  console.log(`[Quick Search] Query length: ${query.length} chars`);

  const requestBody = {
    contents: [{
      parts: [{
        text: query
      }]
    }],
    generationConfig: {
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: 4096
    },
    tools: [{
      googleSearch: {}
    }]
  };

  console.log(`[Quick Search] Request body:`, JSON.stringify(requestBody).substring(0, 500));

  // Use Gemini 3 Pro with Google Search grounding
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }
  );

  console.log(`[Quick Search] Response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Quick Search] ERROR: ${response.status} - ${errorText}`);
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json() as {
    candidates: Array<{
      content: {
        parts: Array<{ text: string }>;
      };
      groundingMetadata?: {
        groundingChunks?: Array<{
          web?: { uri: string; title: string };
        }>;
      };
    }>;
  };

  if (!result.candidates || result.candidates.length === 0) {
    throw new Error('No response from Gemini');
  }

  const textContent = result.candidates[0].content.parts[0].text;
  const groundingMetadata = result.candidates[0].groundingMetadata;

  // Extract sources
  const sources: GeminiResearchResult['sources'] = [];
  if (groundingMetadata?.groundingChunks) {
    for (const chunk of groundingMetadata.groundingChunks) {
      if (chunk.web) {
        sources.push({
          url: chunk.web.uri,
          title: chunk.web.title || 'Unknown',
          domainAuthority: estimateDomainAuthority(chunk.web.uri),
          publishDate: null,
          relevanceScore: 0.7
        });
      }
    }
  }

  return {
    summary: textContent,
    keyFacts: extractBulletPoints(textContent),
    contradictions: [],
    sources
  };
}

/**
 * Analysis - Claude Opus analyzes aggregated research (no web search)
 * Used for synthesis when you have multiple research reports
 */
export async function executeAnalysis(
  claudeApiKey: string,
  query: string,
  existingResearch: ResearchPath[]
): Promise<GeminiResearchResult> {
  // Aggregate existing research
  let aggregatedResearch = '';
  for (const research of existingResearch) {
    if (research.summary) {
      aggregatedResearch += `=== Research Report (${research.technique || 'unknown'}) ===\n`;
      aggregatedResearch += research.summary;
      aggregatedResearch += '\n\n';
    }
  }

  const systemPrompt = `You are an expert analyst synthesizing multiple research reports about a prediction market.
Your job is to:
1. Identify key themes and findings across all reports
2. Note any contradictions or disagreements between sources
3. Highlight the most decision-relevant information
4. Provide a clear, structured summary

Output your analysis in markdown format with clear sections.`;

  const userPrompt = `${query}

=== RESEARCH REPORTS TO SYNTHESIZE ===
${aggregatedResearch || 'No existing research available.'}

Provide a comprehensive synthesis of these research findings. Focus on actionable insights for trading decisions.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODELS.CLAUDE_OPUS,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };

  const textContent = result.content[0].text;

  return {
    summary: textContent,
    keyFacts: extractBulletPoints(textContent),
    contradictions: [],
    sources: [] // No new sources for synthesis
  };
}

/**
 * Estimate domain authority based on known high-value sources
 */
function estimateDomainAuthority(url: string): number {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    // High authority domains
    const highAuthority = [
      'reuters.com', 'bloomberg.com', 'wsj.com', 'nytimes.com', 'ft.com',
      'economist.com', 'bbc.com', 'cnn.com', 'apnews.com', 'gov',
      'edu', 'nature.com', 'science.org', 'arxiv.org', 'whitehouse.gov'
    ];

    // Medium authority domains
    const mediumAuthority = [
      'techcrunch.com', 'theverge.com', 'wired.com', 'forbes.com',
      'businessinsider.com', 'cnbc.com', 'politico.com', 'axios.com',
      'thehill.com', 'washingtonpost.com'
    ];

    for (const domain of highAuthority) {
      if (hostname.includes(domain)) return 85 + Math.floor(Math.random() * 10);
    }

    for (const domain of mediumAuthority) {
      if (hostname.includes(domain)) return 65 + Math.floor(Math.random() * 15);
    }

    // Check for .gov or .edu
    if (hostname.endsWith('.gov') || hostname.endsWith('.edu')) {
      return 80 + Math.floor(Math.random() * 15);
    }

    // Default for unknown domains
    return 40 + Math.floor(Math.random() * 20);
  } catch {
    return 50;
  }
}

/**
 * Extract bullet points from text for key facts
 */
function extractBulletPoints(text: string): string[] {
  const lines = text.split('\n');
  const facts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Look for bullet points, numbered lists, or lines starting with -
    if (
      trimmed.match(/^[\-\*\•]\s/) ||
      trimmed.match(/^\d+[\.)\]]\s/) ||
      trimmed.match(/^[a-z][\.)\]]\s/i)
    ) {
      const cleaned = trimmed.replace(/^[\-\*\•\d\.a-z\)\]]+\s*/i, '').trim();
      if (cleaned.length > 10 && cleaned.length < 500) {
        facts.push(cleaned);
      }
    }
  }

  return facts.slice(0, 15); // Return up to 15 key facts
}
