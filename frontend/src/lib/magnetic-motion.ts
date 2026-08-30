export type MagneticPoint = {
  x: number;
  y: number;
};

export type MagneticBounds = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type MagneticMotionOptions = {
  maxX: number;
  maxY: number;
  radius: number;
  strengthX?: number;
  strengthY?: number;
};

const DEFAULT_STRENGTH_X = 0.18;
const DEFAULT_STRENGTH_Y = 0.16;
const PULL_EASING = 1.7;

export function calculateMagneticOffset(
  bounds: MagneticBounds,
  pointer: MagneticPoint,
  options: MagneticMotionOptions,
): MagneticPoint {
  if (bounds.width === 0 || bounds.height === 0) {
    return { x: 0, y: 0 };
  }

  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const deltaX = pointer.x - centerX;
  const deltaY = pointer.y - centerY;
  const distance = Math.hypot(deltaX, deltaY);
  const pull = Math.max(0, 1 - distance / options.radius) ** PULL_EASING;

  return {
    x: clamp(deltaX * (options.strengthX ?? DEFAULT_STRENGTH_X) * pull, -options.maxX, options.maxX),
    y: clamp(deltaY * (options.strengthY ?? DEFAULT_STRENGTH_Y) * pull, -options.maxY, options.maxY),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
