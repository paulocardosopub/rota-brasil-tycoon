export interface ChunkSubscriptionPlan {
  subscribe: string[];
  keep: string[];
  release: string[];
}

export function desiredChunkTopics(currentChunk: string, adjacent: string[]) {
  return [...new Set([currentChunk, ...adjacent])].map((chunkId) => `city:brasilia:chunk:${chunkId}:movement`);
}

export function planChunkHandoff(activeTopics: Iterable<string>, currentChunk: string, adjacent: string[], overlappingTopics: Iterable<string> = []): ChunkSubscriptionPlan {
  const active = new Set(activeTopics);
  const overlap = new Set(overlappingTopics);
  const desired = new Set(desiredChunkTopics(currentChunk, adjacent));
  return {
    subscribe: [...desired].filter((topic) => !active.has(topic)),
    keep: [...active].filter((topic) => desired.has(topic) || overlap.has(topic)),
    release: [...active].filter((topic) => !desired.has(topic) && !overlap.has(topic))
  };
}

export function chunkIdFromTopic(topic: string) {
  const match = /^city:brasilia:chunk:(-?\d+_-?\d+):movement$/.exec(topic);
  return match?.[1] ?? null;
}
