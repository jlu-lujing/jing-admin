import { useState } from "react";

export function App() {
  const [visitors] = useState(1024);
  const [orders] = useState(87);

  return (
    <div className="app">
      <header>
        <h1>京 后台管理系统</h1>
      </header>
      <main>
        <h2>欢迎回来，管理员</h2>
        <section>
          <h3>今日数据概览</h3>
          <ul>
            <li>今日访客: {visitors}</li>
            <li>今日订单: {orders}</li>
          </ul>
          <button type="button">刷新数据</button>
        </section>
      </main>
      <footer>© 2026 Jing Admin</footer>
    </div>
  );
}
