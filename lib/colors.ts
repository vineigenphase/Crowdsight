// One hue per crowd model family, used wherever that family appears.
export const MODEL_COLORS = ['#8B7CFF', '#4FA3FF', '#2DD4BF', '#F5B451', '#FF7AB6', '#A3E635'];
export const TAVILY = '#5EEAD4';
export const BRAND = '#8B7CFF';
export const modelColor = (idx: number) => (idx < 0 ? MODEL_COLORS[0] : MODEL_COLORS[idx % MODEL_COLORS.length]);
