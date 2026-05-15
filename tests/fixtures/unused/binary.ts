import type { IconName } from "./icon-types";
export function isSquare(icon: IconName): boolean {
  if (icon === "Square") {
    return true;
  }
  return false;
}
