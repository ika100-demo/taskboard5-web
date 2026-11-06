import { TITLE_REQUIRED, TITLE_TOO_LONG } from "./messages";

export type TitleError = typeof TITLE_REQUIRED | typeof TITLE_TOO_LONG;

export function validateTitle(title: string): TitleError | null {
  if (title.trim() === "") return TITLE_REQUIRED;
  if ([...title].length > 200) return TITLE_TOO_LONG;
  return null;
}
