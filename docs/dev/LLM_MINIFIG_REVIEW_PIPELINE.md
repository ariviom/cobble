# LLM-Assisted Minifig Review Pipeline

## Overview

This document describes the implementation of an LLM-powered batch processing pipeline to automatically review and improve low-confidence Rebrickable → BrickLink minifig mappings.

**Goal**: Reduce the manual review burden by having a local LLM (via Ollama) analyze low-confidence mappings and either approve them, suggest corrections, or flag them for human review.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Batch Processing Pipeline                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │   Supabase   │───▶│  LLM Service │───▶│   Results    │               │
│  │  (low conf   │    │  (Ollama +   │    │  (updates +  │               │
│  │   mappings)  │    │   LLaVA)     │    │   reasoning) │               │
│  └──────────────┘    └──────────────┘    └──────────────┘               │
│         │                   │                   │                        │
│         │            ┌──────┴──────┐            │                        │
│         │            │             │            │                        │
│         ▼            ▼             ▼            ▼                        │
│  ┌─────────────────────────────────────────────────────┐                │
│  │                    Analysis Modes                    │                │
│  ├─────────────────────────────────────────────────────┤                │
│  │  1. Text Analysis    - Name/description comparison   │                │
│  │  2. Vision Analysis  - Image comparison via LLaVA    │                │
│  │  3. Context Analysis - Set theme/character reasoning │                │
│  └─────────────────────────────────────────────────────┘                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Hardware Requirements

- **Ollama** running on a machine with GPU
- **Recommended**: RTX 3090 (24GB VRAM) - sufficient for LLaVA 13B
- **Models**:
  - `llava:13b` - Vision + language model (primary)
  - `llama3.2:latest` - Text-only fallback (faster, for image-less mappings)

## Database Schema Changes

### Migration: `add_llm_review_columns.sql`

```sql
-- Add LLM review columns to bricklink_minifig_mappings
ALTER TABLE bricklink_minifig_mappings
ADD COLUMN IF NOT EXISTS llm_suggestion jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS llm_confidence real DEFAULT NULL,
ADD COLUMN IF NOT EXISTS llm_action text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS llm_reasoning text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS llm_model text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS llm_processed_at timestamptz DEFAULT NULL;

-- Index for finding unprocessed low-confidence mappings
CREATE INDEX IF NOT EXISTS idx_minifig_mappings_llm_queue
ON bricklink_minifig_mappings (confidence, llm_processed_at)
WHERE confidence < 0.7 AND llm_processed_at IS NULL;

-- Add comment
COMMENT ON COLUMN bricklink_minifig_mappings.llm_suggestion IS 'LLM suggested BL minifig ID (null if current mapping is correct)';
COMMENT ON COLUMN bricklink_minifig_mappings.llm_action IS 'LLM recommended action: approve, reject, remap, needs_review';
COMMENT ON COLUMN bricklink_minifig_mappings.llm_reasoning IS 'Natural language explanation of LLM decision';
```

### LLM Action Types

| Action         | Description                                                      |
| -------------- | ---------------------------------------------------------------- |
| `approve`      | Current mapping is correct, auto-approve                         |
| `reject`       | Current mapping is wrong, no good alternative found              |
| `remap`        | Current mapping is wrong, `llm_suggestion` contains better match |
| `needs_review` | LLM is uncertain, flag for human review                          |

## Dependencies

```bash
# TanStack AI (alpha) with Ollama adapter
npm install @tanstack/ai @tanstack/ai-ollama zod

# Image processing (already installed)
# npm install sharp
```

## Implementation

### 1. Ollama Client Configuration

**File**: `scripts/lib/ollama-client.ts`

```typescript
import { OllamaAdapter } from '@tanstack/ai-ollama';

export function createOllamaAdapter(model: 'vision' | 'text' = 'vision') {
  const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

  return new OllamaAdapter({
    baseUrl,
    defaultModel: model === 'vision' ? 'llava:13b' : 'llama3.2',
  });
}

// Health check
export async function checkOllamaHealth(): Promise<boolean> {
  const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

// List available models
export async function listOllamaModels(): Promise<string[]> {
  const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const res = await fetch(`${baseUrl}/api/tags`);
  const data = await res.json();
  return data.models?.map((m: { name: string }) => m.name) ?? [];
}
```

### 2. Prompt Templates

**File**: `scripts/lib/llm-prompts.ts`

```typescript
export const MINIFIG_SYSTEM_PROMPT = `You are an expert LEGO minifig identifier. Your task is to verify whether a Rebrickable minifig entry correctly maps to a BrickLink minifig entry.

## Background
- Rebrickable and BrickLink are two different LEGO catalog databases
- They use different naming conventions and sometimes different IDs for the same minifig
- Your job is to determine if two entries represent the SAME physical minifig

## Naming Convention Differences
- Rebrickable often includes detailed part descriptions: "Lloyd - EVO Head Wrap, Rebooted"
- BrickLink uses simpler names: "Lloyd - Core" or "Lloyd (Rebooted)"
- The character name (before the first " - ") is the most important identifier
- Variant descriptions indicate different versions but same character

## LEGO Themes to Consider
- Ninjago: Lloyd, Kai, Jay, Cole, Zane, Nya, Wu, Garmadon, etc.
- Star Wars: Luke, Leia, Han, various Troopers, Droids
- Marvel/DC: Spider-Man, Batman, Iron Man, etc.
- City: Police, Firefighter, Construction workers
- Castle/Pirates: Knights, Soldiers, Pirates

## Your Task
Analyze the provided information and determine:
1. Do the RB and BL entries represent the SAME minifig?
2. If not, what should be done?
3. Explain your reasoning clearly.`;

export const VISION_ANALYSIS_PROMPT = `I'm showing you two LEGO minifig images.

**Left image**: Rebrickable catalog entry
- ID: {rbFigId}
- Name: {rbName}

**Right image**: BrickLink catalog entry  
- ID: {blMinifigNo}
- Name: {blName}

**Set context**: These minifigs should both appear in "{setName}"

## Questions to answer:
1. Do these images show the SAME minifig (same torso, head, legs, accessories)?
2. Are there any visible differences (colors, prints, accessories)?
3. Is this a correct mapping?

## Response format:
Respond with a JSON object:
{
  "isMatch": boolean,
  "confidence": number (0.0-1.0),
  "action": "approve" | "reject" | "needs_review",
  "differences": string[] | null,
  "reasoning": string
}`;

export const TEXT_ANALYSIS_PROMPT = `Analyze this minifig mapping (no images available):

**Rebrickable Entry**:
- ID: {rbFigId}
- Name: {rbName}
- Part Count: {rbPartCount}

**BrickLink Entry**:
- ID: {blMinifigNo}
- Name: {blName}
- Part Count: {blPartCount}

**Set Context**: "{setName}" ({setNum})

**Current Confidence**: {currentConfidence}

## Analysis Required:
1. Do the names refer to the same character?
2. Are the part counts compatible?
3. Is this likely a correct mapping?

## Response format:
Respond with a JSON object:
{
  "isMatch": boolean,
  "confidence": number (0.0-1.0),
  "action": "approve" | "reject" | "needs_review",
  "reasoning": string
}`;

export const FIND_BEST_MATCH_PROMPT = `The current BrickLink mapping for this Rebrickable minifig appears incorrect.

**Rebrickable Minifig**:
- ID: {rbFigId}
- Name: {rbName}

**Available BrickLink Candidates in this set**:
{candidatesList}

**Set Context**: "{setName}"

Which BrickLink minifig is the best match for the Rebrickable entry?

## Response format:
{
  "bestMatchId": string | null,
  "confidence": number (0.0-1.0),
  "reasoning": string
}`;
```

### 3. Image Preparation Utilities

**File**: `scripts/lib/llm-image-utils.ts`

```typescript
import sharp from 'sharp';

/**
 * Download and prepare image for LLM vision analysis
 * Returns base64 encoded image or null on failure
 */
export async function prepareImageForLLM(
  imageUrl: string | null,
  maxSize = 512
): Promise<string | null> {
  if (!imageUrl) return null;

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());

    // Resize and convert to PNG for consistent format
    const processed = await sharp(buffer)
      .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();

    return processed.toString('base64');
  } catch (error) {
    console.error(`Failed to prepare image: ${imageUrl}`, error);
    return null;
  }
}

/**
 * Create a side-by-side comparison image for vision analysis
 */
export async function createComparisonImage(
  leftImageUrl: string | null,
  rightImageUrl: string | null,
  size = 256
): Promise<string | null> {
  const leftBase64 = await prepareImageForLLM(leftImageUrl, size);
  const rightBase64 = await prepareImageForLLM(rightImageUrl, size);

  if (!leftBase64 && !rightBase64) return null;

  // If only one image, return it alone
  if (!leftBase64) return rightBase64;
  if (!rightBase64) return leftBase64;

  try {
    const leftBuffer = Buffer.from(leftBase64, 'base64');
    const rightBuffer = Buffer.from(rightBase64, 'base64');

    // Get dimensions
    const leftMeta = await sharp(leftBuffer).metadata();
    const rightMeta = await sharp(rightBuffer).metadata();

    const maxHeight = Math.max(
      leftMeta.height ?? size,
      rightMeta.height ?? size
    );
    const totalWidth =
      (leftMeta.width ?? size) + (rightMeta.width ?? size) + 20; // 20px gap

    // Create side-by-side composite
    const composite = await sharp({
      create: {
        width: totalWidth,
        height: maxHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([
        { input: leftBuffer, left: 0, top: 0 },
        { input: rightBuffer, left: (leftMeta.width ?? size) + 20, top: 0 },
      ])
      .png()
      .toBuffer();

    return composite.toString('base64');
  } catch (error) {
    console.error('Failed to create comparison image', error);
    // Fallback to left image only
    return leftBase64;
  }
}
```

### 4. LLM Analysis Service

**File**: `scripts/lib/llm-minifig-analyzer.ts`

````typescript
import { chat } from '@tanstack/ai';
import { createOllamaAdapter } from './ollama-client';
import { prepareImageForLLM, createComparisonImage } from './llm-image-utils';
import {
  MINIFIG_SYSTEM_PROMPT,
  VISION_ANALYSIS_PROMPT,
  TEXT_ANALYSIS_PROMPT,
  FIND_BEST_MATCH_PROMPT,
} from './llm-prompts';

export type LLMAction = 'approve' | 'reject' | 'remap' | 'needs_review';

export type LLMAnalysisResult = {
  isMatch: boolean;
  confidence: number;
  action: LLMAction;
  reasoning: string;
  suggestedBlId?: string;
  differences?: string[];
  model: string;
  processingTimeMs: number;
};

export type MappingInput = {
  rbFigId: string;
  rbName: string;
  rbImageUrl: string | null;
  rbPartCount: number;
  blMinifigNo: string;
  blName: string;
  blImageUrl: string | null;
  blPartCount: number;
  setNum: string;
  setName: string;
  currentConfidence: number;
};

export type CandidateMinifig = {
  minifigNo: string;
  name: string;
  imageUrl: string | null;
};

/**
 * Analyze a single minifig mapping using LLM
 */
export async function analyzeMapping(
  input: MappingInput,
  useVision = true
): Promise<LLMAnalysisResult> {
  const startTime = Date.now();
  const hasImages = !!(input.rbImageUrl && input.blImageUrl);
  const shouldUseVision = useVision && hasImages;

  const adapter = createOllamaAdapter(shouldUseVision ? 'vision' : 'text');
  const model = shouldUseVision ? 'llava:13b' : 'llama3.2';

  let prompt: string;
  let imageContent: { type: 'image'; image: string } | null = null;

  if (shouldUseVision) {
    // Prepare comparison image
    const comparisonImage = await createComparisonImage(
      input.rbImageUrl,
      input.blImageUrl
    );

    if (comparisonImage) {
      imageContent = {
        type: 'image',
        image: `data:image/png;base64,${comparisonImage}`,
      };
    }

    prompt = VISION_ANALYSIS_PROMPT.replace('{rbFigId}', input.rbFigId)
      .replace('{rbName}', input.rbName)
      .replace('{blMinifigNo}', input.blMinifigNo)
      .replace('{blName}', input.blName)
      .replace('{setName}', input.setName);
  } else {
    prompt = TEXT_ANALYSIS_PROMPT.replace('{rbFigId}', input.rbFigId)
      .replace('{rbName}', input.rbName)
      .replace('{rbPartCount}', String(input.rbPartCount))
      .replace('{blMinifigNo}', input.blMinifigNo)
      .replace('{blName}', input.blName)
      .replace('{blPartCount}', String(input.blPartCount))
      .replace('{setName}', input.setName)
      .replace('{setNum}', input.setNum)
      .replace('{currentConfidence}', input.currentConfidence.toFixed(2));
  }

  const messages: Array<{ role: 'system' | 'user'; content: any }> = [
    { role: 'system', content: MINIFIG_SYSTEM_PROMPT },
  ];

  if (imageContent) {
    messages.push({
      role: 'user',
      content: [{ type: 'text', text: prompt }, imageContent],
    });
  } else {
    messages.push({ role: 'user', content: prompt });
  }

  try {
    const result = await chat({
      adapter,
      model,
      messages,
      temperature: 0.3, // Lower temperature for more consistent analysis
    });

    // Parse JSON response from LLM
    const responseText = result.choices[0]?.message?.content ?? '';
    const parsed = parseJSONResponse(responseText);

    return {
      isMatch: parsed.isMatch ?? false,
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0)),
      action: parsed.action ?? 'needs_review',
      reasoning: parsed.reasoning ?? responseText,
      differences: parsed.differences,
      model,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error('LLM analysis failed:', error);
    return {
      isMatch: false,
      confidence: 0,
      action: 'needs_review',
      reasoning: `LLM analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      model,
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Find the best BrickLink match from candidates
 */
export async function findBestMatch(
  rbFigId: string,
  rbName: string,
  rbImageUrl: string | null,
  candidates: CandidateMinifig[],
  setName: string
): Promise<{
  bestMatchId: string | null;
  confidence: number;
  reasoning: string;
}> {
  if (candidates.length === 0) {
    return {
      bestMatchId: null,
      confidence: 0,
      reasoning: 'No candidates available',
    };
  }

  if (candidates.length === 1) {
    return {
      bestMatchId: candidates[0].minifigNo,
      confidence: 0.9,
      reasoning: 'Only one candidate available',
    };
  }

  const adapter = createOllamaAdapter('text');

  const candidatesList = candidates
    .map((c, i) => `${i + 1}. ${c.minifigNo}: "${c.name}"`)
    .join('\n');

  const prompt = FIND_BEST_MATCH_PROMPT.replace('{rbFigId}', rbFigId)
    .replace('{rbName}', rbName)
    .replace('{candidatesList}', candidatesList)
    .replace('{setName}', setName);

  try {
    const result = await chat({
      adapter,
      model: 'llama3.2',
      messages: [
        { role: 'system', content: MINIFIG_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    });

    const responseText = result.choices[0]?.message?.content ?? '';
    const parsed = parseJSONResponse(responseText);

    return {
      bestMatchId: parsed.bestMatchId ?? null,
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0)),
      reasoning: parsed.reasoning ?? responseText,
    };
  } catch (error) {
    return {
      bestMatchId: null,
      confidence: 0,
      reasoning: `Failed to find best match: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Parse JSON from LLM response (handles markdown code blocks)
 */
function parseJSONResponse(text: string): Record<string, any> {
  // Try to extract JSON from markdown code block
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    // Try to find JSON object in the text
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        return {};
      }
    }
    return {};
  }
}
````

### 5. Batch Processing Script

**File**: `scripts/llm-review-minifigs.ts`

```typescript
#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { checkOllamaHealth, listOllamaModels } from './lib/ollama-client';
import {
  analyzeMapping,
  findBestMatch,
  MappingInput,
  CandidateMinifig,
} from './lib/llm-minifig-analyzer';

// Configuration
const CONFIG = {
  CONFIDENCE_THRESHOLD: parseFloat(
    process.env.LLM_CONFIDENCE_THRESHOLD ?? '0.7'
  ),
  BATCH_SIZE: parseInt(process.env.LLM_BATCH_SIZE ?? '50'),
  MAX_MAPPINGS: parseInt(process.env.LLM_MAX_MAPPINGS ?? '500'),
  USE_VISION: process.env.LLM_USE_VISION !== 'false',
  DRY_RUN: process.env.LLM_DRY_RUN === 'true',
  DELAY_BETWEEN_MS: parseInt(process.env.LLM_DELAY_MS ?? '1000'),
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function main() {
  console.log('='.repeat(60));
  console.log('LLM Minifig Review Pipeline');
  console.log('='.repeat(60));
  console.log('Configuration:', CONFIG);
  console.log('');

  // Check Ollama health
  console.log('Checking Ollama connection...');
  const healthy = await checkOllamaHealth();
  if (!healthy) {
    console.error('ERROR: Cannot connect to Ollama. Is it running?');
    console.error('Start Ollama with: ollama serve');
    process.exit(1);
  }

  const models = await listOllamaModels();
  console.log('Available models:', models.join(', '));

  const requiredModel = CONFIG.USE_VISION ? 'llava:13b' : 'llama3.2';
  if (!models.some(m => m.startsWith(requiredModel.split(':')[0]))) {
    console.error(`ERROR: Required model "${requiredModel}" not found.`);
    console.error(`Pull it with: ollama pull ${requiredModel}`);
    process.exit(1);
  }
  console.log('');

  // Connect to Supabase
  const supabase = createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  );

  // Fetch low-confidence mappings
  console.log(
    `Fetching mappings with confidence < ${CONFIG.CONFIDENCE_THRESHOLD}...`
  );

  const { data: mappings, error: fetchError } = await supabase
    .from('bricklink_minifig_mappings')
    .select(
      `
      rb_fig_id,
      bl_item_id,
      confidence,
      source,
      manually_approved,
      llm_processed_at
    `
    )
    .lt('confidence', CONFIG.CONFIDENCE_THRESHOLD)
    .is('llm_processed_at', null)
    .is('manually_approved', false)
    .order('confidence', { ascending: true })
    .limit(CONFIG.MAX_MAPPINGS);

  if (fetchError) {
    console.error('Failed to fetch mappings:', fetchError.message);
    process.exit(1);
  }

  console.log(`Found ${mappings?.length ?? 0} mappings to process`);
  if (!mappings || mappings.length === 0) {
    console.log('No mappings to process. Exiting.');
    return;
  }

  // Process statistics
  const stats = {
    processed: 0,
    approved: 0,
    rejected: 0,
    remapped: 0,
    needsReview: 0,
    errors: 0,
    totalTimeMs: 0,
  };

  // Process in batches
  for (let i = 0; i < mappings.length; i += CONFIG.BATCH_SIZE) {
    const batch = mappings.slice(i, i + CONFIG.BATCH_SIZE);
    console.log(
      `\nProcessing batch ${Math.floor(i / CONFIG.BATCH_SIZE) + 1}/${Math.ceil(mappings.length / CONFIG.BATCH_SIZE)}`
    );

    for (const mapping of batch) {
      try {
        // Fetch additional data for this mapping
        const input = await fetchMappingInput(supabase, mapping);
        if (!input) {
          console.log(`  [SKIP] ${mapping.rb_fig_id} - Missing data`);
          continue;
        }

        console.log(
          `  [${stats.processed + 1}/${mappings.length}] ${input.rbFigId} → ${input.blMinifigNo}`
        );
        console.log(`    RB: "${input.rbName}"`);
        console.log(`    BL: "${input.blName}"`);
        console.log(
          `    Current confidence: ${input.currentConfidence.toFixed(2)}`
        );

        // Analyze with LLM
        const result = await analyzeMapping(input, CONFIG.USE_VISION);
        stats.totalTimeMs += result.processingTimeMs;

        console.log(
          `    LLM action: ${result.action} (${(result.confidence * 100).toFixed(0)}%)`
        );
        console.log(`    Reasoning: ${result.reasoning.substring(0, 100)}...`);

        // Handle remap action - find best match
        let suggestedBlId: string | null = null;
        if (
          result.action === 'reject' ||
          (result.action === 'needs_review' && !result.isMatch)
        ) {
          const candidates = await fetchSetMinifigCandidates(
            supabase,
            input.setNum,
            input.blMinifigNo
          );
          if (candidates.length > 0) {
            const bestMatch = await findBestMatch(
              input.rbFigId,
              input.rbName,
              input.rbImageUrl,
              candidates,
              input.setName
            );
            if (bestMatch.bestMatchId && bestMatch.confidence > 0.5) {
              suggestedBlId = bestMatch.bestMatchId;
              result.action = 'remap';
              result.reasoning += ` Suggested remap to ${bestMatch.bestMatchId}: ${bestMatch.reasoning}`;
              console.log(`    Suggested remap: ${bestMatch.bestMatchId}`);
            }
          }
        }

        // Update database
        if (!CONFIG.DRY_RUN) {
          const { error: updateError } = await supabase
            .from('bricklink_minifig_mappings')
            .update({
              llm_suggestion: suggestedBlId
                ? { suggested_bl_id: suggestedBlId }
                : null,
              llm_confidence: result.confidence,
              llm_action: result.action,
              llm_reasoning: result.reasoning,
              llm_model: result.model,
              llm_processed_at: new Date().toISOString(),
            })
            .eq('rb_fig_id', mapping.rb_fig_id);

          if (updateError) {
            console.error(`    ERROR updating: ${updateError.message}`);
            stats.errors++;
          }
        } else {
          console.log('    [DRY RUN] Would update database');
        }

        // Update stats
        stats.processed++;
        switch (result.action) {
          case 'approve':
            stats.approved++;
            break;
          case 'reject':
            stats.rejected++;
            break;
          case 'remap':
            stats.remapped++;
            break;
          case 'needs_review':
            stats.needsReview++;
            break;
        }

        // Rate limiting delay
        if (CONFIG.DELAY_BETWEEN_MS > 0) {
          await new Promise(resolve =>
            setTimeout(resolve, CONFIG.DELAY_BETWEEN_MS)
          );
        }
      } catch (error) {
        console.error(`  [ERROR] ${mapping.rb_fig_id}:`, error);
        stats.errors++;
      }
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Processing Complete');
  console.log('='.repeat(60));
  console.log(`Total processed: ${stats.processed}`);
  console.log(`  - Approved: ${stats.approved}`);
  console.log(`  - Rejected: ${stats.rejected}`);
  console.log(`  - Remapped: ${stats.remapped}`);
  console.log(`  - Needs review: ${stats.needsReview}`);
  console.log(`  - Errors: ${stats.errors}`);
  console.log(
    `Average time per mapping: ${(stats.totalTimeMs / stats.processed / 1000).toFixed(1)}s`
  );
  console.log(
    `Total time: ${(stats.totalTimeMs / 1000 / 60).toFixed(1)} minutes`
  );
}

async function fetchMappingInput(
  supabase: ReturnType<typeof createClient<Database>>,
  mapping: { rb_fig_id: string; bl_item_id: string; confidence: number | null }
): Promise<MappingInput | null> {
  // Fetch RB minifig details
  const { data: rbMinifig } = await supabase
    .from('rb_minifigs')
    .select('name, num_parts')
    .eq('fig_num', mapping.rb_fig_id)
    .single();

  // Fetch RB minifig image
  const { data: rbImage } = await supabase
    .from('rb_minifig_images')
    .select('image_url')
    .eq('fig_num', mapping.rb_fig_id)
    .single();

  // Fetch BL minifig details from bl_set_minifigs (includes set context)
  const { data: blMinifig } = await supabase
    .from('bl_set_minifigs')
    .select('name, image_url, quantity, set_num')
    .eq('minifig_no', mapping.bl_item_id)
    .eq('rb_fig_id', mapping.rb_fig_id)
    .single();

  if (!rbMinifig || !blMinifig) {
    return null;
  }

  // Fetch set name
  const { data: setData } = await supabase
    .from('rb_sets')
    .select('name')
    .eq('set_num', blMinifig.set_num)
    .single();

  return {
    rbFigId: mapping.rb_fig_id,
    rbName: rbMinifig.name,
    rbImageUrl: rbImage?.image_url ?? null,
    rbPartCount: rbMinifig.num_parts ?? 0,
    blMinifigNo: mapping.bl_item_id,
    blName: blMinifig.name ?? mapping.bl_item_id,
    blImageUrl: blMinifig.image_url,
    blPartCount: blMinifig.quantity ?? 0,
    setNum: blMinifig.set_num,
    setName: setData?.name ?? blMinifig.set_num,
    currentConfidence: mapping.confidence ?? 0,
  };
}

async function fetchSetMinifigCandidates(
  supabase: ReturnType<typeof createClient<Database>>,
  setNum: string,
  excludeMinifigNo: string
): Promise<CandidateMinifig[]> {
  const { data } = await supabase
    .from('bl_set_minifigs')
    .select('minifig_no, name, image_url')
    .eq('set_num', setNum)
    .neq('minifig_no', excludeMinifigNo);

  return (data ?? []).map(m => ({
    minifigNo: m.minifig_no,
    name: m.name ?? m.minifig_no,
    imageUrl: m.image_url,
  }));
}

main().catch(console.error);
```

### 6. NPM Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "llm:review-minifigs": "npx tsx scripts/llm-review-minifigs.ts",
    "llm:review-minifigs:dry": "LLM_DRY_RUN=true npm run llm:review-minifigs",
    "llm:review-minifigs:text-only": "LLM_USE_VISION=false npm run llm:review-minifigs"
  }
}
```

## Usage

### Prerequisites

1. **Ollama running** on a machine with GPU:

   ```bash
   ollama serve
   ```

2. **Required models pulled**:

   ```bash
   ollama pull llava:13b    # Vision model (primary)
   ollama pull llama3.2     # Text fallback
   ```

3. **Environment variables** (if Ollama is on a different machine):
   ```bash
   export OLLAMA_URL=http://192.168.1.100:11434
   ```

### Running the Pipeline

```bash
# Dry run (no database changes)
npm run llm:review-minifigs:dry

# Full run with vision analysis
npm run llm:review-minifigs

# Text-only analysis (faster, no GPU required)
npm run llm:review-minifigs:text-only

# Custom configuration
LLM_CONFIDENCE_THRESHOLD=0.5 LLM_MAX_MAPPINGS=100 npm run llm:review-minifigs
```

### Configuration Options

| Environment Variable       | Default                  | Description                            |
| -------------------------- | ------------------------ | -------------------------------------- |
| `OLLAMA_URL`               | `http://localhost:11434` | Ollama server URL                      |
| `LLM_CONFIDENCE_THRESHOLD` | `0.7`                    | Process mappings below this confidence |
| `LLM_BATCH_SIZE`           | `50`                     | Mappings per batch                     |
| `LLM_MAX_MAPPINGS`         | `500`                    | Maximum mappings to process per run    |
| `LLM_USE_VISION`           | `true`                   | Use vision model for image analysis    |
| `LLM_DRY_RUN`              | `false`                  | Don't write to database                |
| `LLM_DELAY_MS`             | `1000`                   | Delay between mappings (ms)            |

## Review Workflow

After running the pipeline:

1. **Auto-approved mappings** (`llm_action = 'approve'`):
   - High confidence from LLM
   - Can be bulk-approved in the review UI

2. **Remapped suggestions** (`llm_action = 'remap'`):
   - LLM found a better match
   - Review `llm_suggestion` field for the suggested BL ID
   - One-click apply in review UI

3. **Needs review** (`llm_action = 'needs_review'`):
   - LLM is uncertain
   - Read `llm_reasoning` for context
   - Manual decision required

4. **Rejected** (`llm_action = 'reject'`):
   - LLM thinks mapping is wrong, no good alternative
   - May need manual BrickLink search

### Review UI Enhancements (Future)

Add to `MinifigReviewClient.tsx`:

```typescript
// Show LLM suggestions in the review interface
{mapping.llm_action && (
  <div className={`text-xs mt-2 p-2 rounded ${
    mapping.llm_action === 'approve' ? 'bg-green-100' :
    mapping.llm_action === 'remap' ? 'bg-blue-100' :
    mapping.llm_action === 'reject' ? 'bg-red-100' :
    'bg-yellow-100'
  }`}>
    <span className="font-bold">LLM: {mapping.llm_action}</span>
    {mapping.llm_suggestion?.suggested_bl_id && (
      <span> → {mapping.llm_suggestion.suggested_bl_id}</span>
    )}
    <div className="text-gray-600 mt-1">{mapping.llm_reasoning}</div>
  </div>
)}
```

## Performance Expectations

With RTX 3090 and LLaVA 13B:

| Mode                  | Time per Mapping | Throughput |
| --------------------- | ---------------- | ---------- |
| Vision (LLaVA 13B)    | ~10-15s          | ~4-6/min   |
| Text-only (Llama 3.2) | ~2-3s            | ~20-30/min |

**For ~50% of minifigs below 0.5 threshold**:

- If you have 10,000 minifig mappings → ~5,000 to process
- Vision mode: ~14-21 hours
- Text-only: ~3-4 hours

**Recommendation**: Run text-only first to get quick wins, then run vision on remaining uncertain mappings.

## Future Enhancements

1. **Parallel Processing**: Run multiple Ollama instances for throughput
2. **Progressive Refinement**: Start with text, escalate to vision for uncertain cases
3. **Active Learning**: Use approved/rejected decisions to improve prompts
4. **Caching**: Cache LLM responses for identical image comparisons
5. **Confidence Calibration**: Adjust LLM confidence based on historical accuracy

## Troubleshooting

### Ollama Connection Issues

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Check GPU utilization
nvidia-smi

# Restart Ollama
systemctl restart ollama  # or: ollama serve
```

### Model Not Found

```bash
# List available models
ollama list

# Pull required model
ollama pull llava:13b
```

### Out of Memory

```bash
# Use smaller model
ollama pull llava:7b

# Or use text-only mode
LLM_USE_VISION=false npm run llm:review-minifigs
```

### Slow Performance

1. Reduce `LLM_BATCH_SIZE` to prevent memory pressure
2. Increase `LLM_DELAY_MS` to let GPU cool down
3. Use text-only mode for initial pass
