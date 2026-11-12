export type TagColor = {
  bg: string;
  text: string;
  border: string;
};

export type StickyItem = {
  container: any;
  textElement?: any;
  text: string;
  tags: string[];
  color: string;
  width: number;
  height: number;
  x: number;
  y: number;
};

export type ClusterGroup = {
  id: string;
  title: string;
  subtitle?: string;
  tag?: string;
  color?: string;
  items: StickyItem[];
};

export type ClusterOptions = {
  columnsPerGroup?: number;
  gapX?: number;
  gapY?: number;
  groupGap?: number;
  createFrames?: boolean;
  startX?: number;
  startY?: number;
};
