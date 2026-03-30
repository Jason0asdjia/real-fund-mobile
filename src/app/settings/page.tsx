"use client";

import Image from "next/image";

import { useAppState } from "@/components/app-provider";

const refreshOptions = [
  { label: "15 秒", value: 15000 },
  { label: "30 秒", value: 30000 },
  { label: "60 秒", value: 60000 },
  { label: "120 秒", value: 120000 },
];

export default function SettingsPage() {
  const { state, setRefreshMs, clearAll, seedDemoData } = useAppState();

  return (
    <div className="screen">
      <section className="section-heading">
        <p>Settings</p>
        <h1>基础偏好、PWA 状态和项目结构放在这里。</h1>
      </section>

      <section className="settings-card">
        <div className="settings-card__head">
          <h2>刷新频率</h2>
          <p>为了移动端续航，默认每 60 秒刷新一次。</p>
        </div>
        <div className="chip-row">
          {refreshOptions.map((item) => (
            <button key={item.value} type="button" className={`chip ${state.refreshMs === item.value ? "chip--active" : ""}`} onClick={() => setRefreshMs(item.value)}>
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card__head">
          <h2>PWA</h2>
          <p>项目已经接入 manifest 和 service worker，可作为手机主屏应用安装。</p>
        </div>
        <ul className="feature-list">
          <li>已提供 `standalone` 模式</li>
          <li>已提供基础离线回退页面</li>
          <li>生产环境自动注册 service worker</li>
        </ul>
      </section>

      <section className="settings-card">
        <div className="settings-card__head">
          <h2>项目结构图</h2>
          <p>这里保留了一张原生 SVG 图，方便后续扩展页面和模块。</p>
        </div>
        <Image src="/project-map.svg" alt="项目结构图" width={960} height={640} className="project-map" />
      </section>


      <section className="settings-card">
        <div className="settings-card__head">
          <h2>演示历史数据</h2>
          <p>一键写入基金、持仓、交易流水和 120 天估值轨迹，方便测试日/月/年收益、热力图和详情页走势。</p>
        </div>
        <button type="button" className="primary-button" onClick={() => seedDemoData()}>
          写入演示数据
        </button>
      </section>

      <section className="settings-card">
        <div className="settings-card__head">
          <h2>重置本地数据</h2>
          <p>清空基金列表、持仓和搜索历史，仅影响当前浏览器。</p>
        </div>
        <button type="button" className="danger-button" onClick={() => clearAll()}>
          清空本地数据
        </button>
      </section>
    </div>
  );
}
