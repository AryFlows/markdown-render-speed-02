// Read the case list and render each case's Markdown to HTML.
// Write the rendered results to the output JSON file.
import * as filesystem from "node:fs";
import { parse as renderMarkdownDocument } from "./parse.js";

type MarkdownEntry = { id: unknown; markdown: string };
const markdownEntries = JSON.parse(
  filesystem.readFileSync("/input/cases.json", "utf8")
) as MarkdownEntry[];
if (!Array.isArray(markdownEntries)) {
  throw new Error("Expected the input cases JSON to contain an array.");
}
const renderedDocuments: string[] = [];
for (const markdownEntry of markdownEntries) {
  renderedDocuments.push(renderMarkdownDocument(markdownEntry.markdown));
}

filesystem.mkdirSync("/output", { recursive: true });
filesystem.writeFileSync("/output/html.json", JSON.stringify(renderedDocuments), "utf8");
