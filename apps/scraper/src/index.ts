import puppeteer, { Page } from "puppeteer";
import path from "path";
import fs from "fs/promises";

const config = {
  initialUrl: "https://docs.crustdata.com/docs/intro/",
  outDir: "./docs",
  rateLimit: 2000,
  userAgent: "DocsScraper/1.0 (Research Purpose)",
};

async function ensureDir(dirPath: string) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error: any) {
    if (error.code !== "EEXIST") throw error;
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function scrapeDocPage(page: Page) {
  return await page.evaluate(() => {
    // Docusaurus specific selectors
    const article = document.querySelector("article");
    if (!article) return null;

    const content = article.innerHTML;
    const title = document.querySelector("h1")?.textContent || "";

    const metadata = {
      title,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      breadcrumbs: Array.from(
        document.querySelectorAll("nav.breadcrumbs li"),
      ).map((item) => item.textContent),
    };

    return { content, metadata };
  });
}

async function getAllDocLinks(page: Page) {
  return await page.evaluate(() => {
    const links: HTMLAnchorElement[] = Array.from(document.querySelectorAll("a.menu__link"));
    return links
      .map((link) => ({
        url: link.href,
        text: link.textContent?.trim(),
      }))
      .filter((link) => link.url && !link.url.includes("#"));
  });
}

async function main() {
  try {
    await ensureDir(config.outDir);

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.setUserAgent(config.userAgent);

    await page.goto(config.initialUrl, { waitUntil: "networkidle0" });
    console.log("Started scraping from:", config.initialUrl);

    const links = await getAllDocLinks(page);
    console.log(`Found ${links.length} documentation pages`);

    for (const [index, link] of links.entries()) {
      try {
        console.log(`Scraping ${index + 1}/${links.length}: ${link.text}`);

        await page.goto(link.url, { waitUntil: "networkidle0" });
        const data = await scrapeDocPage(page);

        if (data) {
          const filename = link.text
            ?.toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

          const filePath = path.join(config.outDir, `${filename}.json`);
          await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        }

        await delay(config.rateLimit);
      } catch (error: any) {
        console.error(`Error scraping ${link.url}:`, error.message);
      }
    }

    await browser.close();
    console.log("Scraping completed!");
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
