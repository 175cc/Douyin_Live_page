// ==UserScript==
// @name         抖音福袋自动抢
// @namespace    douyin
// @version      1.0.1
// @description  抖音直播自动识别福袋、检查条件、参与1、倒计时与开奖结果检测（快捷键 Ctrl + Q 开启/关闭）
// @match        *://live.douyin.com/*
// @run-at       document-idle
// @grant        none
// @author       175cc
// @namespace    https://github.com/175cc/Douyin_Live_page.git
// @license      MIT
// ==/UserScript==

(function standaloneLotteryModuleFinalFix() {
  "use strict";

  // --- 1. DOM 选择器字典与全局状态 ---
  const SELECTORS = {
    dialogContainer: "#lottery_close_cotainer, [id*='lottery_close']",
    closeBtn:
      ".hJ3SHYaQ, #lottery_close_cotainer [class*='close'], [id*='lottery_close'] .hJ3SHYaQ",
    joinBtn:
      ".QOARtY3v.VA93rNkB.WrS6ZBHo, [class*='QOARtY3v'][class*='WrS6ZBHo']",
    alreadyJoinedBtn: ".UU67CvI1",
    timer: ".VWPnhGkt, .qR53KhLu, .ycjwPFJI",
    resultDialog:
      ".HHkLyvba.lotteryDialog, [class*='lotteryDialog'], .lotteryDialog",
    resultText: ".EJpzW6yC, [class*='EJpzW6yC']",
    resultBtn:
      ".QOARtY3v.VA93rNkB.U8EWGi24, [class*='lotteryDialog'] .QOARtY3v",
    icon: ".LMUtLyr9, .dVxrjT_h",
    reqItem: ".aMOCkQGL, [class*='aMOCkQGL']",
    statusItem: ".q6Dj7eFU, [class*='q6Dj7eFU']",
  };

  let isEnabled = false; // 是否启用自动抢福袋功能
  let isProcessing = false; // 是否正在处理抢福袋逻辑，避免重复触发
  let loopTimer = null; // 主轮询定时器
  let countdownTimer = null; // 倒计时定时器
  let abandonTimeoutTimer = null; // 放弃后等待下一轮的定时器

  let hasJoinedThisRound = false; // 当前轮次是否已参与过
  let currentActionState = "NONE"; // "NONE" | "JOINED" | "ABANDONED"// 当前轮次的操作状态
  let cachedRemainingSeconds = 999; // 缓存的剩余秒数，用于倒计时显示
  let lastRoundResult = null; // 上一轮的开奖结果信息，{ text: string, status: "中奖" | "未中奖" | "未知" }
  let currentLotteryCount = null; // 当前福袋总数量，未知时为 null

  const IDLE_POLL_INTERVAL = 60000; // 60秒轮询一次，降低 CPU 占用
  const ACTIVE_POLL_INTERVAL = 1000; // 1秒轮询一次，快速响应福袋出现和倒计时

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)); // 休眠函数，返回一个 Promise，在指定毫秒后 resolve

  // --- 2. DOM 查找助手函数 ---
  const $ = (selector) => {
    const el = document.querySelector(selector);
    return el && el.offsetParent !== null ? el : null;
  };

  const $byText = (tag, text, exact = true) => {
    return Array.from(document.querySelectorAll(tag)).find((el) => {
      const t = el.textContent.trim();
      return exact ? t === text : t.includes(text);
    });
  };

  // --- 3. 定时器与状态重置 ---
  const stopLoopTimer = () => {
    if (loopTimer) {
      clearInterval(loopTimer);
      loopTimer = null;
    }
  };

  const stopCountdownTimer = () => {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  };

  const resetRoundState = () => {
    hasJoinedThisRound = false;
    currentActionState = "NONE";
    cachedRemainingSeconds = 999;
    currentLotteryCount = null;
    updateLotteryCountDisplay();
    stopCountdownTimer();
    if (abandonTimeoutTimer) {
      clearTimeout(abandonTimeoutTimer);
      abandonTimeoutTimer = null;
    }
    updateConditionsDisplay({ hasConditions: false });
    if (isEnabled) {
      updatePanelStatus("运行中（等待福袋出现）");
    }
  };

  // --- 4. 仿真点击与解析 ---
  const dispatchFullEvents = (el) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.click();
  };

  const parseRemainingSeconds = (timeStr) => {
    if (!timeStr) return 999;
    const parts = timeStr
      .trim()
      .split(":")
      .map((p) => parseInt(p, 10));
    if (parts.some(isNaN)) return 999;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
    return 999;
  };

  const closeLotteryDialog = () => {
    const closeBtn = $(SELECTORS.closeBtn);
    if (closeBtn) {
      dispatchFullEvents(closeBtn);
      console.log("🙈 [自动抢福袋] 已点击关闭按钮，还原直播界面");
      return true;
    }
    return false;
  };

  // 从当前福袋弹窗结构中读取数量：未参与使用 Y76xf_k0，已参与使用 T6zCkci7。
  const getLotteryCount = (container) => {
    if (!container) return null;

    const countEl = container.querySelector(
      ".Y76xf_k0, [class*='Y76xf_k0'], .T6zCkci7, [class*='T6zCkci7']",
    );
    if (!countEl) return null;

    const countText = countEl.textContent.trim();
    const countMatch = countText.match(/(?:共|有)?\s*(\d+)\s*个福袋/);
    if (countMatch) return Number(countMatch[1]);

    const numberMatch = countText.match(/\d+/);
    if (numberMatch) return Number(numberMatch[0]);

    const chineseCount = countText.match(/[一二两三四五六七八九十]+/);
    if (!chineseCount) return null;
    const chineseDigits = {
      一: 1,
      二: 2,
      两: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
    };
    return chineseDigits[chineseCount[0]] || null;
  };

  // --- 5. 开奖检测逻辑 ---
  const detectLotteryResult = () => {
    const resultDialog = $(SELECTORS.resultDialog);
    if (!resultDialog) return null;

    const resultTextEl = resultDialog.querySelector(SELECTORS.resultText);
    const resultText = resultTextEl ? resultTextEl.textContent.trim() : "";
    if (!resultText) return null;

    let status = "未知";
    if (
      /没抽中|未中奖|没中奖|未抽中|没中|遗憾|下次|好运|未能|空手/.test(
        resultText,
      )
    ) {
      status = "未中奖";
    } else if (/中奖|恭喜|获得|抽中|幸运|赢得了|领取/.test(resultText)) {
      status = "中奖";
    } else {
      status = "结果:" + resultText;
    }
    return { resultText, status };
  };

  const tryCloseResultDialog = async () => {
    for (let i = 0; i < 6; i++) {
      const resultBtn = $(SELECTORS.resultBtn);
      if (resultBtn) {
        dispatchFullEvents(resultBtn);
        console.log("🎉 [自动抢福袋] 已自动点击【知道了】关闭开奖弹窗！");
        updatePanelStatus("已关闭开奖弹窗(轮询中)");
        resetRoundState();
        updateLastRoundDisplay();
        return true;
      }
      await sleep(1000);
    }
    return false;
  };

  const updateLastRoundDisplay = () => {
    const condEl = document.getElementById("lottery-conditions-text");
    if (!condEl) return;

    if (!lastRoundResult) {
      condEl.innerText = "";
      condEl.title = "";
      return;
    }

    condEl.title = `上轮详情：${lastRoundResult.text}`;
    condEl.style.whiteSpace = "nowrap";
    const icon = lastRoundResult.status === "中奖" ? "🏆" : "💨";
    condEl.innerText = `${icon} 上轮：${lastRoundResult.status}`;
  };

  // --- 6. 条件解析与判定 ---
  const getLotteryConditionsInfo = (dialogContainer) => {
    const lotteryCount = getLotteryCount(dialogContainer);
    const conditionTitle = dialogContainer
      ? Array.from(dialogContainer.querySelectorAll("div")).find(
          (el) => el.textContent.trim() === "参与条件",
        )
      : $byText("div", "参与条件");
    if (!conditionTitle) {
      return {
        hasConditions: false,
        conditions: [],
        formattedText: "",
        lotteryCount,
      };
    }

    const conditionContainer =
      conditionTitle.closest(
        "[class*='dialog'], [class*='container'], [class*='content']",
      ) || conditionTitle.parentElement;
    if (!conditionContainer) {
      return {
        hasConditions: false,
        conditions: [],
        formattedText: "",
        lotteryCount,
      };
    }

    const requirementEls = conditionContainer.querySelectorAll(
      SELECTORS.reqItem,
    );
    const conditions = Array.from(requirementEls)
      .map((reqEl) => {
        const requirement = reqEl.textContent.trim();
        const statusEl = reqEl.parentElement
          ? reqEl.parentElement.querySelector(SELECTORS.statusItem)
          : null;
        return {
          requirement,
          status: statusEl ? statusEl.textContent.trim() : "未知",
        };
      })
      .filter((c) => c.requirement);

    // Fallback 解析
    if (conditions.length === 0) {
      const allDivs = Array.from(conditionContainer.querySelectorAll("div"));
      for (let i = 0; i < allDivs.length - 1; i++) {
        const reqText = allDivs[i].textContent.trim();
        const statusText = allDivs[i + 1].textContent.trim();
        if (!reqText || reqText === "参与条件") continue;
        if (statusText === "已达成" || statusText === "未达成") {
          conditions.push({ requirement: reqText, status: statusText });
          i++;
        }
      }
    }

    if (conditions.length === 0) {
      return {
        hasConditions: false,
        conditions: [],
        formattedText: "",
        lotteryCount,
      };
    }

    const isSingle = conditions.length === 1;
    const summaryPrefix = isSingle ? "单条件" : `多条件(${conditions.length})`;
    const formattedText =
      `${summaryPrefix}: ` +
      conditions.map((c) => `${c.requirement}[${c.status}]`).join(" | ");

    return {
      hasConditions: true,
      conditions,
      isSingle,
      formattedText,
      lotteryCount,
    };
  };

  // --- 7. 主任务入口 ---
  const runLotteryTask = async () => {
    if (!isEnabled || isProcessing) return;

    // 1. 优先捕获开奖结果弹窗
    const resultInfo = detectLotteryResult();
    if (resultInfo && resultInfo.resultText) {
      stopLoopTimer();
      stopCountdownTimer();

      lastRoundResult = {
        text: resultInfo.resultText,
        status: resultInfo.status,
      };
      console.log(
        `🏆 [自动抢福袋] 检测到开奖结果：${resultInfo.resultText}（${resultInfo.status}）`,
      );

      updateConditionsDisplay({
        hasConditions: true,
        isSingle: true,
        formattedText: `开奖结果：${resultInfo.status}（${resultInfo.resultText}）`,
        conditions: [],
      });
      updatePanelStatus("开奖结果已出");

      setTimeout(async () => {
        if (!isEnabled) return;
        console.log("🙈 [自动抢福袋] 1秒到，准备自动关闭开奖结果弹窗...");
        await tryCloseResultDialog();
        if (!loopTimer && isEnabled) setPollingInterval(IDLE_POLL_INTERVAL);
      }, 1000);
      return;
    }

    // 2. 检查福袋详情弹窗
    const dialogContainer = $(SELECTORS.dialogContainer);
    const alreadyJoinedBtn =
      dialogContainer?.querySelector(SELECTORS.alreadyJoinedBtn) ||
      (dialogContainer ? $byText("div", "已参与") : null);
    const joinBtn =
      dialogContainer?.querySelector(SELECTORS.joinBtn) ||
      (dialogContainer
        ? Array.from(dialogContainer.querySelectorAll("div")).find((el) =>
            el.textContent.includes("一键发评论参与福袋"),
          )
        : null);

    const timerEl = $(SELECTORS.timer);
    const timerText = timerEl ? timerEl.textContent.trim() : "";
    const secs = parseRemainingSeconds(timerText);
    if (secs < 999) cachedRemainingSeconds = secs;

    // --- 逻辑 A：弹窗当前处于展开状态 ---
    if (dialogContainer) {
      const conditionsInfo = getLotteryConditionsInfo(dialogContainer);
      currentLotteryCount = conditionsInfo.lotteryCount;
      updateLotteryCountDisplay();
      if (conditionsInfo.hasConditions) {
        console.log("📝 [自动抢福袋] 参与条件：", conditionsInfo.formattedText);
        updateConditionsDisplay(conditionsInfo);
      }

      setPollingInterval(ACTIVE_POLL_INTERVAL);

      // 情况 A-1：已参与
      if (alreadyJoinedBtn && alreadyJoinedBtn.textContent.includes("已参与")) {
        hasJoinedThisRound = true;
        currentActionState = "JOINED";
        updatePanelStatus(`已参与 | 剩余: ${timerText || "运行中"}`);
        closeLotteryDialog();

        if (cachedRemainingSeconds > 0 && cachedRemainingSeconds < 999) {
          stopLoopTimer();
          startCountdownTimer();
        }
        return;
      }

      // 情况 A-2：未参与，判定是否符合条件
      if (joinBtn) {
        let shouldJoin = false;

        if (conditionsInfo.hasConditions && !conditionsInfo.isSingle) {
          const commentCond = conditionsInfo.conditions.find((c) =>
            c.requirement.includes("发送评论"),
          );
          const otherConds = conditionsInfo.conditions.filter(
            (c) => !c.requirement.includes("发送评论"),
          );

          // 「其中之一条件满足」判定：其它条件中至少有一条不是“未达成”
          const anyOtherReached = otherConds.some((c) => c.status !== "未达成");
          // 全部条件中是否任意一条满足（通用判定，供后续 TODO 使用）
          const anyReached = conditionsInfo.conditions.some(
            (c) => c.status !== "未达成",
          );

          // 目前仅实现的参与规则：发送评论未达成 + 其它条件有达成 → 参与
          const canProceed =
            commentCond?.status === "未达成" && anyOtherReached;
          const allUnreached = !anyReached;

          if (canProceed) {
            shouldJoin = true;
          } else if (allUnreached) {
            // 放弃逻辑
            hasJoinedThisRound = true;
            currentActionState = "ABANDONED";
            updatePanelStatus(`已放弃 | 剩余: ${timerText || "等待中"}`);
            console.log("⚠️ [自动抢福袋] 多条件福袋且全部未达成，自动关闭放弃");
            isProcessing = true;
            closeLotteryDialog();

            const waitTime =
              cachedRemainingSeconds < 999 && cachedRemainingSeconds > 0
                ? cachedRemainingSeconds * 1000 + 30000
                : 30000;

            if (cachedRemainingSeconds > 0 && cachedRemainingSeconds < 999) {
              stopLoopTimer();
              startCountdownTimer();
            }

            if (abandonTimeoutTimer) clearTimeout(abandonTimeoutTimer);
            abandonTimeoutTimer = setTimeout(() => {
              if (!isEnabled) return;
              resetRoundState();
              console.log("🔄 [自动抢福袋] 倒计时结束，重置状态重新监听新福袋");
            }, waitTime);

            setPollingInterval(IDLE_POLL_INTERVAL);
            isProcessing = false;
            return;
          } else {
            // TODO: 「其中之一条件满足即参与」的其它场景待写：
            //   ① 发送评论条件本身已达成时（commentCond.status === "已达成"）
            //   ② 无“发送评论”条件、仅靠 anyReached 判定的多条件福袋
            //   届时可用上面预留的 anyReached / anyOtherReached 变量补充规则，
            //   满足时置 shouldJoin = true，否则维持跳过。
            updatePanelStatus("多条件福袋，已跳过自动参与");
            return;
          }
        } else {
          shouldJoin = true; // 单条件或无限制直接参与
        }

        // 统一执行点击参与
        if (shouldJoin) {
          isProcessing = true;
          updatePanelStatus("条件符合，自动参与福袋");
          dispatchFullEvents(joinBtn);
          hasJoinedThisRound = true;
          currentActionState = "JOINED";
          console.log(`✅ [自动抢福袋] 已点击参与！倒计时剩余: ${timerText}`);
          updatePanelStatus(`已参与 | 剩余: ${timerText}`);

          await sleep(500);
          closeLotteryDialog();

          if (cachedRemainingSeconds > 0 && cachedRemainingSeconds < 999) {
            stopLoopTimer();
            startCountdownTimer();
          } else {
            await sleep(ACTIVE_POLL_INTERVAL);
            await tryCloseResultDialog();
            setPollingInterval(IDLE_POLL_INTERVAL);
          }
          isProcessing = false;
          return;
        }
      }
    }

    // --- 逻辑 B：弹窗未展开，唤起左侧图标 ---
    const lotteryIcon = $(SELECTORS.icon);
    if (lotteryIcon) {
      if (hasJoinedThisRound) {
        const outerTimer = lotteryIcon.querySelector(SELECTORS.timer);
        const outerTimerText = outerTimer ? outerTimer.textContent.trim() : "";
        const outerSecs = parseRemainingSeconds(outerTimerText);
        if (outerSecs < 999) cachedRemainingSeconds = outerSecs;

        const labelText =
          currentActionState === "ABANDONED" ? "已放弃" : "已参与";
        updatePanelStatus(`${labelText} | 剩余: ${outerTimerText || "进行中"}`);

        if (outerSecs > 2) {
          stopLoopTimer();
          return;
        }

        if (outerSecs <= 2 && outerSecs > 0) {
          setPollingInterval(ACTIVE_POLL_INTERVAL);
          isProcessing = true;

          if (currentActionState === "ABANDONED") {
            resetRoundState();
            setPollingInterval(IDLE_POLL_INTERVAL);
          } else {
            updatePanelStatus("倒计时归零，等待开奖...");
            await sleep(5000);
            await tryCloseResultDialog();
            stopCountdownTimer();
            setPollingInterval(IDLE_POLL_INTERVAL);
          }
          isProcessing = false;
        }
        return;
      }

      setPollingInterval(ACTIVE_POLL_INTERVAL);
      isProcessing = true;
      updatePanelStatus("发现未参与福袋，打开面板...");
      dispatchFullEvents(lotteryIcon);
      console.log("💡 [自动抢福袋] 发现福袋图标，点击唤起详情面板");
      await sleep(800);
      isProcessing = false;
    } else {
      if (!hasJoinedThisRound) {
        updatePanelStatus("运行中（等待福袋出现）");
      }
    }
  };

  // --- 8. UI 更新与倒计时控制 ---
  const updateConditionsDisplay = (info) => {
    const condEl = document.getElementById("lottery-conditions-text");
    if (!condEl) return;

    if (!info || !info.hasConditions) {
      condEl.innerText = "";
      condEl.title = "";
      return;
    }

    condEl.title = info.formattedText;
    if (info.isSingle) {
      condEl.style.whiteSpace = "nowrap";
      condEl.innerText = info.formattedText;
    } else {
      condEl.style.whiteSpace = "pre-line";
      condEl.innerText = info.conditions
        .map((c) => `• ${c.requirement} [${c.status}]`)
        .join("\n");
    }
  };

  const startCountdownTimer = () => {
    stopCountdownTimer();
    console.log(
      `⏱️ [自动抢福袋] 启动本地每秒倒计时，初始秒数: ${cachedRemainingSeconds}`,
    );

    countdownTimer = setInterval(() => {
      if (!isEnabled) {
        stopCountdownTimer();
        return;
      }

      if (cachedRemainingSeconds > 0) {
        cachedRemainingSeconds--;
        const mins = String(Math.floor(cachedRemainingSeconds / 60)).padStart(
          2,
          "0",
        );
        const secs = String(cachedRemainingSeconds % 60).padStart(2, "0");
        const prefix = currentActionState === "ABANDONED" ? "已放弃" : "已参与";
        updatePanelStatus(`${prefix} | 剩余: ${mins}:${secs}`);
      }

      if (cachedRemainingSeconds <= 2) {
        console.log("⏰ [自动抢福袋] 倒计时最后 2s，准备唤醒收尾...");
        stopCountdownTimer();

        if (currentActionState === "ABANDONED") {
          resetRoundState();
          setPollingInterval(IDLE_POLL_INTERVAL);
          console.log(
            "🔄 [自动抢福袋] 已放弃的福袋倒计时归零，完全清空面板并开始监听新福袋",
          );
          return;
        }
        setPollingInterval(ACTIVE_POLL_INTERVAL);
      }
    }, 1000);
  };

  const toggleLotteryFeature = (flag) => {
    isEnabled = flag !== undefined ? flag : !isEnabled;
    const btn = document.getElementById("lottery-toggle-btn");

    if (isEnabled) {
      console.log("🚀 [自动抢福袋] 功能【已开启】 (快捷键 Ctrl + Q)");
      if (btn) {
        btn.style.background = "#4CAF50";
        btn.innerText = "福袋功能：已开启 (Ctrl+Q)";
      }
      resetRoundState();
      setPollingInterval(IDLE_POLL_INTERVAL);
      runLotteryTask();
    } else {
      console.log("🛑 [自动抢福袋] 功能【已关闭】");
      if (btn) {
        btn.style.background = "#f44336";
        btn.innerText = "福袋功能：已关闭 (Ctrl+Q)";
      }
      updatePanelStatus("已关闭");
      stopLoopTimer();
      resetRoundState();
      lastRoundResult = null;
    }
  };

  const setPollingInterval = (ms) => {
    if (!isEnabled) return;
    stopLoopTimer();
    loopTimer = setInterval(runLotteryTask, ms);
  };

  const updateLotteryCountDisplay = () => {
    const countEl = document.getElementById("lottery-count-text");
    if (!countEl) return;

    countEl.innerText =
      Number.isInteger(currentLotteryCount) && currentLotteryCount >= 0
        ? `（${currentLotteryCount}个）`
        : "（未知）";
    countEl.title =
      currentLotteryCount == null ? "福袋数量未知" : "当前福袋总数量";
  };

  const updatePanelStatus = (msg) => {
    const statusEl = document.getElementById("lottery-status-text");
    if (statusEl) statusEl.innerText = msg;
  };

  // --- 9. 快捷键与面板渲染 ---
  document.addEventListener(
    "keydown",
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "q") {
        e.preventDefault();
        e.stopPropagation();
        toggleLotteryFeature();
      }
    },
    true,
  );

  const makeDraggable = (panel, dragHandle) => {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    const onStart = (e) => {
      if (e.target.tagName === "BUTTON") return;
      isDragging = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      startX = clientX;
      startY = clientY;
      const rect = panel.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      panel.style.bottom = "auto";
      panel.style.right = "auto";
      panel.style.transform = "none"; // 清除初始居中 transform，防止拖拽起始点偏移
      panel.style.left = `${initialLeft}px`;
      panel.style.top = `${initialTop}px`;
      panel.style.cursor = "grabbing";
    };

    const onMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      let nextLeft = initialLeft + (clientX - startX);
      let nextTop = initialTop + (clientY - startY);

      const maxLeft = window.innerWidth - panel.offsetWidth;
      const maxTop = window.innerHeight - panel.offsetHeight;
      nextLeft = Math.max(0, Math.min(nextLeft, maxLeft));
      nextTop = Math.max(0, Math.min(nextTop, maxTop));

      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      panel.style.cursor = "move";
    };

    dragHandle.addEventListener("mousedown", onStart);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
    dragHandle.addEventListener("touchstart", onStart, { passive: false });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
  };

  const createControlPanel = () => {
    const oldPanel = document.getElementById("lottery-control-panel");
    if (oldPanel) oldPanel.remove();

    const panel = document.createElement("div");
    panel.id = "lottery-control-panel";
    panel.style.cssText = `
      position: fixed;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999999;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(6px);
      padding: 6px 10px;
      border-radius: 6px;
      color: #fff;
      font-size: 11px;
      box-shadow: 0 3px 10px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      gap: 8px;
      user-select: none;
      font-family: sans-serif;
      cursor: move;
      border: 1px solid rgba(255,255,255,0.15);
    `;

    panel.innerHTML = `
      <div id="lottery-drag-title" style="font-size: 10px; opacity: 0.6; display: flex; flex-direction: column; align-items: center; line-height: 1.2; padding-right: 4px; border-right: 1px solid rgba(255,255,255,0.2);">
        <span>拖</span>
        <span>拽</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <button id="lottery-toggle-btn" style="
          background: #f44336;
          color: white;
          border: none;
          padding: 4px 10px;
          border-radius: 3px;
          cursor: pointer;
          font-weight: bold;
          font-size: 11px;
          transition: background 0.2s;
        ">福袋功能：已关闭 (Ctrl+Q)</button>
        <div style="font-size: 10px; opacity: 0.85; text-align: center;">
          状态: <span id="lottery-status-text">已关闭</span><span id="lottery-count-text" style="display: inline-block; margin-left: 4px; padding: 0 3px; border: 1px solid #ffd54f; border-radius: 2px; color: #ffd54f; font-weight: bold;" title="福袋数量未知">（未知）</span>
        </div>
      </div>
      <div id="lottery-conditions-text" title="" style="font-size: 10px; opacity: 0.85; text-align: center; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-left: 1px solid rgba(255,255,255,0.2); padding-left: 6px; margin-left: 2px;"></div>
    `;

    document.body.appendChild(panel);
    updateLotteryCountDisplay();
    makeDraggable(panel, panel);
    document
      .getElementById("lottery-toggle-btn")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        toggleLotteryFeature();
      });
  };

  // document-idle 下 body 通常已就绪；加一层保护以兼容 document-start/document-end 场景
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createControlPanel, {
      once: true,
    });
  } else {
    createControlPanel();
  }
})();
