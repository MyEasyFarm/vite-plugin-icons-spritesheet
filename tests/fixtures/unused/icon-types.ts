export const iconNames = ["Circle", "Square", "Triangle", "FlagEn", "FlagFr", "Hexagon", "Unused"] as const;
export type IconName = (typeof iconNames)[number];
