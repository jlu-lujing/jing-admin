import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import { App } from "./App";

function renderApp() {
  return render(
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>,
  );
}

describe("i18n", () => {
  beforeEach(async () => {
    cleanup();
    await i18n.changeLanguage("zh-CN");
  });

  it("boots with the default locale (zh-CN) and renders translated text", () => {
    renderApp();
    expect(screen.getByRole("heading", { name: "京 后台管理系统" })).toBeTruthy();
    expect(screen.getByText("欢迎回来，管理员")).toBeTruthy();
    expect(screen.getByRole("button", { name: "刷新数据" })).toBeTruthy();
  });

  it("updates all UI copy when the language is switched", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.selectOptions(
      screen.getByLabelText("切换语言"),
      screen.getByRole("option", { name: "English" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Jing Admin Console" }),
    ).toBeTruthy();
    expect(screen.getByText("Welcome back, administrator")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh data" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "简体中文" })).toBeTruthy();
  });

  it("translates strings from every registered namespace", async () => {
    await i18n.changeLanguage("en");
    renderApp();
    expect(i18n.t("common:appTitle")).toBe("Jing Admin Console");
    expect(i18n.t("dashboard:visitors")).toBe("Visitors Today");
  });
});
