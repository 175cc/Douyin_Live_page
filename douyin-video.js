// ==UserScript==
// @name         抖音精选视频（自改精简版）
// @namespace    douyin
// @description  仅适用精选版抖音网页版，专注于视频播放和浏览体验（部分代码取自其他脚本）
// @version      1.2.1
// @match        *://www.douyin.com/*
// @require      https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js
// @run-at       document-end
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        window.close
// @license      MIT
// @noframes
// ==/UserScript==

// 全局控制变量
var bs = null;
var colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

// URL检测相关变量
var currentUrl = "";
var urlCheckInterval = null;
var isInitialized = false;
var activeIntervals = []; // 存储所有活动定时器ID

// 控制台彩色输出
function cc(color, args) {
  var total = "【抖音】";
  for (var i = 1; i < arguments.length; i++) {
    total += arguments[i];
  }
  console.log(colors[color] + total + colors.reset);
}

// 隐藏冗余元素与弹窗的专有样式
function addCSS() {
  // 移除已存在的样式
  $("style.optimize").remove();

  var wdstyle = document.createElement("style");
  wdstyle.classList.add("optimize");
  wdstyle.innerHTML = `
    /* 隐藏顶部/侧边栏/画中画/背景动态Canvas等冗余元素 */
    #douyin-navigation > div > div.MKOzvYDg.Yr4fQlKQ > div > div.wlJhKwNH.kTlD1StT,
    div.gNyVUu_s, .OaNxZqFU img, .iRX47Q8q img, .Ng_nLvWy img,
    #sliderVideo > div.Mtz1OJlG.v0tRQvoe, div > div.eVtiBTlw > img,
    #slideMode > div.Mtz1OJlG.v0tRQvoe > img, .Mtz1OJlG img, .DEZPWI4G img,
    img[alt="LiveIcon"], #sliderVideo > div > img, #dark > div.iDduYXAc,
    #sliderVideo > div.E7R0E__S.playerContainer.hide-animation-if-not-suport-gpu.TkocvtkE.XxlZGem2 > div.JqsBy4t7.slider-video.isVertical > div > div.nM3w4mVK.cmI2tyuz.focusPanel > div > div > div > div > img,
    #LeftBackgroundLayout > div.douyin-player-dynamic-background > canvas,
    #douyin-navigation > div > div.juSoeZQJ > div > div.anFLc8TW,
    div.douyin-player-dynamic-background,
    div.JwGiJkkI, div.xgplayer-dynamic-bg, div.umOY7cDY, div.ruqvqPsH, footer,
    :root[dark] .B6M32uoI, :root[dark] .KHZgK2KB, :root[dark] .YpFJLpHw {
      display: none !important;
    }

    /* 优化控制条与播放区域交互 */
    div.immersive-player-switch-on-hide-interaction-area, #video-info-wrap, xg-inner-controls.xg-inner-controls { opacity: 0.6 !important; }
    .xgplayer-playswitch .xgplayer-playswitch-tab { opacity: 0 !important; }
    div.xgplayer-playswitch-tab:hover, div.immersive-player-switch-on-hide-interaction-area:hover, #video-info-wrap:hover, xg-inner-controls.xg-inner-controls:hover { opacity: 1 !important; }

    /* 临时展开菜单样式（脚本控制） */
    .dy-auto-clarity-menu .virtual,
    .dy-auto-clarity-menu .virtual .item {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      pointer-events: auto !important;
    }
  `;
  document.body.appendChild(wdstyle);
}

// 存储定时器ID
function storeInterval(id, name) {
  activeIntervals.push({
    id: id,
    name: name,
  });
}

// 移除定时器记录
function removeInterval(id) {
  activeIntervals = activeIntervals.filter(function (item) {
    return item.id !== id;
  });
}

// 清理定时器和样式（自恢复与路由切换时使用）
function cleanupAll() {
  // 清理存储的定时器（排除URL检测定时器）
  for (var i = activeIntervals.length - 1; i >= 0; i--) {
    var interval = activeIntervals[i];
    if (interval.id !== urlCheckInterval) {
      if (interval.id) {
        clearInterval(interval.id);
      }
    }
  }
  activeIntervals = activeIntervals.filter(function (item) {
    return item.id === urlCheckInterval;
  });

  // 移除添加的样式
  $("style.optimize").remove();

  // 停止音频资源（若存在）
  if (bs) {
    bs.stop();
    bs = null;
  }
}

// URL变化检测
function checkUrlChange() {
  if (!urlCheckInterval) {
    initUrlDetection();
    return;
  }

  var newUrl = location.href;

  if (newUrl !== currentUrl) {
    cc("blue", "检测到URL变化：", currentUrl, " -> ", newUrl);
    currentUrl = newUrl;

    // 延迟重新初始化，适应单页应用渲染
    setTimeout(function () {
      if (isInitialized) {
        cleanupAll();
        isInitialized = false;
      }
      initializeScript();
    }, 1500);
  }
}

// 主初始化逻辑
function initializeScript() {
  if (isInitialized) {
    return;
  }

  cc("green", "开始初始化脚本 - URL:", currentUrl);

  // 1. 注入冗余元素隐藏 CSS
  addCSS();

  // 2. 仅在普通视频页面下自动切换为最高清晰度（跳过直播页面）
  if (location.href.indexOf("https://www.douyin.com/") > -1) {
    var definitionRetries = 0;
    var maxDefinitionRetries = 30;
    var setdefinition = setInterval(function () {
      definitionRetries++;
      if (definitionRetries > maxDefinitionRetries) {
        cc("yellow", "自动切换清晰度：超过最大重试次数，停止");
        clearInterval(setdefinition);
        removeInterval(setdefinition);
        return;
      }

      // 固定取第二个 gear（当前显示的画面），不存在则 fallback 到第一个
      var $allGears = $(".gear.isSmoothSwitchClarityLogin");
      if (!$allGears.length) {
        cc("yellow", "自动切换清晰度：未找到 gear 元素");
        return;
      }

      var $gear = $allGears.eq(1);
      if (!$gear.length) {
        $gear = $allGears.eq(0);
      }

      // 当前清晰度按钮
      var $currentBtn = $gear.find(".btn.btnV2, .btnV2, .btn").first();
      var curdefinition = $currentBtn.text().trim();
      if (!curdefinition) {
        cc("yellow", "自动切换清晰度：未获取到当前清晰度文本");
        return;
      }

      // 可选清晰度列表
      var $items = $gear.find(".virtual .item").filter(function () {
        return $(this).text().trim().length > 0;
      });
      if (!$items.length) {
        cc("yellow", "自动切换清晰度：未找到可选清晰度列表");
        return;
      }

      // 按页面排列顺序取第一个不需要登录/开通的清晰度
      var $target = null;
      var targetText = "";
      $items.each(function () {
        var $item = $(this);
        var txt = $item.text().trim();
        if (txt.indexOf("登录") > -1 || txt.indexOf("开通") > -1) {
          return true; // continue
        }
        $target = $item;
        targetText = txt;
        return false; // break
      });

      // 如果全部都需要登录，则 fallback 到第一个
      if (!$target) {
        $target = $items.first();
        targetText = $target.text().trim();
      }

      if (!targetText) {
        cc("yellow", "自动切换清晰度：无法解析目标清晰度文本");
        return;
      }

      cc("white", "当前清晰度：", curdefinition, "，目标清晰度：", targetText);

      if (curdefinition === targetText) {
        clearInterval(setdefinition);
        removeInterval(setdefinition);
        return;
      }

      // 给当前 gear 加临时展开 class，让菜单可见
      $gear.addClass("dy-auto-clarity-menu");

      // 目标已可见，直接点击
      if ($target.is(":visible")) {
        cc("white", "点击切换清晰度到：", targetText);
        if ($target.length && $target[0]) {
          $target[0].click();
        }
        // 点击后移除临时 class
        setTimeout(function () {
          $gear.removeClass("dy-auto-clarity-menu");
        }, 500);
        return;
      }

      // 目标仍然不可见，点击当前按钮触发菜单展开
      cc("white", "目标清晰度不可见，点击当前按钮展开菜单");
      if ($currentBtn.length && $currentBtn[0]) {
        $currentBtn[0].click();
      }

      // 一轮后再尝试移除临时 class
      setTimeout(function () {
        if (!$gear.hasClass("dy-auto-clarity-menu")) return;
        var nowText = $gear
          .find(".btn.btnV2, .btnV2, .btn")
          .first()
          .text()
          .trim();
        if (nowText === targetText) {
          $gear.removeClass("dy-auto-clarity-menu");
        }
      }, 800);
    }, 1000);
    storeInterval(setdefinition, "setdefinition");
  }

  // 标记为已初始化
  isInitialized = true;
  cc("green", "脚本初始化完成");
}

// 初始化URL监听器
function initUrlDetection() {
  if (
    urlCheckInterval &&
    activeIntervals.some(function (item) {
      return item.id === urlCheckInterval;
    })
  ) {
    return;
  }

  currentUrl = location.href;

  if (urlCheckInterval) {
    clearInterval(urlCheckInterval);
    removeInterval(urlCheckInterval);
  }

  urlCheckInterval = setInterval(checkUrlChange, 2000);
  storeInterval(urlCheckInterval, "urlCheckInterval");
}

// 脚本入口
$(document).ready(function () {
  setTimeout(function () {
    cc("magenta", "=== 抖音精选视频脚本启动 ===");
    initUrlDetection();
    initializeScript();
  }, 2000);
});

// 页面卸载清理
$(window).on("beforeunload", function () {
  cleanupAll();
  if (urlCheckInterval) {
    clearInterval(urlCheckInterval);
  }
});
