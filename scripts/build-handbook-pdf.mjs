// Erzeugt die Betriebsanleitung als PDF auf dem Desktop — aus derselben Quelle
// wie die In-App-Seite (src/lib/handbook.json). Aufruf: node scripts/build-handbook-pdf.mjs
import { readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const hb = JSON.parse(readFileSync(join(root, "src/lib/handbook.json"), "utf8"))
const OUT = join(homedir(), "Desktop", "Browns-Perso-Betriebsanleitung.pdf")

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const toc = hb.sections.map((s) => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join("")

const body = hb.sections.map((s) => `
  <section id="${s.id}">
    <h2>${esc(s.title)}</h2>
    ${s.intro ? `<p class="intro">${esc(s.intro)}</p>` : ""}
    ${s.blocks.map((b) => `
      ${b.heading ? `<h3>${esc(b.heading)}</h3>` : ""}
      ${b.steps ? `<ol>${b.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
      ${b.tips && b.tips.length ? `<div class="tips"><ul>${b.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : ""}
    `).join("")}
  </section>`).join("")

const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; font-size: 12px; line-height: 1.6; }
  .cover { height: 980px; display: flex; flex-direction: column; justify-content: center; padding: 0 60px; background: linear-gradient(160deg,#7c2d12,#9a3412); color: #fff; page-break-after: always; }
  .cover .brand { font-size: 26px; font-weight: 800; letter-spacing: .12em; opacity: .9; }
  .cover h1 { font-size: 44px; font-weight: 800; margin: 18px 0 10px; line-height: 1.1; }
  .cover p { font-size: 16px; opacity: .92; max-width: 460px; }
  .cover .ver { margin-top: 28px; font-size: 13px; opacity: .8; }
  .wrap { padding: 18px 40px 40px; }
  nav.toc { page-break-after: always; }
  nav.toc h2 { font-size: 18px; color:#9a3412; border-bottom: 2px solid #f1d9cd; padding-bottom: 8px; }
  nav.toc ol { columns: 2; column-gap: 40px; padding-left: 18px; }
  nav.toc li { margin: 5px 0; }
  nav.toc a { color: #374151; text-decoration: none; }
  section { page-break-inside: avoid; margin-bottom: 22px; padding-bottom: 14px; border-bottom: 1px solid #f0f0f0; }
  h2 { font-size: 18px; color: #9a3412; margin: 0 0 6px; }
  .intro { color: #6b7280; margin: 0 0 12px; }
  h3 { font-size: 13.5px; color: #111827; margin: 14px 0 6px; }
  ol { margin: 0 0 6px; padding-left: 22px; }
  ol li { margin: 4px 0; }
  .tips { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 12px; margin: 8px 0 4px; }
  .tips ul { margin: 0; padding-left: 18px; }
  .tips li { margin: 3px 0; color: #92400e; font-size: 11.5px; }
  .tips li::marker { content: "💡 "; }
  footer { text-align: center; color: #9ca3af; font-size: 10.5px; margin-top: 24px; }
</style></head><body>
  <div class="cover">
    <div class="brand">BROWN'S</div>
    <h1>${esc(hb.title.replace("Browns Perso — ", ""))}</h1>
    <p>${esc(hb.subtitle)}</p>
    <div class="ver">Version ${esc(hb.version)} · Personalplanung für Browns Coffee Lounge</div>
    ${hb.developer ? `<div class="ver" style="margin-top:8px">${esc(hb.developer)}</div>` : ""}
  </div>
  <div class="wrap">
    <nav class="toc"><h2>Inhalt</h2><ol>${toc}</ol></nav>
    ${body}
    <footer>Browns Perso · Version ${esc(hb.version)}${hb.developer ? " · " + esc(hb.developer) : ""}</footer>
  </div>
</body></html>`

writeFileSync("/tmp/browns-handbook.html", html)

const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage()
await page.setContent(html, { waitUntil: "load" })
await page.pdf({
  path: OUT,
  format: "A4",
  printBackground: true,
  margin: { top: "0", bottom: "0", left: "0", right: "0" },
})
await browser.close()
console.log("PDF erstellt:", OUT)
