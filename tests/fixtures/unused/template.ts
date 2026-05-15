import type { IconName } from "./icon-types";

type Locale = "En" | "Fr";
export function flag(locale: Locale): IconName {
  const name: `Flag${Locale}` = `Flag${locale}`;
  return name;
}
