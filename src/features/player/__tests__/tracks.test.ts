import { qualityLadder, resolveQualityTrack, type TrackOption } from '../tracks';

function track(index: number, height?: number): TrackOption {
  return { index, height, label: height ? `${height}p` : `Дорожка ${index}` };
}

describe('resolveQualityTrack', () => {
  const ladder = [track(0, 360), track(1, 720), track(2, 1080)];

  it('оставляет автовыбор, когда пользователь его не трогал', () => {
    expect(resolveQualityTrack(ladder, 'auto')).toEqual({ type: 'auto' });
  });

  it('берёт точное совпадение высоты', () => {
    expect(resolveQualityTrack(ladder, 720)).toEqual({ type: 'resolution', value: 720 });
  });

  it('берёт ближайшую дорожку снизу, если точной нет', () => {
    // Платформа отдаёт 1088 вместо 1080 — потолок 1080 не должен выключать поток.
    expect(resolveQualityTrack([track(0, 480), track(1, 1088)], 1080)).toEqual({
      type: 'resolution',
      value: 480,
    });
  });

  it('берёт самую низкую дорожку, если весь манифест выше потолка', () => {
    expect(resolveQualityTrack([track(0, 1440), track(1, 2160)], 480)).toEqual({
      type: 'resolution',
      value: 1440,
    });
  });

  it('возвращается к автовыбору, когда высоты неизвестны', () => {
    expect(resolveQualityTrack([track(0), track(1)], 720)).toEqual({ type: 'auto' });
    expect(resolveQualityTrack([], 720)).toEqual({ type: 'auto' });
  });
});

describe('qualityLadder', () => {
  it('отдаёт уникальные высоты по убыванию', () => {
    expect(qualityLadder([track(0, 360), track(1, 1080), track(2, 360), track(3, 720)])).toEqual([
      1080, 720, 360,
    ]);
  });

  it('пропускает дорожки без высоты', () => {
    expect(qualityLadder([track(0), track(1, 480)])).toEqual([480]);
  });
});
