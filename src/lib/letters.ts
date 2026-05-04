import fs from "fs";
import path from "path";
import matter from "gray-matter";

const lettersDirectory = path.join(process.cwd(), "src", "content", "letters");

export type LetterEdition = {
  slug: string;
  number: number;
  title: string;
  date: string;
  description?: string;
};

export function getAllLetterEditions(): LetterEdition[] {
  if (!fs.existsSync(lettersDirectory)) return [];
  const files = fs.readdirSync(lettersDirectory).filter((f) => f.endsWith(".md"));
  const editions = files.map((file) => {
    const fullPath = path.join(lettersDirectory, file);
    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data } = matter(fileContents);
    return {
      slug: data.slug || file.replace(/\.md$/, ""),
      number: data.number,
      title: data.title,
      date: data.date,
      description: data.description,
    } as LetterEdition;
  });
  return editions.sort((a, b) => (a.number < b.number ? 1 : -1));
}
