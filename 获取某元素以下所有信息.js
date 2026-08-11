// class="restore-btn dp-none h-100 p-absolute bg-no-repeat pointer a-fade-in"
// class="restore-btn dp-none h-100 p-absolute bg-no-repeat pointer a-fade-in"
// class="btn-slider dp-none h-100 p-absolute a-fade-in"

(function copyDOMTree() {
  const selector = ".aside-area-toggle-btn.dp-none.p-absolute";
  const root = document.querySelector(selector);

  if (!root) {
    console.error(`❌ 未找到匹配选择器 "${selector}" 的元素`);
    return;
  }

  // 递归生成类似 DevTools Elements 面板的 DOM 树文本
  function generateDOMTree(node, depth = 0) {
    const indent = "  ".repeat(depth);

    // 1. 文本节点处理
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue.trim();
      return text ? `${indent}${text}` : null;
    }

    // 非元素节点直接跳过
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const tagName = node.tagName.toLowerCase();

    // 2. 收集元素所有属性
    const attrs = Array.from(node.attributes)
      .map((attr) => `${attr.name}="${attr.value}"`)
      .join(" ");
    const attrStr = attrs ? ` ${attrs}` : "";

    // 3. 提取 pseudo 伪元素 (如 ::before, ::after)
    const pseudoBefore =
      window.getComputedStyle(node, "::before").content !== "none"
        ? `${indent}  ::before`
        : null;
    const pseudoAfter =
      window.getComputedStyle(node, "::after").content !== "none"
        ? `${indent}  ::after`
        : null;

    const childNodes = Array.from(node.childNodes);

    // 空标签或无子节点的情况
    if (childNodes.length === 0 && !pseudoBefore && !pseudoAfter) {
      return `${indent}<${tagName}${attrStr}></${tagName}>`;
    }

    let lines = [`${indent}<${tagName}${attrStr}>`];

    if (pseudoBefore) lines.push(pseudoBefore);

    // 4. 递归处理子节点
    childNodes.forEach((child) => {
      const childTree = generateDOMTree(child, depth + 1);
      if (childTree) lines.push(childTree);
    });

    if (pseudoAfter) lines.push(pseudoAfter);

    lines.push(`${indent}</${tagName}>`);

    return lines.join("\n");
  }

  const htmlTree = generateDOMTree(root);

  // 1. 打印到控制台
  console.log(
    "%c=== 生成的 DOM 结构树 ===",
    "color: #00ff00; font-weight: bold;",
  );
  console.log(htmlTree);

  // 2. 复制到剪贴板
  copy(htmlTree);
  console.log(
    "%c\n✅ 已生成 DevTools 风格的 HTML DOM 树，并成功复制到剪贴板！",
    "color: #00bfff; font-size: 14px; font-weight: bold;",
  );
})();
