export interface MergeCandidate {
  index: number;
  remaining: number;
}

/**
 * Keeps one vehicle's zipper-merge claim stable until that vehicle leaves the
 * approach. Without the retained owner, two lanes can swap priority every
 * frame and both queues may brake forever.
 */
export function selectMergeOwner(currentOwner: number | undefined, candidates: MergeCandidate[]) {
  const approaching = candidates
    .filter((candidate) => candidate.remaining <= 24)
    .sort((a, b) => a.remaining - b.remaining || a.index - b.index);
  if (currentOwner !== undefined && approaching.some((candidate) => candidate.index === currentOwner)) return currentOwner;
  return approaching[0]?.index ?? null;
}
