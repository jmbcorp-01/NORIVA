export function artifactHref(a: { seriesId: string; episodeNumber?: number | null }) {
  return a.episodeNumber ? `/studio/series/${a.seriesId}/episodes/${a.episodeNumber}` : `/studio/series/${a.seriesId}`;
}
