import { z } from 'zod';

const backupSetSchema = z.object({
  setNumber: z.string().min(1),
  status: z.string().default('owned'),
  hasInstructions: z.boolean().optional(),
  hasBox: z.boolean().optional(),
});

const backupOwnedPartSchema = z.object({
  setNumber: z.string().min(1),
  inventoryKey: z.string().min(1),
  quantity: z.number().int().min(0),
});

const backupLoosePartSchema = z.object({
  partNum: z.string().min(1),
  colorId: z.number().int().min(0),
  quantity: z.number().int().min(1),
});

const backupListItemSchema = z.object({
  itemType: z.union([z.literal('set'), z.literal('minifig')]),
  itemId: z.string().min(1),
});

const backupListSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  items: z.array(backupListItemSchema),
});

const backupMinifigSchema = z.object({
  figNum: z.string().min(1),
  status: z.string().default('owned'),
});

const backupDataSchema = z.object({
  sets: z.array(backupSetSchema),
  ownedParts: z.array(backupOwnedPartSchema),
  looseParts: z.array(backupLoosePartSchema),
  lists: z.array(backupListSchema),
  minifigs: z.array(backupMinifigSchema),
});

const backupPreferencesSchema = z
  .object({
    theme: z.string().optional(),
    themeColor: z.string().optional(),
    pricing: z
      .object({
        currencyCode: z.string().optional(),
        countryCode: z.string().nullable().optional(),
      })
      .optional(),
    minifigSync: z
      .object({
        syncOwnedFromSets: z.boolean().optional(),
        syncScope: z
          .union([z.literal('collection'), z.literal('owned')])
          .optional(),
      })
      .optional(),
    inventoryDefaults: z.record(z.unknown()).optional(),
  })
  .optional();

const SUPPORTED_VERSIONS = [1];

const backupSchema = z.object({
  version: z.number().int(),
  exportedAt: z.string().optional(),
  app: z.literal('brick-party'),
  data: backupDataSchema,
  preferences: backupPreferencesSchema,
});

export type BrickPartyBackup = z.infer<typeof backupSchema>;

export type BrickPartyParseResult =
  | { success: true; data: BrickPartyBackup }
  | { success: false; error: string };

export function parseBrickPartyBackup(content: string): BrickPartyParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { success: false, error: 'Invalid JSON' };
  }

  if (typeof parsed === 'object' && parsed !== null && 'version' in parsed) {
    const version = (parsed as { version: unknown }).version;
    if (typeof version === 'number' && !SUPPORTED_VERSIONS.includes(version)) {
      return {
        success: false,
        error: `Unsupported backup version ${version}. Supported: ${SUPPORTED_VERSIONS.join(', ')}`,
      };
    }
  }

  const result = backupSchema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return {
      success: false,
      error: `Invalid backup: ${firstIssue?.path.join('.')} — ${firstIssue?.message}`,
    };
  }

  return { success: true, data: result.data };
}
