// ==UserScript==
// @name         抖音直播页面优化（删除底栏礼物，关闭聊天栏，自动原画）
// @namespace    douyin
// @version      3.9.5
// @description  快捷键:1.C键开关聊天室;2.空格键:暂停/播放;3.Enter:左下聊天框.功能:自动原画,关闭部分弹幕/礼物……
// @match        *://live.douyin.com/*
// @run-at       document-start
// @grant        none
// @author       175cc
// @license      MIT
// @namespace    https://github.com/175cc/Douyin_Live_page.git
// ==/UserScript==

(function () {
  "use strict";

  // 彩色输出配置
  const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
  };
  const cc = (color, ...args) =>
    console.log(colors[color] + args.join(" ") + colors.reset);

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
    cc("red", `[未找到/超时] 元素: ${selector}`);
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

  // 唤醒底栏并在指定延时后释放悬停 (防黑框与隐藏冲突)
  const wakeUpAndRelease = (targetEl, delayMs = 500, onFocused) => {
    if (!targetEl) return;

    const rect = targetEl.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
    };

    // 1. 触发进入 (Hover in)
    targetEl.dispatchEvent(new PointerEvent("pointerenter", opts));
    targetEl.dispatchEvent(new PointerEvent("pointerover", opts));
    targetEl.dispatchEvent(new PointerEvent("pointermove", opts));
    targetEl.dispatchEvent(new MouseEvent("mouseenter", opts));
    targetEl.dispatchEvent(new MouseEvent("mouseover", opts));

    // 2. 延时：等待底栏完全滑出动画完成后聚焦输入框
    setTimeout(() => {
      if (typeof onFocused === "function") {
        onFocused();
      }

      // 3. 触发离开 (Hover out) - 释放悬停状态，还给底栏原生隐藏计时器
      targetEl.dispatchEvent(new PointerEvent("pointerout", opts));
      targetEl.dispatchEvent(new PointerEvent("pointerleave", opts));
      targetEl.dispatchEvent(new MouseEvent("mouseout", opts));
      targetEl.dispatchEvent(new MouseEvent("mouseleave", opts));
    }, delayMs);
  };

  // --- 1. 快捷键功能 (C键 开/关 聊天室，空格键 控制播放/暂停，Enter 唤醒输入框) ---
  function setupShortcuts() {
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const textarea = document.querySelector("textarea.sj0L4UzZ");
        const activeEl = document.activeElement;

        // ------------------ Enter 键处理逻辑 ------------------
        if (e.key === "Enter") {
          const isFocused = textarea && activeEl === textarea;

          // 未聚焦输入框：触发 Enter 唤醒机制
          if (!isFocused) {
            // 如果焦点在其他 INPUT 或 ContentEditable 上，不强行夺取
            if (
              ["INPUT", "TEXTAREA"].includes(activeEl.tagName) ||
              activeEl.isContentEditable
            ) {
              return;
            }

            if (!textarea) return;

            e.preventDefault();
            e.stopPropagation();

            // 精准抓取播放按钮节点进行 Hover 唤醒
            const playIcon =
              document.querySelector(
                ".douyin-player-icon.douyin-player-play",
              ) || document.querySelector(".douyin-player-play");

            if (playIcon) {
              wakeUpAndRelease(playIcon, 500, () => {
                textarea.focus();
                cc("green", "[快捷键 Enter] ✨ 底栏展开完成，已聚焦输入框");
              });
            } else {
              // 降级直接 focus
              textarea.focus();
            }
            return;
          }

          // 已聚焦输入框：内容为空按 Enter 移出焦点，有内容放行原生发送
          if (isFocused) {
            const text = textarea.value.trim();
            if (text === "") {
              e.preventDefault();
              e.stopPropagation();
              textarea.blur();
              cc("blue", "[快捷键 Enter] 无内容 -> 移出光标");
            }
            return;
          }
        }

        // 避免输入框打字误触其他快捷键 (C键、空格键)
        if (
          ["INPUT", "TEXTAREA"].includes(activeEl.tagName) ||
          activeEl.isContentEditable
        ) {
          return;
        }

        // ------------------ 空格键：控制播放/暂停 ------------------
        if (e.key === " " || e.code === "Space") {
          e.preventDefault();
          e.stopPropagation();

          const btnContainer =
            document.querySelector('.douyin-player-icon[data-index="0"]') ||
            document.querySelector(
              ".douyin-player-controls-left > div:first-child",
            );

          if (btnContainer) {
            btnContainer.click();
          }

          const playerContainer = document.querySelector(".douyin-player");
          const video = document.querySelector("video");

          if (video) {
            const isPaused = playerContainer
              ? playerContainer.classList.contains("douyin-player-pause")
              : video.paused;

            if (isPaused) {
              video.play().catch(() => {});
              cc("green", "[快捷键 空格] 切换为 -> 播放");
            } else {
              video.pause();
              cc("yellow", "[快捷键 空格] 切换为 -> 暂停");
            }
          }

          return;
        }

        // ------------------ C 键：开/关 聊天室 ------------------
        if (e.key.toLowerCase() === "c") {
          const closeBtn = document.querySelector(".chatroom_close");
          const openBtn = document.querySelector(".chat_room_fold, .Z6P6fFhc");

          if (closeBtn && closeBtn.offsetParent !== null) {
            closeBtn.click();
            cc("green", "[快捷键 C] 已关闭聊天室");
          } else if (openBtn) {
            openBtn.click();
            cc("green", "[快捷键 C] 已重新展开聊天室");
          } else if (closeBtn) {
            closeBtn.click();
            cc("blue", "[快捷键 C] 执行关闭聊天室");
          }
        }
      },
      true,
    );
  }

  // --- 2. 切后台防卡顿/黑屏恢复机制 ---
  function setupBackgroundRecovery() {
    let wasPlayingBeforeHidden = false;

    // 检查并点击“继续播放”挂机弹窗的通用函数
    const checkAndResumeModal = () => {
      // 可以在小延时后检查，确保 DOM 已完全渲染
      setTimeout(() => {
        // 方法1：通过特定类名匹配
        let resumeBtn =
          document.querySelector(".elw1KV8O .JL05k7eS.OG51D9OO.NzyTD8Fa") ||
          document.querySelector(".JL05k7eS.OG51D9OO.NzyTD8Fa") ||
          document.querySelector(".elw1KV8O div");

        // 方法2：如果没通过类名精确找到，则遍历元素文本内容匹配“继续播放”
        if (!resumeBtn) {
          const allDivs = document.querySelectorAll(
            ".tp31AxZe div, .tPjpbR8_ div, .EiGv3P09 div, .elw1KV8O div, div",
          );
          for (const div of allDivs) {
            if (
              div.textContent &&
              div.textContent.trim() === "继续播放" &&
              div.offsetParent !== null
            ) {
              resumeBtn = div;
              break;
            }
          }
        }

        if (resumeBtn && resumeBtn.offsetParent !== null) {
          resumeBtn.click();
          cc("green", "[流畅保障] 检测到挂机暂停弹窗，已自动点击“继续播放”");
        }
      }, 600);
    };

    document.addEventListener("visibilitychange", () => {
      const video = document.querySelector("video");
      if (!video) return;

      if (document.visibilityState === "hidden") {
        wasPlayingBeforeHidden = !video.paused && !video.ended;
        return;
      }

      if (document.visibilityState === "visible") {
        if (wasPlayingBeforeHidden && video.paused && !video.ended) {
          video.play().catch(() => {});
          cc("blue", "[流畅保障] 仅在前台隐藏前为播放状态时恢复播放");
        }
        video.style.transform = "translateZ(0)";
        cc("cyan", "[流畅保障] 已从后台切回，唤醒视频渲染层");

        // 切回前台时检测并处理挂机暂停弹窗
        checkAndResumeModal();
      }
    });
  }
  // --- 3. 安全弹窗与引导处理逻辑 ---
  function setupPopupCleaner() {
    // 注入全局防闪烁样式
    const injectStyle = () => {
      if (document.getElementById("dylive-opt-style")) return true;
      const targetNode = document.head || document.documentElement;
      if (targetNode) {
        const hideStyle = document.createElement("style");
        hideStyle.id = "dylive-opt-style";
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
        targetNode.appendChild(hideStyle);
        return true;
      }
      return false;
    };

    // 在 document-start 模式下极速捕获 DOM 并插入 CSS，防止无样式内容闪烁 (FOUC)
    if (!injectStyle()) {
      const earlyObserver = new MutationObserver(() => {
        if (injectStyle()) earlyObserver.disconnect();
      });
      earlyObserver.observe(document, { childList: true, subtree: true });
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

    setTimeout(() => {
      cleanPopups.cancel();
      observer.disconnect();
      cc("yellow", "[自动拦截] 观察器已销毁，释放主线程。");
    }, 120000);
  }

  // --- 4. UI 元素清理 ---
  async function removeUIElements() {
    waitForElement(".chatroom_close", 10000).then(async (btn) => {
      if (btn) {
        await sleep(500);
        btn.click();
        cc("green", "[成功] 初始化关闭聊天室");
      }
    });

    waitForElement(
      '[data-e2e="gift-panel"], .YWoVbeaa.NP47LiqA.klDKYUkp',
      10000,
    ).then((bar) => {
      if (bar) {
        bar.style.display = "none";
        cc("green", "[成功] 隐藏礼物栏");
      }
    });
  }

  // --- 5. 菜单交互逻辑 (画质/礼物特效/弹幕过滤) ---
  async function handleHoverMenus() {
    // 强制切换为纯“原画”
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
          await sleep(400);

          const options = Array.from(
            qualityMenu.querySelectorAll("div, li, span, p"),
          );
          const target = options.find((el) => el.textContent.trim() === "原画");

          if (target) {
            target.click();
            cc(
              "green",
              "[成功] 已从 [" + currentQuality + "] 强行选择为: 原画",
            );
          }
          triggerHover(qualityMenu, false);
          await sleep(300);
        }
      }
    } catch (err) {
      cc("red", "[画质切换异常]:", err);
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
            cc("green", "[成功] 已打开屏蔽礼物特效");
          }
        }
        triggerHover(giftPanel, false);
        await sleep(500);
      }
    } catch (err) {
      cc("red", "[屏蔽礼物设置异常]:", err);
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
                cc("green", `[成功] 关闭弹幕选项: ${type}`);
              }
            }
          }
        });

        triggerHover(danmakuTrigger, false);
      }
    } catch (err) {
      cc("red", "[弹幕设置异常]:", err);
    }
  }

  // ================== 主执行逻辑 ==================
  async function init() {
    cc("cyan", "[抖音直播优化] 脚本开始运行...");

    setupShortcuts();
    setupBackgroundRecovery();
    setupPopupCleaner();
    removeUIElements();

    handleHoverMenus().then(() => {
      cc("green", "[抖音直播优化] 自动化设置处理完毕。");
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
