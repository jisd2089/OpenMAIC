import { afterEach, describe, expect, it } from 'vitest';
import { useStageStore } from '@/lib/store/stage';

describe('useStageStore.setStage', () => {
  afterEach(() => {
    useStageStore.getState().clearStore();
  });

  it('resets outlines and transient generation state when switching to a new stage', () => {
    useStageStore.getState().setOutlines([
      {
        id: 'outline-1',
        type: 'slide',
        title: '第一页',
        description: '',
        keyPoints: [],
        order: 1,
      },
    ]);
    useStageStore.getState().setGeneratingOutlines([
      {
        id: 'outline-2',
        type: 'slide',
        title: '第二页',
        description: '',
        keyPoints: [],
        order: 2,
      },
    ]);
    useStageStore.setState({
      failedOutlines: [
        {
          id: 'outline-3',
          type: 'slide',
          title: '第三页',
          description: '',
          keyPoints: [],
          order: 3,
        },
      ],
      generationStatus: 'error',
      currentGeneratingOrder: 3,
    });

    useStageStore.getState().setStage({
      id: 'stage-next',
      name: '新课堂',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const state = useStageStore.getState();
    expect(state.outlines).toEqual([]);
    expect(state.generatingOutlines).toEqual([]);
    expect(state.failedOutlines).toEqual([]);
    expect(state.generationStatus).toBe('idle');
    expect(state.currentGeneratingOrder).toBe(-1);
  });
});
