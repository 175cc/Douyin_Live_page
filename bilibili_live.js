// ==UserScript==
// @name         bilibili直播默认最高画质与快捷键增强
// @description  直播最高画质，并支持快捷键-H全屏/Y网页全屏/C右侧聊天室-控制
// @namespace    https://github.com/175cc
// @version      2.4.1
// @author       175cc
// @match        *://live.bilibili.com/*
// @exclude      *://live.bilibili.com/p/*
// @icon         https://www.bilibili.com/favicon.ico
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // ==================== 1. 自动切换最高画质模块 ====================
  function processQuality() {
    try {
      const livePlayer = document.querySelector("#live-player");
      if (!livePlayer) return;

      livePlayer.dispatchEvent(new Event("mousemove"));
      const qualityWrap = livePlayer.querySelector(".quality-wrap");
      if (!qualityWrap) return;

      const observer = new MutationObserver((mutations) => {
        mutations.some((mutation) => {
          try {
            const qualities = mutation.target.querySelectorAll(".list-it");
            if (qualities.length) {
              qualities[0].click();
              // 延时派发 mouseleave，防止菜单过早收起导致点击失效
              setTimeout(() => {
                livePlayer.dispatchEvent(new Event("mouseleave"));
              }, 300);
              return true;
            }
            return false;
          } catch (e) {
            console.error("[画质切换错误]:", e);
            return false;
          } finally {
            observer.disconnect();
          }
        });
      });

      observer.observe(qualityWrap, { childList: true, subtree: true });
      qualityWrap.dispatchEvent(new Event("mouseenter"));
    } catch (e) {
      console.error("[画质模块初始化错误]:", e);
    }
  }

  function initQualityModule() {
    // 监听 DOM 变化以捕获视频加载（兼容切房/首进）
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (
            node.nodeName === "VIDEO" ||
            (node.nodeType === 1 && node.querySelector("video"))
          ) {
            window.setTimeout(processQuality, 800);
          }
        });
      });
    });
    observer.observe(document, { childList: true, subtree: true });

    // 同时针对当前页面已经存在的视频尝试执行一次
    if (document.querySelector("video")) {
      setTimeout(processQuality, 1000);
    }
  }

  // ==================== 2. H/Y/C 快捷键与控制模块 ====================
  function initShortcutModule() {
    const keyMap = { h: 0, y: 1 }; // H 触发 Index 0，Y 触发 Index 1

    window.addEventListener(
      "keydown",
      (e) => {
        const key = e.key ? e.key.toLowerCase() : "";
        if (key !== "h" && key !== "y" && key !== "c") return;

        // 过滤输入框，避免打字时误触发
        const active = document.activeElement;
        if (
          active &&
          (active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            active.isContentEditable)
        )
          return;

        // 1. 处理 C 键：开/关侧边栏
        if (key === "c") {
          e.preventDefault();
          e.stopPropagation();

          const btn =
            document.getElementById("aside-area-toggle-btn") ||
            document.querySelector(".restore-btn.a-fade-in");

          if (btn) {
            btn.click();
          }
          return;
        }

        // 2. 处理 H / Y 键：控制底部功能栏按钮
        // 阻断默认按键行为
        e.preventDefault();
        e.stopPropagation();

        // 唤醒底栏：向播放器派发真实悬停事件
        const player =
          document.querySelector(
            ".bilibili-player-area, #bilibili-player, .video-floor, video",
          ) || document.body;
        const rect = player.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const baseOpts = {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: centerX,
          clientY: centerY,
          view: window,
        };

        [
          "mouseenter",
          "mouseover",
          "pointerenter",
          "pointermove",
          "mousemove",
        ].forEach((type) => {
          const evt = type.startsWith("pointer")
            ? new PointerEvent(type, {
                ...baseOpts,
                pointerId: 1,
                isPrimary: true,
              })
            : new MouseEvent(type, baseOpts);
          player.dispatchEvent(evt);
        });

        // 延迟 30ms 等待 Svelte 将节点挂载到 DOM 后执行精准派发
        setTimeout(() => {
          const buttons = document.querySelectorAll(
            '[class*="right-area"] [class*="tip-wrap"]',
          );
          const idx = keyMap[key];
          const element = buttons[idx];
          if (!element) return;

          // 视觉提示（红框）
          element.style.outline = "3px solid #ff0055";
          setTimeout(() => {
            element.style.outline = "";
          }, 300);

          // 寻找最深层目标
          const target = element.querySelector("span, svg, path") || element;
          const eventTypes = [
            "pointerdown",
            "mousedown",
            "pointerup",
            "mouseup",
            "click",
          ];
          eventTypes.forEach((type) => {
            const evtOptions = {
              bubbles: true,
              cancelable: true,
              composed: true,
              view: window,
              detail: 1,
              buttons: 1,
            };
            const evt = type.startsWith("pointer")
              ? new PointerEvent(type, {
                  ...evtOptions,
                  pointerId: 1,
                  isPrimary: true,
                })
              : new MouseEvent(type, evtOptions);
            target.dispatchEvent(evt);
            element.dispatchEvent(evt);
          });
          if (typeof element.click === "function") element.click();
        }, 30);
      },
      true,
    );
  }

  // ==================== 启动核心 ====================
  initQualityModule();
  initShortcutModule();
})();
