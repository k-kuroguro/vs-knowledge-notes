export const DisplayMode = {
   view: true,
   edit: false
} as const;
export type DisplayMode = typeof DisplayMode[keyof typeof DisplayMode];