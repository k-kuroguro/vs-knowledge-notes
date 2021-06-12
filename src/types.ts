export const DisplayMode = {
   View: true,
   Edit: false
} as const;
export type DisplayMode = typeof DisplayMode[keyof typeof DisplayMode];
