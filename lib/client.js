/**
 * dsh-plugin-deepseek-balance — Client half
 *
 * A packaged client bundle in the DSH web module format:
 * `window.__ModuleLoader__.load({ id, factory })`. The factory receives a
 * `require` whose seed words include `react`; the exported plugin object is
 * consumed by the vendored cordis loader on the page.
 *
 * The bundle registers one additive entry in the `conversation.composer.dock`
 * slot (the band under the composer where the shipped stats line lives) and
 * polls the Host route `/dsh-deepseek-balance` for the account balance.
 * The API key never reaches the browser: it stays on the Host.
 */
window.__ModuleLoader__.load({
  id: "dsh-plugin-deepseek-balance",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");

    //#region plugin metadata
    const NS = "ds-balance";
    const ROUTE_PATH = "/dsh-deepseek-balance";
    const POLL_MS = 30000;
    /** Services this plugin needs injected on the client root context. */
    const inject = ["slots", "timer", "locale"];

    // composer.dock 的多个状态 chip 横向排列（与 usage/sysmon 插件共享）：
    // InputBar 根容器改 row+wrap，card 独占一行，footer 的 chip 横排成一条。
    if (typeof document !== "undefined" && document.querySelector("style[data-dsh-composer-row]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-plugin-deepseek-balance";
      tag.dataset.dshComposerRow = "";
      tag.textContent =
        "div:has(> [data-composer-card]){flex-direction:row!important;flex-wrap:wrap!important;justify-content:center;align-items:center}" +
        "[data-composer-card]{flex:1 1 100%!important}";
      document.head.appendChild(tag);
    }
    //#endregion

    //#region dictionaries
    const zh = {
      label: "余额",
      loading: "余额查询中…",
      error: "查询失败",
      available: "可用",
      total: "总余额",
      granted: "赠送",
      toppedUp: "充值",
      empty: "暂无余额数据",
      notEnough: "（余额可能不足）",
    };
    const en = {
      label: "Balance",
      loading: "Loading balance…",
      error: "Failed to load",
      available: "available",
      total: "Total",
      granted: "Granted",
      toppedUp: "Topped up",
      empty: "No balance data",
      notEnough: " (may be insufficient)",
    };
    //#endregion

    //#region styles (inline; theme tokens keep light/dark parity)
    const wrapStyle = {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontSize: 12,
      lineHeight: 1,
      color: "var(--dsw-alias-label-secondary)",
      whiteSpace: "nowrap",
      userSelect: "none",
    };
    const chipStyle = {
      background: "transparent",
      border: 0,
      padding: 0,
      margin: 0,
      font: "inherit",
      color: "inherit",
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
    };
    const labelStyle = { opacity: 0.85 };
    const amtStyle = { color: "var(--dsw-alias-label-primary)", fontWeight: 500 };
    const okStyle = { color: "var(--dsw-alias-state-success-primary)" };
    const errStyle = { color: "var(--dsw-alias-state-warn-primary)" };
    //#endregion

    function currencySymbol(currency) {
      if (currency === "CNY") return "¥";
      if (currency === "USD") return "$";
      return currency ? currency + " " : "";
    }

    function routeUrl() {
      const origin = typeof location !== "undefined" && location.origin && location.origin !== "null" ? location.origin : "";
      return origin + ROUTE_PATH;
    }

    /**
     * Poll the Host route and normalize into a small owned state shape.
     * @returns {{ ok: boolean, available?: boolean, infos?: Array, error?: string }}
     */
    async function fetchBalance() {
      const response = await fetch(routeUrl(), { cache: "no-store" });
      const json = await response.json();
      return json;
    }

    /**
     * Plugin body: register the dock entry. The component is defined here so it
     * closes over the plugin `ctx` (timer mixin + locale binding).
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "deepseek-balance: dictionaries");
      const t = typeof ctx.locale.bind === "function"
        ? ctx.locale.bind(NS)
        : ((key) => (zh[key] ?? key));

      /**
       * The status-bar chip. `props.t` wins when the slot dispatcher passes the
       * bound translator (registration declares `locale: NS`); otherwise the
       * closure translator above is used.
       */
      function BalanceView(props) {
        const tt = props && typeof props.t === "function" ? props.t : t;
        const [state, setState] = react.useState({ phase: "loading", data: null, error: null });

        react.useEffect(() => {
          let alive = true;
          const refresh = async () => {
            try {
              const res = await fetchBalance();
              if (!alive) return;
              if (res && res.ok === true) {
                setState({ phase: "ready", data: res, error: null });
              } else {
                setState({ phase: "error", data: null, error: (res && res.error) || tt("error") });
              }
            } catch (err) {
              if (!alive) return;
              setState({ phase: "error", data: null, error: String(err && err.message || err) });
            }
          };
          refresh();
          const stop = ctx.interval(refresh, POLL_MS);
          return () => { alive = false; stop(); };
        }, []);

        const onClick = () => {
          setState({ phase: "loading", data: state.data, error: null });
          fetchBalance().then((res) => {
            if (res && res.ok === true) setState({ phase: "ready", data: res, error: null });
            else setState({ phase: "error", data: null, error: (res && res.error) || tt("error") });
          }).catch((err) => {
            setState({ phase: "error", data: null, error: String(err && err.message || err) });
          });
        };

        let inner;
        let title = "";
        if (state.phase === "loading" && state.data === null) {
          title = tt("loading");
          inner = react.createElement("span", null, "DeepSeek " + tt("loading"));
        } else if (state.phase === "ready" && state.data !== null) {
          const info = state.data.infos && state.data.infos[0];
          if (info) {
            const sym = currencySymbol(info.currency);
            title = tt("total") + " " + sym + info.totalBalance +
              " · " + tt("granted") + " " + sym + info.grantedBalance +
              " · " + tt("toppedUp") + " " + sym + info.toppedUpBalance +
              (state.data.available === false ? tt("notEnough") : "");
            inner = react.createElement("span", { style: okStyle },
              react.createElement("span", { style: amtStyle }, sym + info.totalBalance),
              react.createElement("span", null, " " + tt("available"))
            );
          } else {
            title = tt("empty");
            inner = react.createElement("span", null, "DeepSeek " + tt("empty"));
          }
        } else {
          title = state.error || tt("error");
          inner = react.createElement("span", { style: errStyle }, "DeepSeek --");
        }

        return react.createElement("div", { style: wrapStyle },
          react.createElement("button", {
            type: "button",
            style: chipStyle,
            title: title,
            onClick: onClick,
          },
            react.createElement("span", { style: labelStyle }, "DeepSeek"),
            inner
          )
        );
      }

      ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
        name: "conversation.composer.dock",
        id: "ds-balance",
        order: 1,
        locale: NS,
        label: () => "DeepSeek " + t("label"),
      }, BalanceView));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
