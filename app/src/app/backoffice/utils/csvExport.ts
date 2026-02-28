function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*\[([^\]]*)\]\(([^)]*)\)\*\*/g, "$1 ($2)")
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1 ($2)")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\*([^*]*)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-•]\s*/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeCsvField(field: string): string {
  let cleaned = stripMarkdown(field);
  cleaned = cleaned.replace(/\r?\n/g, " ").replace(/\s{2,}/g, " ");
  if (cleaned.includes(",") || cleaned.includes('"') || cleaned.includes(";")) {
    return `"${cleaned.replace(/"/g, '""')}"`;
  }
  return cleaned;
}
