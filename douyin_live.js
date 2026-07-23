// ==UserScript==
// @name         抖音直播页面优化（删除底栏礼物，关闭聊天栏，自动原画）
// @namespace    douyin
// @version      3.7
// @description  延时执行一次：关闭弹幕、礼物、聊天窗口，并开启原画，增加C键开关聊天室，带2分钟自动释放性能的弹窗拦截
// @match        *://live.douyin.com/*
// @grant        none
// @author       175cc
// @license      MIT
// @namespace    https://github.com/175cc/Douyin_Live_page.git
// @downloadURL  https://update.greasyfork.org/scripts/587525/%E6%8A%96%E9%9F%B3%E7%9B%B4%E6%92%AD%E9%A1%B5%E9%9D%A2%E4%BC%98%E5%8C%96%EF%BC%88%E5%88%A0%E9%99%A4%E5%BA%95%E6%A0%8F%E7%A4%BC%E7%89%A9%EF%BC%8C%E5%85%B3%E9%97%AD%E8%81%8A%E5%A4%A9%E6%A0%8F%EF%BC%8C%E8%87%AA%E5%8A%A8%E5%8E%9F%E7%94%BB%EF%BC%89.user.js
// @updateURL    https://update.greasyfork.org/scripts/587525/%E6%8A%96%E9%9F%B3%E7%9B%B4%E6%92%AD%E9%A1%B5%E9%9D%A2%E4%BC%98%E5%8C%96%EF%BC%88%E5%88%A0%E9%99%A4%E5%BA%95%E6%A0%8F%E7%A4%BC%E7%89%A9%EF%BC%8C%E5%85%B3%E9%97%AD%E8%81%8A%E5%A4%A9%E6%A0%8F%EF%BC%8C%E8%87%AA%E5%8A%A8%E5%8E%9F%E7%94%BB%EF%BC%89.meta.js
// ==/UserScript==

(function () {
  "use strict";

  // --- 通用工具函数 ---

  // 延迟函数
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // 轮询等待元素出现
  const waitForElement = async (selector, timeout = 15000) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(400);
    }
    console.warn(`[超时] 未找到元素: ${selector}`);
    return null;
  };

  // 模拟鼠标悬停与移出
  const triggerHover = (el, isHover) => {
    const events = isHover
      ? ["mouseover", "mouseenter"]
      : ["mouseout", "mouseleave"];
    events.forEach((evt) =>
      el.dispatchEvent(new MouseEvent(evt, { bubbles: true })),
    );
  };

  // --- 快捷键功能 (C键 开/关 切换聊天室) ---
  function setupShortcuts() {
    document.addEventListener("keydown", (e) => {
      // 避免输入框打字误触
      if (
        ["INPUT", "TEXTAREA"].includes(e.target.tagName) ||
        e.target.isContentEditable
      ) {
        return;
      }

      // 监听 C 键 (忽略大小写)
      if (e.key.toLowerCase() === "c") {
        const closeBtn = document.querySelector(".chatroom_close");
        // 兼容支持语义化 class .chat_room_fold 与哈希 class .Z6P6fFhc
        const openBtn = document.querySelector(".chat_room_fold, .Z6P6fFhc");

        // 如果关闭按钮存在且处于显示状态 -> 关闭聊天室
        if (closeBtn && closeBtn.offsetParent !== null) {
          closeBtn.click();
          console.log("[快捷键 C] 已关闭聊天室");
        }
        // 否则如果展开按钮存在 -> 重新打开聊天室
        else if (openBtn) {
          openBtn.click();
          console.log("[快捷键 C] 已重新展开聊天室");
        }
        // 保底分支
        else if (closeBtn) {
          closeBtn.click();
          console.log("[快捷键 C] 执行关闭聊天室");
        }
      }
    });
  }

  // --- 安全弹窗与引导处理逻辑 ---
  function setupPopupCleaner() {
    // 1. 通过安全 CSS 隐藏纯气泡提示，避免删除 DOM 节点导致页面卡死
    const hideStyle = document.createElement("style");
    hideStyle.textContent = `
      .dylive-tooltip,
      [class*="guide-tooltip"],
      [class*="guideTooltip"],
      [class*="login-guide-container"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(hideStyle);

    // 2. 监听并自动触发关闭按钮（平滑自动点击关闭）
    const closeSelectors = [
      ".dy-account-close",
      '[class*="login-guide"] [class*="close"]',
      '[class*="pop-close"]',
    ];

    const observer = new MutationObserver(() => {
      closeSelectors.forEach((selector) => {
        const closeBtn = document.querySelector(selector);
        if (closeBtn && closeBtn.offsetParent !== null) {
          closeBtn.click();
          console.log(`[自动拦截] 已安全关闭弹窗: ${selector}`);
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // ⏱️ 方案A：运行 5 分钟（300,000 毫秒）后自动停止监听，彻底释放主线程 CPU 性能
    setTimeout(() => {
      observer.disconnect();
      console.log(
        "[自动拦截] 进房初始阶段完成，已自动断开 DOM 监听器以优化性能。",
      );
    }, 300000);
  }

  // --- 并行执行任务（界面静态组件隐藏） ---

  async function removeUIElements() {
    // 1. 初始化自动关闭聊天室
    waitForElement(".chatroom_close").then((btn) => {
      if (btn) {
        btn.click();
        console.log("[成功] 初始化关闭聊天室");
      }
    });

    // 2. 隐藏底部礼物栏
    waitForElement(
      '[data-e2e="gift-panel"], .YWoVbeaa.NP47LiqA.klDKYUkp',
      30000,
    ).then((bar) => {
      if (bar) {
        bar.style.display = "none";
        console.log("[成功] 隐藏礼物栏");
      }
    });
  }

  // --- 串行执行任务（按顺序执行悬停交互） ---

  async function handleHoverMenus() {
    // 1. 切换画质
    const qualityMenu = await waitForElement('[data-e2e="quality-selector"]');
    if (qualityMenu) {
      triggerHover(qualityMenu, true);
      await sleep(500);
      const options = Array.from(
        qualityMenu.querySelectorAll("li, div, span, p"),
      );
      const target = options.find((el) => el.textContent.trim() === "原画");
      if (target) {
        target.click();
        console.log("[成功] 已选择画质: 原画");
      }
      triggerHover(qualityMenu, false);
      await sleep(500);
    }

    // 2. 关闭礼物特效
    const giftPanel = await waitForElement('[data-e2e="gift-setting"]');
    if (giftPanel) {
      triggerHover(giftPanel, true);
      await sleep(800);

      const effectTarget =
        document.querySelector('[data-e2e="effect-switch"] .Cri3cNdU') ||
        document.querySelector('[data-e2e="effect-switch"] > div');

      if (effectTarget) {
        effectTarget.click();
        console.log("[成功] 屏蔽礼物特效");
      } else {
        console.warn("[失败] 未找到礼物特效开关的内层元素");
      }

      triggerHover(giftPanel, false);
      await sleep(800);
    }

    // 3. 弹幕设置 (送礼信息 + 福袋口令)
    const danmakuTrigger = await waitForElement(
      '[data-e2e="danmaku-setting-icon"]',
    );
    if (danmakuTrigger) {
      triggerHover(danmakuTrigger, true);
      await sleep(800);

      const spans = Array.from(document.querySelectorAll("span"));
      const types = ["送礼信息", "福袋口令"];

      types.forEach((type) => {
        const targetSpan = spans.find(
          (span) => span.textContent.trim() === type,
        );
        if (targetSpan && targetSpan.nextElementSibling) {
          const realSwitch = targetSpan.nextElementSibling.querySelector("div");
          if (realSwitch) {
            realSwitch.click();
            console.log(`[成功] 关闭弹幕选项: ${type}`);
          }
        }
      });

      triggerHover(danmakuTrigger, false);
    }
  }

  // ================== 主执行逻辑 ==================
  async function init() {
    console.log("[抖音直播优化] 脚本开始运行...");

    // 注册键盘切换快捷键
    setupShortcuts();

    // 启用带定时释放功能的安全弹窗/引导拦截机制
    setupPopupCleaner();

    // 并行任务
    removeUIElements();

    // 串行悬停任务
    await handleHoverMenus();

    console.log("[抖音直播优化] 核心逻辑执行完毕。");
  }

  // 启动拦截
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    init();
  } else {
    window.addEventListener("DOMContentLoaded", init);
  }
})();
