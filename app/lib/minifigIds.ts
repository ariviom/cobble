type MinifigIdInput = {
  bricklinkId?: string | null | undefined;
  rebrickableId?: string | null | undefined;
};

type MinifigDisplay = {
  displayId: string;
  label: string;
  isBricklink: boolean;
};

/**
 * Prefer BrickLink IDs for display; fall back to the Rebrickable fig-num.
 * - When BL exists: label as "Part #<id>"
 * - When only RB exists: label as "Rebrickable ID: <id>"
 */
export function formatMinifigId({
  bricklinkId,
  rebrickableId,
}: MinifigIdInput): MinifigDisplay {
  const bl = bricklinkId?.trim();
  if (bl) {
    return {
      displayId: bl,
      label: `Part #${bl}`,
      isBricklink: true,
    };
  }

  const rb = rebrickableId?.trim() ?? '';
  return {
    displayId: rb,
    label: `Rebrickable ID: ${rb || '—'}`,
    isBricklink: false,
  };
}

/**
 * Decide which ID to embed in URLs. Prefer BrickLink when present,
 * otherwise keep the Rebrickable fig-num.
 */
export function pickMinifigRouteId(
  bricklinkId?: string | null,
  rebrickableId?: string | null
): string {
  const bl = bricklinkId?.trim();
  if (bl) return bl;
  return rebrickableId?.trim() ?? '';
}

export function getMinifigDisplayIds(params: {
  bricklinkId?: string | null;
  rebrickableId: string;
}): {
  displayLabel: string;
  routeId: string;
  bricklinkId: string | null;
  rebrickableId: string;
} {
  const bricklinkId =
    params.bricklinkId && params.bricklinkId.trim()
      ? params.bricklinkId.trim()
      : undefined;
  const rebrickableId = params.rebrickableId.trim();

  const routeId = pickMinifigRouteId(bricklinkId, rebrickableId);
  const idDisplay = formatMinifigId({
    bricklinkId,
    rebrickableId,
  });

  return {
    displayLabel: idDisplay.label,
    routeId,
    bricklinkId: bricklinkId ?? null,
    rebrickableId,
  };
}


