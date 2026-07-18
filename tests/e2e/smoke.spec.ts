import { expect, test } from "playwright/test"

test("login shell is usable", async ({ page }) => {
  await page.goto("/login")

  await expect(page.getByLabel("E-Mail")).toBeVisible()
  const password = page.getByRole("textbox", { name: "Passwort" })
  await expect(password).toHaveAttribute("type", "password")
  await expect(page.getByRole("button", { name: "Anmelden" })).toBeEnabled()

  await page.getByRole("button", { name: "Passwort anzeigen" }).click()
  await expect(password).toHaveAttribute("type", "text")
})

test("web vital ingestion validates its payload", async ({ request }) => {
  const baseURL = test.info().project.use.baseURL as string
  const sameOriginHeaders = { Origin: baseURL, "Sec-Fetch-Site": "same-origin" }
  const accepted = await request.post("/api/monitoring/web-vitals", {
    headers: sameOriginHeaders,
    data: {
      id: "v5-e2e",
      name: "LCP",
      value: 850,
      delta: 850,
      rating: "good",
      navigationType: "navigate",
      path: "/login",
      timestamp: Date.now(),
    },
  })
  expect(accepted.status()).toBe(204)

  const rejected = await request.post("/api/monitoring/web-vitals", {
    headers: sameOriginHeaders,
    data: { name: "unsupported" },
  })
  expect(rejected.status()).toBe(400)
})
