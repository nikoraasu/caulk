export type TemplateElement = Record<string, unknown>;

export type BoardTemplate = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  source: "builtin" | "repo";
  elements: TemplateElement[];
};
