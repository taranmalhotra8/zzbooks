#!/usr/bin/env bun
/**
 * Dashboard Page Generator.
 *
 * Generates a premium ZopNight-branded dashboard with:
 *   - Index page: ebook card grid with search, filter, quick actions
 *   - Detail pages: per-ebook view with chapters, PDF download, articles, social previews
 *
 * Scans _output/ for pre-generated assets (PDF, blog, social, HTML).
 *
 * Output:
 *   _output/dashboard/index.html
 *   _output/dashboard/styles.css
 *   _output/dashboard/detail/{slug}/index.html
 *
 * Usage:
 *   bun run _dashboard/generate.ts
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from "fs";
import { join, dirname, basename } from "path";
import { parse } from "yaml";
import Mustache from "mustache";
import { loadMergedBrand, buildCssVars } from "../scripts/brand-utils.js";
import { loadEbookContent } from "../scripts/content-utils.js";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..");

// ── Types ──────────────────────────────────────────────────────────────────

interface DashboardCard {
  slug: string;
  title: string;
  subtitle: string;
  topic: string;
  audience: string;
  chapter_count: number;
  tags: string;        // comma-separated for data attribute
  tag_list: Array<{ name: string }>;
  status: string;
  status_ready: boolean;
  status_draft: boolean;
  status_progress: boolean;
  detail_url: string;
  html_url?: string;
  pdf_url?: string;
  blog_url?: string;
  social_url?: string;
  landing_url?: string;
  has_html: boolean;
  has_pdf: boolean;
  has_blog: boolean;
  has_social: boolean;
  has_landing: boolean;
  card_gradient: string;
  card_icon: string;
}

interface ChapterItem {
  number: number;
  id: string;
  title: string;
  summary: string;
  difficulty: string;
  reading_time: number;
  is_beginner: boolean;
  is_intermediate: boolean;
  is_advanced: boolean;
  html_url?: string;
  blog_url?: string;
  reader_url?: string;
  has_html: boolean;
  has_blog: boolean;
  has_reader: boolean;
}

interface SocialAsset {
  filename: string;
  url: string;
  label: string;
}

interface EbookDetail {
  slug: string;
  title: string;
  subtitle: string;
  topic: string;
  audience: string;
  status: string;
  chapter_count: number;
  total_reading_time: number;
  tag_list: Array<{ name: string }>;
  chapters: ChapterItem[];
  has_chapters: boolean;

  // Asset URLs
  html_url?: string;
  pdf_url?: string;
  landing_url?: string;
  has_html: boolean;
  has_pdf: boolean;
  has_landing: boolean;

  // Blog posts
  blog_posts: Array<{ title: string; url: string; slug: string }>;
  has_blog_posts: boolean;
  blog_index_url?: string;

  // Social assets
  linkedin_slides: SocialAsset[];
  instagram_posts: SocialAsset[];
  og_images: SocialAsset[];
  has_linkedin: boolean;
  has_instagram: boolean;
  has_og: boolean;
  has_social: boolean;
  carousel_pdf_url?: string;
  has_carousel_pdf: boolean;

  // Brand
  css_vars: Array<{ name: string; value: string }>;
  company_name: string;
  year: number;
  dashboard_url: string;
}

// ── Gradient Palette ──────────────────────────────────────────────────────

const GRADIENTS = [
  "linear-gradient(135deg, #0891b2 0%, #164e63 100%)",
  "linear-gradient(135deg, #0e7490 0%, #155e75 100%)",
  "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)",
  "linear-gradient(135deg, #0891b2 0%, #0f766e 100%)",
  "linear-gradient(135deg, #14b8a6 0%, #0891b2 100%)",
  "linear-gradient(135deg, #0284c7 0%, #0891b2 100%)",
  "linear-gradient(135deg, #0891b2 0%, #6366f1 100%)",
  "linear-gradient(135deg, #0891b2 0%, #059669 100%)",
];

const CARD_ICONS = ["📘", "📗", "📕", "📙", "📓", "📔", "📒", "📚"];

const BLOG_GRADIENTS = [
  "linear-gradient(135deg, #6366f1 0%, #0891b2 100%)",
  "linear-gradient(135deg, #7c3aed 0%, #0891b2 100%)",
  "linear-gradient(135deg, #059669 0%, #0891b2 100%)",
  "linear-gradient(135deg, #dc2626 0%, #0891b2 100%)",
  "linear-gradient(135deg, #d97706 0%, #0e7490 100%)",
  "linear-gradient(135deg, #0891b2 0%, #6366f1 100%)",
  "linear-gradient(135deg, #0f766e 0%, #7c3aed 100%)",
  "linear-gradient(135deg, #1d4ed8 0%, #0891b2 100%)",
];
const BLOG_ICONS = ["📝", "✍️", "🔖", "📰", "🗞️", "📄", "💡", "🖊️"];

function hashSlug(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = ((hash << 5) - hash + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ── Asset Discovery ───────────────────────────────────────────────────────

function findPdf(slug: string): string | undefined {
  const outputBookDir = join(PROJECT_ROOT, "_output", "books", slug);
  if (!existsSync(outputBookDir)) return undefined;

  try {
    const files = readdirSync(outputBookDir);
    const pdf = files.find(f => f.endsWith(".pdf"));
    if (pdf) return `../books/${slug}/${pdf}`;
  } catch { /* ignore */ }

  return undefined;
}

function findHtml(slug: string): string | undefined {
  // Check _output/books/{slug}/index.html
  const outputPath = join(PROJECT_ROOT, "_output", "books", slug, "index.html");
  if (existsSync(outputPath)) return `../books/${slug}/index.html`;

  return undefined;
}

function findBlogPosts(slug: string): Array<{ title: string; url: string; slug: string }> {
  const blogDir = join(PROJECT_ROOT, "_output", "blog", slug);
  if (!existsSync(blogDir)) return [];

  try {
    const files = readdirSync(blogDir)
      .filter(f => f.endsWith(".html") && f !== "index.html" && f !== "styles.css")
      .sort();

    return files.map(f => {
      const fileSlug = basename(f, ".html");
      // Try to extract a human-readable title from the filename
      const title = fileSlug
        .replace(/^\d+-/, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
      return {
        title,
        url: `../../../blog/${slug}/${f}`,
        slug: fileSlug,
      };
    });
  } catch { return []; }
}

function findSocialAssets(slug: string, type: string): SocialAsset[] {
  const dir = join(PROJECT_ROOT, "_output", "social", slug, type);
  if (!existsSync(dir)) return [];

  try {
    return readdirSync(dir)
      .filter(f => f.endsWith(".png"))
      .sort()
      .map(f => ({
        filename: f,
        url: `../../../social/${slug}/${type}/${f}`,
        label: basename(f, ".png").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      }));
  } catch { return []; }
}

function findCarouselPdf(slug: string): string | undefined {
  const path = join(PROJECT_ROOT, "_output", "social", slug, "linkedin", "carousel.pdf");
  return existsSync(path) ? `../../../social/${slug}/linkedin/carousel.pdf` : undefined;
}

function findLanding(slug: string): string | undefined {
  // Single landing page for all ebooks at _output/landing/index.html
  const singlePath = join(PROJECT_ROOT, "_output", "landing", "index.html");
  if (existsSync(singlePath)) return `../landing/index.html`;
  // Fallback: per-ebook landing page
  const perEbookPath = join(PROJECT_ROOT, "_output", "landing", slug, "index.html");
  return existsSync(perEbookPath) ? `../landing/${slug}/index.html` : undefined;
}

// ── Chapter Extraction ────────────────────────────────────────────────────

function extractChapterTitle(content: string): string {
  const fmMatch = content.match(/^---\n[\s\S]*?title:\s*["']?([^"'\n]+)["']?[\s\S]*?---/m);
  if (fmMatch) return fmMatch[1].trim();
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();
  return "Untitled";
}

function estimateReadingTime(content: string): number {
  const words = content.replace(/```[\s\S]*?```/g, "").split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 250));
}

// ── Ebook Discovery ───────────────────────────────────────────────────────

function discoverEbooks(): DashboardCard[] {
  const booksDir = join(PROJECT_ROOT, "books");
  if (!existsSync(booksDir)) return [];

  const slugs = readdirSync(booksDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();

  const ebooks: DashboardCard[] = [];

  for (const slug of slugs) {
    const topicPath = join(booksDir, slug, "topic.yml");
    if (!existsSync(topicPath)) continue;

    try {
      const topicData = parse(readFileSync(topicPath, "utf-8")) as Record<string, string>;

      // Count chapters
      let chapterCount = parseInt(topicData.chapter_count || "0", 10);
      const chaptersDir = join(booksDir, slug, "chapters");
      if (existsSync(chaptersDir)) {
        const qmdFiles = readdirSync(chaptersDir).filter(f => f.endsWith(".qmd"));
        if (qmdFiles.length > 0) chapterCount = qmdFiles.length;
      }

      // Extract tags
      const tags: string[] = [];
      const outlinePath = join(booksDir, slug, "outline.yml");
      if (existsSync(outlinePath)) {
        const outlineData = parse(readFileSync(outlinePath, "utf-8")) as Record<string, unknown>;
        const outlineTags = (outlineData.suggested_tags as string[]) || [];
        tags.push(...outlineTags.slice(0, 5));
      }
      if (tags.length === 0) {
        const topicWords = (topicData.topic || "").split(/\s+/);
        const keyTerms = topicWords.filter(w => w.length > 3 && !["and", "for", "the", "with"].includes(w.toLowerCase()));
        tags.push(...keyTerms.slice(0, 3));
      }

      // Determine status
      const hasQmd = existsSync(chaptersDir) && readdirSync(chaptersDir).some(f => f.endsWith(".qmd"));
      const status = hasQmd ? "ready" : "draft";

      // Title / subtitle
      let title = topicData.topic || slug;
      let subtitle = "";
      const ebookYmlPath = join(booksDir, slug, "ebook.yml");
      if (existsSync(ebookYmlPath)) {
        try {
          const ebookData = parse(readFileSync(ebookYmlPath, "utf-8")) as Record<string, Record<string, string>>;
          if (ebookData.meta?.title) title = ebookData.meta.title;
          if (ebookData.meta?.subtitle) subtitle = ebookData.meta.subtitle;
        } catch { /* use default */ }
      }
      if (!subtitle && existsSync(outlinePath)) {
        try {
          const outlineData = parse(readFileSync(outlinePath, "utf-8")) as Record<string, string>;
          if (outlineData.title) title = outlineData.title;
        } catch { /* use default */ }
      }

      // Discover assets
      const pdfUrl = findPdf(slug);
      const htmlUrl = findHtml(slug);
      const blogPosts = findBlogPosts(slug);
      const hasSocial = existsSync(join(PROJECT_ROOT, "_output", "social", slug));
      const landingUrl = findLanding(slug);
      const blogIndexUrl = existsSync(join(PROJECT_ROOT, "_output", "blog", slug, "index.html"))
        ? `../blog/${slug}/index.html` : undefined;

      const h = hashSlug(slug);

      ebooks.push({
        slug,
        title,
        subtitle,
        topic: topicData.topic || slug,
        audience: topicData.audience || "Engineering teams",
        chapter_count: chapterCount,
        tags: tags.join(","),
        tag_list: tags.map(t => ({ name: t })),
        status,
        status_ready: status === "ready",
        status_draft: status === "draft",
        status_progress: status === "in-progress",
        detail_url: `detail/${slug}/index.html`,
        html_url: htmlUrl,
        pdf_url: pdfUrl ? `../books/${slug}/${pdfUrl.split("/").pop()}` : undefined,
        blog_url: blogIndexUrl,
        social_url: hasSocial ? `detail/${slug}/index.html#social` : undefined,
        landing_url: landingUrl,
        has_html: !!htmlUrl,
        has_pdf: !!pdfUrl,
        has_blog: blogPosts.length > 0,
        has_social: hasSocial,
        has_landing: !!landingUrl,
        card_gradient: GRADIENTS[h % GRADIENTS.length],
        card_icon: CARD_ICONS[h % CARD_ICONS.length],
      });
    } catch (err) {
      console.warn(`  [dashboard] Warning: could not load metadata for ${slug}: ${(err as Error).message}`);
    }
  }

  return ebooks;
}

// ── Detail Page Data ──────────────────────────────────────────────────────

function buildDetailData(slug: string, card: DashboardCard): EbookDetail {
  const booksDir = join(PROJECT_ROOT, "books");
  const chaptersDir = join(booksDir, slug, "chapters");

  // Load brand for CSS vars
  let cssVars: Array<{ name: string; value: string }> = [];
  let companyName = "Zopdev";
  try {
    const brandConfig = loadMergedBrand(PROJECT_ROOT, slug);
    if (brandConfig) {
      cssVars = buildCssVars(brandConfig);
      companyName = brandConfig?.company?.name || companyName;
    }
  } catch { /* use defaults */ }

  // Load ebook content for enriched chapters
  const ebookContent = loadEbookContent(PROJECT_ROOT, slug);

  // Build chapter list
  const chapters: ChapterItem[] = [];
  let totalReadingTime = 0;
  if (existsSync(chaptersDir)) {
    const files = readdirSync(chaptersDir).filter(f => f.endsWith(".qmd")).sort();
    for (let i = 0; i < files.length; i++) {
      const filePath = join(chaptersDir, files[i]);
      const content = readFileSync(filePath, "utf-8");
      // Skip placeholder/scaffold chapters
      if (content.includes("Placeholder content") || content.includes("TODO: Write chapter")) continue;
      const title = extractChapterTitle(content);
      const readTime = estimateReadingTime(content);
      totalReadingTime += readTime;
      const chapterSlug = basename(files[i], ".qmd");

      // Check for enriched metadata
      const enriched = ebookContent?.chapters?.find(c => c.id === chapterSlug);
      const difficulty = enriched?.difficulty || "intermediate";

      // Check for blog post
      const blogPath = join(PROJECT_ROOT, "_output", "blog", slug, `${chapterSlug}.html`);
      const hasBlog = existsSync(blogPath);

      // Check for HTML chapter
      const htmlChapterPath = join(PROJECT_ROOT, "_output", "books", slug, `chapters/${chapterSlug}.html`);
      const hasHtml = existsSync(htmlChapterPath);

      // Check for reader page (single-page reader with chapter anchors)
      const readerPath = join(PROJECT_ROOT, "_output", "books", slug, "index.html");
      const hasReader = existsSync(readerPath);

      chapters.push({
        number: i + 1,
        id: chapterSlug,
        title,
        summary: enriched?.summary || "",
        difficulty,
        reading_time: readTime,
        is_beginner: difficulty === "beginner",
        is_intermediate: difficulty === "intermediate",
        is_advanced: difficulty === "advanced",
        html_url: hasHtml ? `../../../books/${slug}/chapters/${chapterSlug}.html` : undefined,
        blog_url: hasBlog ? `../../../blog/${slug}/${chapterSlug}.html` : undefined,
        reader_url: hasReader ? `../../../books/${slug}/index.html#chapter-${chapterSlug}` : undefined,
        has_html: hasHtml,
        has_blog: hasBlog,
        has_reader: hasReader,
      });
    }
  }

  // Blog posts
  const blogPosts = findBlogPosts(slug);
  const blogIndexUrl = existsSync(join(PROJECT_ROOT, "_output", "blog", slug, "index.html"))
    ? `../../../blog/${slug}/index.html` : undefined;

  // Social assets
  const linkedinSlides = findSocialAssets(slug, "linkedin");
  const instagramPosts = findSocialAssets(slug, "instagram");
  const ogImages = findSocialAssets(slug, "og");
  const carouselPdfUrl = findCarouselPdf(slug);

  // PDF — findPdf returns path relative to dashboard/, need to adjust for detail/{slug}/
  const pdfUrlFromDash = findPdf(slug);
  const pdfFilename = pdfUrlFromDash ? pdfUrlFromDash.split("/").pop() : undefined;
  const pdfUrlFromDetail = pdfFilename ? `../../../books/${slug}/${pdfFilename}` : undefined;

  // HTML book
  const htmlUrl = findHtml(slug);
  const htmlUrlFromDetail = htmlUrl ? `../../../books/${slug}/index.html` : undefined;

  // Landing
  const landingUrl = findLanding(slug);
  // Single landing page at _output/landing/index.html
  const landingUrlFromDetail = landingUrl ? `../../../landing/index.html` : undefined;

  return {
    slug,
    title: card.title,
    subtitle: card.subtitle,
    topic: card.topic,
    audience: card.audience,
    status: card.status,
    chapter_count: chapters.length || card.chapter_count,
    total_reading_time: totalReadingTime,
    tag_list: card.tag_list,
    chapters,
    has_chapters: chapters.length > 0,

    html_url: htmlUrlFromDetail,
    pdf_url: pdfUrlFromDetail,
    landing_url: landingUrlFromDetail,
    has_html: !!htmlUrlFromDetail,
    has_pdf: !!pdfUrlFromDetail,
    has_landing: !!landingUrlFromDetail,

    blog_posts: blogPosts,
    has_blog_posts: blogPosts.length > 0,
    blog_index_url: blogIndexUrl,

    linkedin_slides: linkedinSlides,
    instagram_posts: instagramPosts,
    og_images: ogImages,
    has_linkedin: linkedinSlides.length > 0,
    has_instagram: instagramPosts.length > 0,
    has_og: ogImages.length > 0,
    has_social: linkedinSlides.length > 0 || instagramPosts.length > 0 || ogImages.length > 0,
    carousel_pdf_url: carouselPdfUrl,
    has_carousel_pdf: !!carouselPdfUrl,

    css_vars: cssVars,
    company_name: companyName,
    year: new Date().getFullYear(),
    dashboard_url: "../../index.html",
    home_url: "../../../index.html",
  };
}

// ── Generation ────────────────────────────────────────────────────────────

function generateDashboard(): void {
  const indexTemplatePath = join(SCRIPT_DIR, "template-index.html");
  const detailTemplatePath = join(SCRIPT_DIR, "template-detail.html");
  const stylesPath = join(SCRIPT_DIR, "styles.css");

  if (!existsSync(indexTemplatePath)) {
    console.error("Dashboard index template not found:", indexTemplatePath);
    process.exit(1);
  }
  if (!existsSync(detailTemplatePath)) {
    console.error("Dashboard detail template not found:", detailTemplatePath);
    process.exit(1);
  }

  const indexTemplate = readFileSync(indexTemplatePath, "utf-8");
  const detailTemplate = readFileSync(detailTemplatePath, "utf-8");
  const ebooks = discoverEbooks();

  if (ebooks.length === 0) {
    console.warn("  [dashboard] No ebooks found. Add ebooks to books/ directory.");
    return;
  }

  // Collect all unique tags
  const allTags = new Set<string>();
  for (const ebook of ebooks) {
    for (const tag of ebook.tag_list) {
      allTags.add(tag.name);
    }
  }

  // Load company name from brand
  let companyName = "Zopdev";
  const brandPath = join(PROJECT_ROOT, "_brand", "_brand-extended.yml");
  if (existsSync(brandPath)) {
    try {
      const brandData = parse(readFileSync(brandPath, "utf-8")) as Record<string, Record<string, string>>;
      companyName = brandData.company?.name || companyName;
    } catch { /* use default */ }
  }

  // ── Aggregate all blog posts across ebooks ─────────────────────────────
  const allBlogPosts: Array<{ title: string; url: string; book_title: string; card_gradient: string; card_icon: string }> = [];
  for (const ebook of ebooks) {
    const posts = findBlogPosts(ebook.slug);
    for (const post of posts) {
      const h = hashSlug(post.slug + ebook.slug);
      allBlogPosts.push({
        title: post.title,
        url: post.url,
        book_title: ebook.title,
        card_gradient: BLOG_GRADIENTS[h % BLOG_GRADIENTS.length],
        card_icon: BLOG_ICONS[h % BLOG_ICONS.length],
      });
    }
  }

  // ── Generate Index Page ────────────────────────────────────────────────

  const indexData = {
    company_name: companyName,
    home_url: "../index.html",
    ebooks,
    ebook_count: ebooks.length,
    tags: [...allTags].sort().map(t => ({ name: t })),
    year: new Date().getFullYear(),
    has_ebooks: ebooks.length > 0,
    all_blog_posts: allBlogPosts,
    all_blog_count: allBlogPosts.length,
  };

  const indexHtml = Mustache.render(indexTemplate, indexData);
  const outDir = join(PROJECT_ROOT, "_output", "dashboard");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), indexHtml);

  if (existsSync(stylesPath)) {
    copyFileSync(stylesPath, join(outDir, "styles.css"));
  }

  const fileSizeKb = Math.round(Buffer.byteLength(indexHtml) / 1024);
  console.log(`  [dashboard] Generated: _output/dashboard/index.html (${fileSizeKb}KB, ${ebooks.length} ebooks)`);

  // ── Generate Detail Pages ──────────────────────────────────────────────

  for (const ebook of ebooks) {
    const detailDir = join(outDir, "detail", ebook.slug);
    mkdirSync(detailDir, { recursive: true });

    const detailData = buildDetailData(ebook.slug, ebook);
    const detailHtml = Mustache.render(detailTemplate, detailData);
    writeFileSync(join(detailDir, "index.html"), detailHtml);

    if (existsSync(stylesPath)) {
      copyFileSync(stylesPath, join(detailDir, "styles.css"));
    }

    console.log(`  [dashboard] Generated: detail/${ebook.slug}/ (${detailData.chapters.length} chapters, pdf:${detailData.has_pdf}, blog:${detailData.has_blog_posts}, social:${detailData.has_social})`);
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────

if (import.meta.main) {
  console.log("Dashboard Generator");
  console.log("===================\n");
  generateDashboard();
  console.log("\nDone.");
}
