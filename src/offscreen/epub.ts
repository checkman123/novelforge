import JSZip from "jszip";
import type { JobRecord } from "@/core/model/types";
import type { StoredChapterContent } from "@/core/storage/db";

export interface CoverImage {
  bytes: Uint8Array;
  mimeType: string;
}

const COVER_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function chapterFile(index: number): string {
  return `chapter-${index}.xhtml`;
}

function chapterXhtml(title: string, bodyHtml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(title)}</title></head>
<body>
<h1>${escapeXml(title)}</h1>
${bodyHtml}
</body>
</html>
`;
}

function placeholderXhtml(ref: JobRecord["chapters"][number]["ref"], error: string | undefined): string {
  return chapterXhtml(
    ref.title,
    `<p><em>This chapter could not be downloaded${error ? `: ${escapeXml(error)}` : "."}</em></p>`,
  );
}

/**
 * Builds a standard EPUB 3 in memory from a job's metadata and its
 * downloaded chapter content. Pure: no IndexedDB/network/chrome.* access —
 * the caller (offscreen/main.ts) reads storage and fetches the cover first.
 */
export function buildEpub(
  job: JobRecord,
  chapterContent: StoredChapterContent[],
  cover?: CoverImage,
): JSZip {
  const contentByIndex = new Map(chapterContent.map((c) => [c.index, c]));
  const included = job.chapters.filter((c) => c.status !== "skipped");

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
  );

  const manifestItems: string[] = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
  ];
  const spineItems: string[] = [];
  const navPoints: string[] = [];

  for (const chapter of included) {
    const index = chapter.ref.index;
    const id = `chap-${index}`;
    const file = chapterFile(index);
    const stored = contentByIndex.get(index);
    const title = stored?.title ?? chapter.ref.title;
    const xhtml =
      chapter.status === "done" && stored
        ? chapterXhtml(stored.title, stored.bodyHtml)
        : placeholderXhtml(chapter.ref, chapter.error);

    zip.file(`OEBPS/chapters/${file}`, xhtml);
    manifestItems.push(`<item id="${id}" href="chapters/${file}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${id}"/>`);
    navPoints.push(`<li><a href="chapters/${file}">${escapeXml(title)}</a></li>`);
  }

  if (cover) {
    const ext = COVER_EXTENSIONS[cover.mimeType] ?? "jpg";
    zip.file(`OEBPS/images/cover.${ext}`, cover.bytes);
    manifestItems.push(
      `<item id="cover-image" href="images/cover.${ext}" media-type="${cover.mimeType}" properties="cover-image"/>`,
    );
  }

  const modified = new Date(job.updatedAt).toISOString().replace(/\.\d+Z$/, "Z");

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:novelforge:${escapeXml(job.novel.id)}</dc:identifier>
    <dc:title>${escapeXml(job.metadata.title)}</dc:title>
    <dc:language>${escapeXml(job.metadata.language)}</dc:language>
    <dc:creator>${escapeXml(job.metadata.author)}</dc:creator>
    ${job.metadata.description ? `<dc:description>${escapeXml(job.metadata.description)}</dc:description>` : ""}
    <meta property="dcterms:modified">${modified}</meta>
    ${cover ? `<meta name="cover" content="cover-image"/>` : ""}
  </metadata>
  <manifest>
    ${manifestItems.join("\n    ")}
  </manifest>
  <spine>
    ${spineItems.join("\n    ")}
  </spine>
</package>
`,
  );

  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title></head>
<body>
<nav epub:type="toc" id="toc">
<h1>Table of Contents</h1>
<ol>
${navPoints.join("\n")}
</ol>
</nav>
</body>
</html>
`,
  );

  return zip;
}
