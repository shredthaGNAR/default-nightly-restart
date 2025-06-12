// ==UserScript==
// @name            Private Tabs (Fixed)
// @version         1.5.0
// @author          aminomancer, fixed by Gemini
// @homepage        https://github.com/aminomancer
// @description     An fx-autoconfig port of [Private Tab](https://github.com/xiaoxiaoflood/firefox-scripts/blob/master/chrome/privateTab.uc.js) by xiaoxiaoflood. Adds buttons and menu items allowing you to open a "private tab" in nearly any circumstance in which you'd be able to open a normal tab. Instead of opening a link in a private window, you can open it in a private tab instead. This will use a special container and prevent history storage, depending on user configuration. You can also toggle tabs back and forth between private and normal mode. This script adds two hotkeys: Ctrl+Alt+P to open a new private tab, and Ctrl+Alt+T to toggle private mode for the active tab. These hotkeys can be configured along with several other options at the top of the script file.
// @downloadURL     https://cdn.jsdelivr.net/gh/aminomancer/uc.css.js@master/JS/privateTabs.uc.js
// @updateURL       https://cdn.jsdelivr.net/gh/aminomancer/uc.css.js@master/JS/privateTabs.uc.js
// @license         This Source Code Form is subject to the terms of the Creative Commons Attribution-NonCommercial-ShareAlike International License, v. 4.0. If a copy of the CC BY-NC-SA 4.0 was not distributed with this file, You can obtain one at http://creativecommons.org/licenses/by-nc-sa/4.0/ or send a letter to Creative Commons, PO Box 1866, Mountain View, CA 94042, USA.
// @include         main
// @include         chrome://browser/content/places/bookmarksSidebar.xhtml
// @include         chrome://browser/content/places/historySidebar.xhtml
// @include         chrome://browser/content/places/places.xhtml
// ==/UserScript==

class PrivateTabManager {
  // User preferences. Set these in about:config for persistence.
  // The prefix is "privateTabs." e.g., "privateTabs.neverClearData"
  defaultPrefs = [
    ["neverClearData", false],
    ["restoreTabsOnRestart", true],
    ["doNotClearDataUntilFxIsClosed", true],
    ["deleteContainerOnDisable", false],
    ["clearDataOnDisable", false],
    ["toggleHotkey", "T"],
    ["newTabHotkey", "P"],
    ["toggleModifiers", "alt accel"],
    ["newTabModifiers", "alt accel"],
  ];

  constructor() {
    // Import modern ES modules
    const { ContextualIdentityService } = ChromeUtils.importESModule(
      "resource://gre/modules/ContextualIdentityService.sys.mjs"
    );
    const { SessionStore } = ChromeUtils.importESModule(
      "resource:///modules/sessionstore/SessionStore.jsm"
    );
    const { Management } = ChromeUtils.importESModule(
      "resource://gre/modules/Extension.sys.mjs"
    );

    this.ContextualIdentityService = ContextualIdentityService;
    this.SessionStore = SessionStore;
    this.Management = Management;
    this.config = {};
    this.openTabs = new Set();
    this.BTN_ID = "privateTab-button";
    this.BTN2_ID = "newPrivateTab-button";

    this.setupPrefs();
    this.init();

    if (location.href !== "chrome://browser/content/browser.xhtml") {
      this.exec();
    } else {
      if (gBrowserInit.delayedStartupFinished) {
        this.exec();
      } else {
        let delayedListener = (subject, topic) => {
          if (topic == "browser-delayed-startup-finished" && subject == window) {
            Services.obs.removeObserver(delayedListener, topic);
            this.exec();
          }
        };
        Services.obs.addObserver(delayedListener, "browser-delayed-startup-finished");
      }
    }
  }

  setupPrefs() {
    let defaultBranch = Services.prefs.getDefaultBranch("privateTabs.");
    for (let [name, value] of this.defaultPrefs) {
      let prefName = `privateTabs.${name}`;
      XPCOMUtils.defineLazyPreferenceGetter(this.config, name, prefName, value);
      switch (typeof value) {
        case "boolean":
          defaultBranch.setBoolPref(name, value);
          break;
        case "number":
          defaultBranch.setIntPref(name, value);
          break;
        case "string":
          defaultBranch.setStringPref(name, value);
          break;
      }
    }
  }
  
  // Helper to create elements without external dependencies
  createElement(doc, tag, attrs, parent) {
      let element = doc.createElement(tag);
      for (let [key, value] of Object.entries(attrs)) {
          element.setAttribute(key, value);
      }
      if (parent) {
          parent.appendChild(element);
      }
      return element;
  }

  async exec() {
    if (PrivateBrowseUtils.isWindowPrivate(window)) return;
    
    // Create menu items for Places (Bookmarks/History)
    let openAll = document.getElementById("placesContext_openBookmarkContainer:tabs");
    if (openAll) {
      let openAllPrivate = this.createElement(document, "menuitem", {
        id: "openAllPrivate",
        label: "Open All in Private Tabs",
        accesskey: "v",
        "selection-type": "single|none",
        "node-type": "folder|query_tag",
      });
      openAll.after(openAllPrivate);
      openAllPrivate.addEventListener("command", e => this.openPlacesSelection(e));
    }

    let openAllLinks = document.getElementById("placesContext_openLinks:tabs");
    if (openAllLinks) {
        let openAllLinksPrivate = this.createElement(document, "menuitem", {
            id: "openAllLinksPrivate",
            label: "Open All in Private Tabs",
            accesskey: "v",
            "selection-type": "multiple",
            "node-type": "link",
            "hide-if-node-type": "link_bookmark",
        });
        openAllLinks.after(openAllLinksPrivate);
        openAllLinksPrivate.addEventListener("command", e => this.openPlacesSelection(e));
    }

    let openTab = document.getElementById("placesContext_open:newtab");
    if (openTab) {
        let openPrivate = this.createElement(document, "menuitem", {
            id: "openPrivate",
            label: "Open in a New Private Tab",
            accesskey: "v",
            "selection-type": "single",
            "node-type": "link",
        });
        openTab.after(openPrivate);
        openPrivate.addEventListener("command", e => this.openPlacesSelection(e, true));
    }

    document.getElementById("placesContext")?.addEventListener("popupshowing", this);

    if (location.href !== "chrome://browser/content/browser.xhtml") return;

    // Hotkeys setup using standard <key> elements
    let keyset = document.getElementById("mainKeyset");
    this.createElement(keyset, "key", {
        id: "togglePrivateTab-key",
        modifiers: this.config.toggleModifiers,
        key: this.config.toggleHotkey,
        oncommand: "window.privateTab.togglePrivate();"
    });
    this.createElement(keyset, "key", {
        id: "newPrivateTab-key",
        modifiers: this.config.newTabModifiers,
        key: this.config.newTabHotkey,
        oncommand: "window.privateTab.BrowserOpenTabPrivate();"
    });
    
    // Main browser menu item
    let menuOpenLink = this.createElement(document, "menuitem", {
        id: "menu_newPrivateTab",
        label: "New Private Tab",
        accesskey: "v",
        acceltext: ShortcutUtils.prettifyShortcut(document.getElementById("newPrivateTab-key")),
    });
    document.getElementById("menu_newNavigatorTab").after(menuOpenLink);
    menuOpenLink.addEventListener("command", () => this.BrowserOpenTabPrivate());

    // Content area context menu item
    let openLink = this.createElement(document, "menuitem", {
        id: "openLinkInPrivateTab",
        label: "Open Link in New Private Tab",
        accesskey: "v",
        hidden: true,
    });
    openLink.addEventListener("command", () => {
        openLinkIn(gContextMenu.linkURL, "tab", {
            userContextId: this.container.userContextId,
            triggeringPrincipal: gContextMenu.triggeringPrincipal,
        });
    });
    document.getElementById("context-openlinkintab").after(openLink);

    // Tab context menu item
    let toggleTab = this.createElement(document, "menuitem", {
        id: "toggleTabPrivateState",
        label: "Private Tab",
        type: "checkbox",
        accesskey: "v",
        acceltext: ShortcutUtils.prettifyShortcut(document.getElementById("togglePrivateTab-key")),
    });
    document.getElementById("context_pinTab").after(toggleTab);
    toggleTab.addEventListener("command", () => this.togglePrivate(TabContextMenu.contextTab));
    
    // Add event listeners
    document.getElementById("contentAreaContextMenu").addEventListener("popupshowing", this);
    document.getElementById("tabContextMenu").addEventListener("popupshowing", this);

    let privateMask = document.querySelector(".private-Browse-indicator-with-label");
    privateMask?.classList.add("private-mask");
    
    // New private tab button on tab bar
    let btn2 = this.createElement(document, "toolbarbutton", {
        id: this.BTN2_ID,
        label: "New Private Tab",
        tooltiptext: `Open a new private tab (${ShortcutUtils.prettifyShortcut(document.getElementById("newPrivateTab-key"))})`,
        class: "toolbarbutton-1 chromeclass-toolbar-additional",
    });
    btn2.addEventListener("click", (e) => this.handleEvent(e));
    document.getElementById("tabs-newtab-button").after(btn2);

    gBrowser.tabContainer.addEventListener("TabSelect", this);
    addEventListener("XULFrameLoaderCreated", this);
    if (this.observePrivateTabs) {
        gBrowser.tabContainer.addEventListener("TabClose", this);
    }
    
    // Create the main toolbar button if it doesn't exist
    if (!Services.ppmm.sharedData.get("uc_privateTabs_widget_created")) {
      CustomizableUI.createWidget({
        id: this.BTN_ID,
        type: "button",
        defaultArea: CustomizableUI.AREA_NAVBAR,
        showInPrivateBrowse: false,
        label: "New Private Tab",
        tooltiptext: `Open a new private tab (${ShortcutUtils.prettifyShortcut(document.getElementById("newPrivateTab-key"))})`,
        onCommand: (e) => e.target.ownerGlobal.privateTab.BrowserOpenTabPrivate(),
      });
      Services.ppmm.sharedData.set("uc_privateTabs_widget_created", true);
    }
  }

  init() {
    this.ContextualIdentityService.ensureDataReady();
    this.container = this.ContextualIdentityService.getPublicIdentities().find(
      (container) => container.name == "Private"
    );
    if (!this.container) {
      this.ContextualIdentityService.create("Private", "fingerprint", "purple");
      this.container = this.ContextualIdentityService.getPublicIdentities().find(
        (container) => container.name == "Private"
      );
    } else if (!this.config.neverClearData) {
      this.clearData();
    }
    
    this.sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
    let style = {
      url: Services.io.newURI(
        `data:text/css;charset=UTF-8,${encodeURIComponent(
          `
          #${this.BTN_ID}, #${this.BTN2_ID} { 
            list-style-image: url(chrome://browser/skin/privateBrowse.svg) !important; 
          }
          #privateTab-button .toolbarbutton-icon, #${this.BTN2_ID} .toolbarbutton-icon {
            fill: currentColor !important;
          }
          .private-mask[enabled="true"] { 
            display: flex !important; 
          }
          .private-mask:not([enabled="true"]) { 
            display: none !important; 
          }
          .tabbrowser-tab[usercontextid="${this.container?.userContextId}"] .tab-label { 
            text-decoration: underline !important; 
            text-decoration-color: -moz-nativehyperlinktext !important; 
            text-decoration-style: dashed !important; 
          }
          .tabbrowser-tab[usercontextid="${this.container?.userContextId}"][pinned] .tab-icon-image, 
          .tabbrowser-tab[usercontextid="${this.container?.userContextId}"][pinned] .tab-throbber { 
            border-bottom: 1px dashed -moz-nativehyperlinktext !important; 
          }
          `
        )}`
      ),
      type: this.sss.USER_SHEET,
    };
    if (!this.sss.sheetRegistered(style.url, style.type)) {
      this.sss.loadAndRegisterSheet(style.url, style.type);
    }
    
    // TST Integration
    const TST_ID = "treestyletab@piro.sakura.ne.jp";
    this.Management.get(TST_ID).then(ext => {
      if (ext) this.setTstStyle(ext.getURL());
    });
    this.Management.on("ready", (_ev, extension) => {
      if (extension.id === TST_ID) this.setTstStyle(extension.getURL());
    });
    this.Management.on("uninstall", (_ev, extension) => {
      if (extension.id === TST_ID && this.TST_STYLE) {
        this.sss.unregisterSheet(this.TST_STYLE.uri, this.TST_STYLE.type);
      }
    });

    if (!this.config.neverClearData) {
      Services.obs.addObserver(this, "quit-application-granted");
    }
  }

  observe(sub, top, data) {
    if (top === "quit-application-granted") {
        this.clearData();
        if (!this.config.restoreTabsOnRestart) this.closeTabs();
    }
  }

  clearData() {
    Services.clearData.deleteDataFromOriginAttributesPattern({
      userContextId: this.container.userContextId,
    });
  }

  closeTabs() {
    for (const tab of gBrowser.tabs) {
        if (tab.userContextId === this.container.userContextId) {
            gBrowser.removeTab(tab);
        }
    }
  }

  togglePrivate(tab = gBrowser.selectedTab) {
    if (!tab) return;
    let isPrivate = this.isPrivate(tab);
    let newContextId = isPrivate ? 0 : this.container.userContextId;
    let shouldSelect = tab === gBrowser.selectedTab;

    // Use the modern SessionStore API to duplicate the tab into a new container
    this.SessionStore.duplicateTab(window, tab, {
      index: tab._tPos + 1,
      userContextId: newContextId,
      selected: shouldSelect,
    });

    gBrowser.removeTab(tab, { animate: false, closeWindowWithLastTab: false });
    if (shouldSelect && gURLBar.focused) gURLBar.focus();
  }

  toggleMask() {
    let privateMask = document.querySelector(".private-mask");
    if (!privateMask) return;
    let enabled = this.isPrivate(gBrowser.selectedTab) ? "true" : "false";
    privateMask.setAttribute("enabled", enabled);
  }

  BrowserOpenTabPrivate() {
    openTrustedLinkIn(BROWSER_NEW_TAB_URL, "tab", {
      userContextId: this.container.userContextId,
    });
  }

  isPrivate(tab) {
    return tab && tab.userContextId === this.container.userContextId;
  }
  
  openPlacesSelection(e, single = false) {
      let view = e.target.parentElement._view;
      let userContextId = this.container.userContextId;

      if (single) {
          PlacesUIUtils.openNodeWithDefaults(view.selectedNode, {
              userContextId
          });
          return;
      }
      
      let items = view.selectedNodes;
      for (const node of items) {
          if (node.uri) {
              openLinkIn(node.uri, "tab", {
                  userContextId,
                  triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
              });
          }
      }
  }

  handleEvent(e) {
    switch (e.type) {
      case "TabSelect":
        this.toggleMask();
        break;
      case "TabClose":
        this.onTabClose(e);
        break;
      case "XULFrameLoaderCreated":
        this.privateListener(e);
        break;
      case "popupshowing":
        if (e.target.id === "placesContext") this.placesContext(e);
        if (e.target.id === "contentAreaContextMenu") this.contentContext(e);
        if (e.target.id === "tabContextMenu") this.tabContext(e);
        break;
      case "click":
        if (e.button == 0) this.BrowserOpenTabPrivate();
        break;
    }
  }

  privateListener(e) {
    let browser = e.target;
    let tab = gBrowser.getTabForBrowser(browser);
    if (!tab) return;

    if (this.isPrivate(tab)) {
      if (this.observePrivateTabs) this.openTabs.add(tab);
      browser.BrowseContext.useGlobalHistory = false;
    } else {
      if (this.observePrivateTabs) {
        this.openTabs.delete(tab);
        if (!this.openTabs.size) this.clearData();
      }
    }
  }

  onTabClose(e) {
    if (this.isPrivate(e.target)) {
      this.openTabs.delete(e.target);
      if (!this.openTabs.size) this.clearData();
    }
  }

  contentContext(e) {
    gContextMenu.showItem("openLinkInPrivateTab", gContextMenu.onLink);
  }

  tabContext(e) {
    let toggleItem = document.getElementById("toggleTabPrivateState");
    toggleItem.setAttribute("checked", this.isPrivate(TabContextMenu.contextTab));
  }

  placesContext(e) {
    let view = e.currentTarget._view;
    let isSingleLink = view.selection.count == 1 && view.selectedNode.uri;
    document.getElementById("openPrivate").hidden = !isSingleLink;
    let isContainer = view.selectedNode?.type == view.node.RESULT_TYPE_FOLDER;
    document.getElementById("openAllPrivate").hidden = !isContainer;
    document.getElementById("openAllLinksPrivate").hidden = !(view.selection.count > 1);
  }

  get observePrivateTabs() {
    return (
      this._observePrivateTabs ??
      (this._observePrivateTabs =
        !this.config.neverClearData && !this.config.doNotClearDataUntilFxIsClosed)
    );
  }

  setTstStyle(baseURL) {
    if (!baseURL) return;
    this.TST_STYLE = {
      uri: Services.io.newURI(
        `data:text/css;charset=UTF-8,${encodeURIComponent(
          `@-moz-document url-prefix(${baseURL}sidebar/sidebar.html) { 
            .tab.contextual-identity-firefox-container-${this.container.userContextId} .label-content { 
              text-decoration: underline !important; 
              text-decoration-color: -moz-nativehyperlinktext !important; 
              text-decoration-style: dashed !important; 
            } 
            .tab.contextual-identity-firefox-container-${this.container.userContextId} .favicon { 
              border-bottom: 1px dashed -moz-nativehyperlinktext !important;
            }
          }`
        )}`
      ),
      type: this.sss.USER_SHEET,
    };
    if (!this.sss.sheetRegistered(this.TST_STYLE.uri, this.TST_STYLE.type)) {
      this.sss.loadAndRegisterSheet(this.TST_STYLE.uri, this.TST_STYLE.type);
    }
  }
}

if (typeof window.privateTab === "undefined") {
  window.privateTab = new PrivateTabManager();
}