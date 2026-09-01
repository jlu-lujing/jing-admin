import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./components/LanguageSwitcher";

export function App() {
  const { t } = useTranslation(["common", "dashboard"]);
  const [visitors] = useState(1024);
  const [orders] = useState(87);

  return (
    <div className="app">
      <header>
        <h1>{t("common:appTitle")}</h1>
        <LanguageSwitcher />
      </header>
      <main>
        <h2>{t("dashboard:welcome")}</h2>
        <section>
          <h3>{t("dashboard:statsTitle")}</h3>
          <ul>
            <li>
              {t("dashboard:visitors")}: {visitors}
            </li>
            <li>
              {t("dashboard:orders")}: {orders}
            </li>
          </ul>
          <button type="button">{t("dashboard:refresh")}</button>
        </section>
      </main>
      <footer>{t("common:footer")}</footer>
    </div>
  );
}
