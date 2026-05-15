import type { IconName } from "./icon-types";
export function label(icon: IconName): string {
  switch (icon) {
    case "Triangle":
      return "tri";
    default:
      return "";
  }
}
