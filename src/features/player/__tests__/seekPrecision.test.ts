import { precisionAt } from '../Seekbar';

describe('precisionAt', () => {
  it('у самой полосы перематывает один к одному', () => {
    expect(precisionAt(0)).toBe(1);
    expect(precisionAt(40)).toBe(1);
  });

  it('замедляется ступенями по мере отвода пальца', () => {
    expect(precisionAt(60)).toBe(0.5);
    expect(precisionAt(130)).toBe(0.2);
    expect(precisionAt(400)).toBe(0.1);
  });

  it('работает одинаково вверх и вниз', () => {
    // Полоса прижата к низу кадра, поэтому в полноэкранном режиме палец
    // уходит вверх, а в обычном — вниз; жест обязан работать в обе стороны.
    expect(precisionAt(-130)).toBe(precisionAt(130));
    expect(precisionAt(-400)).toBe(precisionAt(400));
  });
});
