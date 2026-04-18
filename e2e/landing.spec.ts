import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("renders hero section with CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Voice-First")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Start AI Consult/i })
    ).toBeVisible();
  });

  test("features section is visible and scrollable", async ({ page }) => {
    await page.goto("/");
    const featuresSection = page.locator("#features");
    await expect(featuresSection).toBeVisible();
    await expect(page.getByText("Streamlined Clinical Documentation")).toBeVisible();
  });

  test("role selection section is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Select Your Role")).toBeVisible();
    await expect(page.getByText("Caretaker")).toBeVisible();
    await expect(page.getByText("Doctor")).toBeVisible();
  });

  test("waitlist form accepts email submission", async ({ page }) => {
    await page.goto("/");
    const waitlistSection = page.getByText("Get Early Access");
    await expect(waitlistSection).toBeVisible();

    const emailInput = page.locator('input[placeholder="you@facility.com"]').last();
    await emailInput.fill("test-e2e@example.com");

    const joinButton = page.getByRole("button", { name: "Join Waitlist" });
    await expect(joinButton).toBeVisible();
  });

  test("consult modal opens and shows demo", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Start AI Consult/i }).click();

    await expect(page.getByText("AI Consultation")).toBeVisible();
    await expect(page.getByText("Voice Recording")).toBeVisible();
    await expect(page.getByText("Generated Documentation")).toBeVisible();
  });

  test("footer links navigate to public pages", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Privacy Policy" }).click();
    await expect(page).toHaveURL(/\/privacy/);
    await expect(page.getByText("Privacy Policy")).toBeVisible();

    await page.goBack();

    await page.getByRole("link", { name: "Terms of Service" }).click();
    await expect(page).toHaveURL(/\/terms/);

    await page.goBack();

    await page.getByRole("link", { name: "HIPAA Compliance" }).click();
    await expect(page).toHaveURL(/\/hipaa/);

    await page.goBack();

    await page.getByRole("link", { name: "Support" }).click();
    await expect(page).toHaveURL(/\/support/);
  });

  test("sign in link navigates to login", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Sign In" }).first().click();
    await expect(page).toHaveURL(/\/login/);
  });
});
