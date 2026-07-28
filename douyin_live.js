// ==UserScript==
// @name         抖音直播页面优化（删除底栏礼物，关闭聊天栏，自动原画）
// @namespace    douyin
// @version      3.9.3
// @description  C键开关聊天室，自动原画，关闭弹幕/礼物，2分钟性能释放，防后台标签页卡顿/黑屏
// @match        *://live.douyin.com/*
// @run-at       document-start
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
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // 防抖函数
  const createDebouncer = (func, wait) => {
    let timeout;
    const debounced = function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
    debounced.cancel = () => clearTimeout(timeout);
    return debounced;
  };

  // 轮询等待元素出现
  const waitForElement = async (selector, timeout = 8000) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(400);
    }
    console.warn(`[未找到/超时] 元素: ${selector}`);
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

  // --- 1. 快捷键功能 (仅保留 C 键 开/关 切换聊天室) ---
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
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const closeBtn = document.querySelector(".chatroom_close");
        const openBtn = document.querySelector(".chat_room_fold, .Z6P6fFhc");

        if (closeBtn && closeBtn.offsetParent !== null) {
          closeBtn.click();
          console.log("[快捷键 C] 已关闭聊天室");
        } else if (openBtn) {
          openBtn.click();
          console.log("[快捷键 C] 已重新展开聊天室");
        } else if (closeBtn) {
          closeBtn.click();
          console.log("[快捷键 C] 执行关闭聊天室");
        }
      }
    });
  }

  // --- 2. 切后台防卡顿/黑屏恢复机制 --- 此项待考究 ---
  function setupBackgroundRecovery() {
    document.addEventListener("visibilitychange", () => {
      // 当从其他标签页切回抖音直播时
      if (document.visibilityState === "visible") {
        const video = document.querySelector("video");
        if (video) {
          // 如果视频处于暂停状态且未结束，尝试恢复播放
          if (video.paused && !video.ended) {
            video.play().catch(() => {});
          }
          // 微调画面渲染，唤醒渲染引擎恢复高帧率
          video.style.transform = "translateZ(0)";
          console.log("[流畅保障] 已从后台切回，唤醒视频渲染层");
        }
      }
    });
  }

  // --- 3. 安全弹窗与引导处理逻辑 ---
  function setupPopupCleaner() {
    // 安全注入 CSS 隐藏礼物栏与弹窗
    const injectStyle = () => {
      const hideStyle = document.createElement("style");
      hideStyle.textContent = `
        .dylive-tooltip,
        [class*="guide-tooltip"],
        [class*="guideTooltip"],
        [class*="login-guide-container"],
        .S_kkDiOx,
        [data-e2e="gift-panel"],
        .YWoVbeaa.NP47LiqA.klDKYUkp {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
      `;
      (document.head || document.documentElement).appendChild(hideStyle);
    };

    if (document.head || document.documentElement) {
      injectStyle();
    } else {
      document.addEventListener("DOMContentLoaded", injectStyle);
    }

    const closeSelectors = [
      ".dy-account-close",
      '[class*="login-guide"] [class*="close"]',
      '[class*="pop-close"]',
      ".S_kkDiOx",
    ];

    const cleanPopups = createDebouncer(() => {
      closeSelectors.forEach((selector) => {
        const el = document.querySelector(selector);
        if (el) {
          if (selector === ".S_kkDiOx") {
            el.remove();
          } else if (el.offsetParent !== null) {
            el.click();
          }
        }
      });
    }, 300);

    const observer = new MutationObserver(cleanPopups);

    const startObserver = () => {
      observer.observe(document.body, { childList: true, subtree: true });
    };

    if (document.body) {
      startObserver();
    } else {
      window.addEventListener("DOMContentLoaded", startObserver);
    }

    // 2 分钟后自动断开，释放 CPU
    setTimeout(() => {
      cleanPopups.cancel();
      observer.disconnect();
      console.log("[自动拦截] 观察器已销毁，释放主线程。");
    }, 120000);
  }

  // --- 4. UI 元素清理 ---
  async function removeUIElements() {
    waitForElement(".chatroom_close", 10000).then(async (btn) => {
      if (btn) {
        await sleep(500);
        btn.click();
        console.log("[成功] 初始化关闭聊天室");
      }
    });

    waitForElement(
      '[data-e2e="gift-panel"], .YWoVbeaa.NP47LiqA.klDKYUkp',
      10000,
    ).then((bar) => {
      if (bar) {
        bar.style.display = "none";
        console.log("[成功] 隐藏礼物栏");
      }
    });
  }

  // --- 5. 菜单交互逻辑 (画质/礼物特效/弹幕过滤) ---
  async function handleHoverMenus() {
    // 切换原画
    try {
      const qualityMenu = await waitForElement(
        '[data-e2e="quality-selector"]',
        6000,
      );
      if (qualityMenu) {
        const qualityLabel = document.querySelector('[data-e2e="quality"]');
        const currentQuality = qualityLabel
          ? qualityLabel.textContent.trim()
          : "";

        if (currentQuality !== "原画") {
          triggerHover(qualityMenu, true);
          await sleep(300);

          const options = Array.from(
            qualityMenu.querySelectorAll("li, div, span, p"),
          );
          const target = options.find((el) => el.textContent.includes("原画"));
          if (target) {
            target.click();
            console.log("[成功] 已选择画质: 原画");
          }
          triggerHover(qualityMenu, false);
          await sleep(300);
        }
      }
    } catch (err) {
      console.error("[画质切换异常]:", err);
    }

    // 打开-屏蔽礼物特效
    try {
      const giftPanel = await waitForElement('[data-e2e="gift-setting"]', 6000);
      if (giftPanel) {
        triggerHover(giftPanel, true);
        await sleep(500);

        const effectTarget =
          document.querySelector('[data-e2e="effect-switch"] .Cri3cNdU') ||
          document.querySelector('[data-e2e="effect-switch"] > div');

        if (effectTarget) {
          const isEnabled =
            effectTarget.classList.contains("gDrxzyfK") ||
            effectTarget.parentElement?.classList.contains("SpsbqNUm");
          if (!isEnabled) {
            effectTarget.click();
            console.log("[成功] 已打开屏蔽礼物特效");
          }
        }
        triggerHover(giftPanel, false);
        await sleep(500);
      }
    } catch (err) {
      console.error("[屏蔽礼物设置异常]:", err);
    }

    // 关闭 送礼信息 + 福袋口令
    try {
      const danmakuTrigger = await waitForElement(
        '[data-e2e="danmaku-setting-icon"]',
        6000,
      );
      if (danmakuTrigger) {
        triggerHover(danmakuTrigger, true);
        await sleep(500);

        const spans = Array.from(document.querySelectorAll("span"));
        const types = ["送礼信息", "福袋口令"];

        types.forEach((type) => {
          const targetSpan = spans.find((span) =>
            span.textContent.includes(type),
          );
          if (targetSpan && targetSpan.nextElementSibling) {
            const realSwitch =
              targetSpan.nextElementSibling.querySelector("div");
            if (realSwitch) {
              const isEnabled =
                realSwitch.classList.contains("SpsbqNUm") ||
                realSwitch.classList.contains("gDrxzyfK");
              if (isEnabled) {
                realSwitch.click();
                console.log(`[成功] 关闭弹幕选项: ${type}`);
              }
            }
          }
        });

        triggerHover(danmakuTrigger, false);
      }
    } catch (err) {
      console.error("[弹幕设置异常]:", err);
    }
  }

  // ================== 主执行逻辑 ==================
  async function init() {
    console.log("[抖音直播优化] 脚本开始运行...");

    setupShortcuts();
    setupBackgroundRecovery(); // 启用后台切回恢复
    setupPopupCleaner();
    removeUIElements();

    handleHoverMenus().then(() => {
      console.log("[抖音直播优化] 自动化设置处理完毕。");
    });
  }

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    init();
  } else {
    window.addEventListener("DOMContentLoaded", init);
  }
})();
