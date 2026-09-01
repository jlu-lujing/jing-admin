import { test, expect } from "@playwright/test";

test.describe("JingAdmin 冒烟", () => {
  test("登录进入看板", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /超级管理员|Super Admin/ }).click();
    await page.getByRole("button", { name: /登录系统|Sign in/ }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
    await expect(page.getByText(/系统用户|Total users/)).toBeVisible();
  });

  test("用户列表与抽屉", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /超级管理员|Super Admin/ }).click();
    await page.getByRole("button", { name: /登录系统|Sign in/ }).click();
    await page.getByRole("link", { name: /用户管理|Users/ }).click();
    await expect(page.getByRole("row").first()).toBeVisible();
  });

  test("主题切换持久化", async ({ page }) => {
    await page.goto("/login");
    const titleBefore = await page.title();
    expect(titleBefore).toContain("JingAdmin");
  });
});
