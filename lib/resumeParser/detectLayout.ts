import type { TextBlock } from "@/lib/resumeParser/extractText";

export type LayoutType = "single-column" | "two-column";

export type LayoutDetectionResult = {
  layout: LayoutType;
  splitX: number | null;
  leftCenter: number | null;
  rightCenter: number | null;
};

const MIN_BLOCKS_FOR_LAYOUT_DETECTION = 30;
const MIN_CLUSTER_SEPARATION = 120;
const MIN_CLUSTER_RATIO = 0.15;

function kMeans1D(values: number[]): { leftCenter: number; rightCenter: number } {
  let leftCenter = Math.min(...values);
  let rightCenter = Math.max(...values);

  for (let i = 0; i < 8; i += 1) {
    const left: number[] = [];
    const right: number[] = [];

    for (const value of values) {
      if (Math.abs(value - leftCenter) <= Math.abs(value - rightCenter)) {
        left.push(value);
      } else {
        right.push(value);
      }
    }

    if (left.length > 0) {
      leftCenter = left.reduce((sum, value) => sum + value, 0) / left.length;
    }

    if (right.length > 0) {
      rightCenter = right.reduce((sum, value) => sum + value, 0) / right.length;
    }
  }

  if (leftCenter <= rightCenter) {
    return { leftCenter, rightCenter };
  }

  return { leftCenter: rightCenter, rightCenter: leftCenter };
}

export function detectLayout(blocks: TextBlock[]): LayoutDetectionResult {
  if (blocks.length < MIN_BLOCKS_FOR_LAYOUT_DETECTION) {
    return {
      layout: "single-column",
      splitX: null,
      leftCenter: null,
      rightCenter: null
    };
  }

  const xValues = blocks.map((block) => block.x).filter((x) => Number.isFinite(x));

  if (xValues.length < MIN_BLOCKS_FOR_LAYOUT_DETECTION) {
    return {
      layout: "single-column",
      splitX: null,
      leftCenter: null,
      rightCenter: null
    };
  }

  const { leftCenter, rightCenter } = kMeans1D(xValues);
  const splitX = (leftCenter + rightCenter) / 2;

  const leftCount = xValues.filter((x) => x <= splitX).length;
  const rightCount = xValues.filter((x) => x > splitX).length;

  const smallerClusterRatio = Math.min(leftCount, rightCount) / xValues.length;
  const separation = Math.abs(rightCenter - leftCenter);

  if (separation >= MIN_CLUSTER_SEPARATION && smallerClusterRatio >= MIN_CLUSTER_RATIO) {
    return {
      layout: "two-column",
      splitX,
      leftCenter,
      rightCenter
    };
  }

  return {
    layout: "single-column",
    splitX: null,
    leftCenter: null,
    rightCenter: null
  };
}
