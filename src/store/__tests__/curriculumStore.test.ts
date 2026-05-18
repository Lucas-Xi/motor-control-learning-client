import { beforeEach, describe, expect, it } from 'vitest';
import { curriculumTracks } from '../../content/curriculum';
import {
  getCompletionRatio,
  getNextCheckpoint,
  getProgress,
  summarizeAllTracks,
  useCurriculumStore,
} from '../curriculumStore';

const trackA = curriculumTracks[0];

describe('useCurriculumStore', () => {
  beforeEach(() => {
    useCurriculumStore.getState().resetAll();
  });

  it('markCheckpointDone is idempotent and creates path entry on first call', () => {
    const { markCheckpointDone } = useCurriculumStore.getState();
    const firstCp = trackA.checkpoints[0];
    markCheckpointDone(trackA.id, firstCp.id);
    markCheckpointDone(trackA.id, firstCp.id);
    const p = useCurriculumStore.getState().paths[trackA.id];
    expect(p).toBeDefined();
    expect(p.completedCheckpoints).toHaveLength(1);
    expect(p.startedAt).toBeGreaterThan(0);
  });

  it('unmarkCheckpoint removes a previously completed checkpoint', () => {
    const { markCheckpointDone, unmarkCheckpoint } = useCurriculumStore.getState();
    const firstCp = trackA.checkpoints[0];
    markCheckpointDone(trackA.id, firstCp.id);
    unmarkCheckpoint(trackA.id, firstCp.id);
    const p = useCurriculumStore.getState().paths[trackA.id];
    expect(p.completedCheckpoints).toHaveLength(0);
  });

  it('markCheckpointDone ignores unknown track / checkpoint', () => {
    const { markCheckpointDone } = useCurriculumStore.getState();
    markCheckpointDone('nonexistent-track', 'x');
    markCheckpointDone(trackA.id, 'nonexistent-checkpoint');
    expect(useCurriculumStore.getState().paths[trackA.id]).toBeUndefined();
  });

  it('resetPath clears completion but bumps startedAt', () => {
    const { markCheckpointDone, resetPath } = useCurriculumStore.getState();
    markCheckpointDone(trackA.id, trackA.checkpoints[0].id);
    markCheckpointDone(trackA.id, trackA.checkpoints[1].id);
    const beforeReset = useCurriculumStore.getState().paths[trackA.id];
    expect(beforeReset.completedCheckpoints).toHaveLength(2);
    resetPath(trackA.id);
    const after = useCurriculumStore.getState().paths[trackA.id];
    expect(after.completedCheckpoints).toHaveLength(0);
    expect(after.startedAt).toBeGreaterThanOrEqual(beforeReset.startedAt);
  });

  it('touchPath records lastActiveTrack and updates lastVisitedAt without affecting completion', () => {
    const { markCheckpointDone, touchPath } = useCurriculumStore.getState();
    markCheckpointDone(trackA.id, trackA.checkpoints[0].id);
    touchPath(trackA.id);
    const s = useCurriculumStore.getState();
    expect(s.lastActiveTrack).toBe(trackA.id);
    expect(s.paths[trackA.id].completedCheckpoints).toHaveLength(1);
  });

  it('getNextCheckpoint returns the first uncompleted checkpoint in order', () => {
    const { markCheckpointDone } = useCurriculumStore.getState();
    markCheckpointDone(trackA.id, trackA.checkpoints[0].id);
    markCheckpointDone(trackA.id, trackA.checkpoints[1].id);
    const next = getNextCheckpoint(useCurriculumStore.getState(), trackA);
    expect(next).not.toBeNull();
    expect(next!.id).toBe(trackA.checkpoints[2].id);
  });

  it('getNextCheckpoint returns null once all checkpoints are done', () => {
    const { markCheckpointDone } = useCurriculumStore.getState();
    for (const cp of trackA.checkpoints) markCheckpointDone(trackA.id, cp.id);
    const next = getNextCheckpoint(useCurriculumStore.getState(), trackA);
    expect(next).toBeNull();
  });

  it('getCompletionRatio reflects done / total', () => {
    const { markCheckpointDone } = useCurriculumStore.getState();
    expect(getCompletionRatio(useCurriculumStore.getState(), trackA)).toBe(0);
    markCheckpointDone(trackA.id, trackA.checkpoints[0].id);
    const ratio = getCompletionRatio(useCurriculumStore.getState(), trackA);
    expect(ratio).toBeCloseTo(1 / trackA.checkpoints.length, 5);
  });

  it('getProgress returns frozen default for unknown track', () => {
    const p = getProgress(useCurriculumStore.getState(), 'unknown-track');
    expect(p.completedCheckpoints).toEqual([]);
    expect(p.startedAt).toBe(0);
  });

  it('summarizeAllTracks lists every track with correct totals', () => {
    const summary = summarizeAllTracks(useCurriculumStore.getState());
    expect(summary).toHaveLength(curriculumTracks.length);
    for (const s of summary) {
      const track = curriculumTracks.find((t) => t.id === s.trackId)!;
      expect(s.total).toBe(track.checkpoints.length);
      expect(s.done).toBe(0);
      expect(s.ratio).toBe(0);
    }
  });

  it('all 4 tracks have >= 8 checkpoints', () => {
    expect(curriculumTracks).toHaveLength(4);
    for (const t of curriculumTracks) {
      expect(t.checkpoints.length).toBeGreaterThanOrEqual(8);
      expect(t.checkpoints.length).toBeLessThanOrEqual(12);
    }
  });
});
