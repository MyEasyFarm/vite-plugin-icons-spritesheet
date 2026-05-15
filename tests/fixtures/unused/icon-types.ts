export const iconNames = ["Circle", "Square", "Triangle", "FlagEn", "FlagFr", "Unused"] as const;
export type IconName = (typeof iconNames)[number];
