export type ExampleMeta = {
  label: string;
  to: string;
  description: string;
};

export const EXAMPLES: readonly ExampleMeta[] = [
  {
    label: "Focus",
    to: "/example/focus",
    description: "Pointer and keyboard focus through the a11y tree",
  },
];
