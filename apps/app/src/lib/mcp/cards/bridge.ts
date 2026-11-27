/** What a card's render function gets besides the tool's structured content. */
export interface CardKit {
  doc: Document;
  /** Creates an element; text is set as textContent, never as markup. */
  el: (tag: string, className?: string, text?: string) => HTMLElement;
  /** The host's IANA time zone, when it sent one. */
  timeZone?: string;
}

export type CardRender = (data: never, kit: CardKit) => Node;

/**
 * Runs inside a card's iframe and speaks the MCP Apps postMessage protocol:
 * `ui/initialize`, then the tool result, host context changes, size reports,
 * ping and teardown. It is serialized with `toString()`, as is `render`, so
 * neither may reference anything outside its own body.
 */
export function cardBridge(win: Window & typeof globalThis, appName: string, render: (data: unknown, kit: CardKit) => Node) {
  type HostContext = { theme?: string; timeZone?: string; styles?: { variables?: Record<string, string | undefined> } };

  const doc = win.document;
  const root = doc.getElementById("card")!;
  let last: object | undefined;
  let hostVariables: string[] = [];
  let nextId = 1;
  const pending = new Map<number, (result: unknown) => void>();
  const kit: CardKit = {
    doc,
    el: (tag, className, text) => {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    },
  };

  const send = (message: Record<string, unknown>) => win.parent.postMessage({ jsonrpc: "2.0", ...message }, "*");
  const request = (method: string, params: unknown) => {
    const id = nextId++;
    send({ id, method, params });
    return new Promise<unknown>((resolve) => pending.set(id, resolve));
  };

  // The content's own height: scrollHeight never drops below the iframe's.
  let reported = -1;
  function reportSize() {
    const height = Math.ceil(doc.documentElement.getBoundingClientRect().height);
    if (height === reported) return;
    reported = height;
    send({ method: "ui/notifications/size-changed", params: { height } });
  }

  function show(data: object) {
    last = data;
    root.replaceChildren(render(data, kit));
    reportSize();
  }

  function applyContext(context?: HostContext) {
    if (!context) return;
    if (context.theme === "light" || context.theme === "dark") {
      doc.documentElement.dataset.theme = context.theme;
      doc.documentElement.style.colorScheme = context.theme;
    }
    if (context.styles) {
      // A new styles object replaces the previous one.
      for (const name of hostVariables) doc.documentElement.style.removeProperty(name);
      hostVariables = [];
      for (const [name, value] of Object.entries(context.styles.variables ?? {})) {
        if (!name.startsWith("--") || typeof value !== "string") continue;
        doc.documentElement.style.setProperty(name, value);
        hostVariables.push(name);
      }
    }
    if (context.timeZone) kit.timeZone = context.timeZone;
    if (last) show(last);
  }

  win.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== win.parent) return;
    const message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;
    if (message.method === undefined && pending.has(message.id)) {
      pending.get(message.id)!(message.result);
      pending.delete(message.id);
      return;
    }
    if (message.method === "ui/notifications/tool-result") {
      const content = message.params?.structuredContent;
      if (content && typeof content === "object" && !message.params?.isError) show(content);
    } else if (message.method === "ui/notifications/host-context-changed") {
      applyContext(message.params);
    } else if (message.id !== undefined && (message.method === "ping" || message.method === "ui/resource-teardown")) {
      send({ id: message.id, result: {} });
    }
  });

  void request("ui/initialize", {
    appInfo: { name: appName, version: "1.0.0" },
    appCapabilities: {},
    protocolVersion: "2026-01-26",
  }).then((result) => {
    applyContext((result as { hostContext?: HostContext } | undefined)?.hostContext);
    send({ method: "ui/notifications/initialized", params: {} });
    if (typeof win.ResizeObserver === "function") new win.ResizeObserver(reportSize).observe(doc.documentElement);
  });
}
