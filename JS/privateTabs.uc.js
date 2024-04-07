// ==UserScript==
// @name           Private Tabs
// @version        1.2.3
// @author         aminomancer,Ryan
// @homepage       https://github.com/aminomancer
// @description    Private Tabs 移植版，用于 Alice0775 的 userChrome.js Loader
//
// [Private Tab]: https://github.com/xiaoxiaoflood/firefox-scripts/blob/master/chrome/privateTab.uc.js
// @downloadURL    https://cdn.jsdelivr.net/gh/aminomancer/uc.css.js@master/JS/privateTabs.uc.js
// @updateURL      https://cdn.jsdelivr.net/gh/aminomancer/uc.css.js@master/JS/privateTabs.uc.js
// @license        This Source Code Form is subject to the terms of the Creative Commons Attribution-NonCommercial-ShareAlike International License, v. 4.0. If a copy of the CC BY-NC-SA 4.0 was not distributed with this file, You can obtain one at http://creativecommons.org/licenses/by-nc-sa/4.0/ or send a letter to Creative Commons, PO Box 1866, Mountain View, CA 94042, USA.
// @include        main
// @include        chrome://browser/content/places/bookmarksSidebar.xhtml
// @include        chrome://browser/content/places/historySidebar.xhtml
// @include        chrome://browser/content/places/places.xhtml
// ==/UserScript==
(function () {
    const SHARED_GLOBAL = {};
    Object.defineProperty(SHARED_GLOBAL, "widgetCallbacks", { value: new Map() });
    window.ptUtils = {
        get sharedGlobal() { return SHARED_GLOBAL },
        createElement: function (doc, tag, props, isHTML = false) {
            let el = isHTML ? doc.createElement(tag) : doc.createXULElement(tag);
            for (let prop in props) {
                el.setAttribute(prop, props[prop])
            }
            return el
        },
    }
    class PrivateTabManager {
        // user preferences. add these in about:config if you want them to persist
        // between script updates without having to reapply them.
        config = {
            // if you want to not record history but don't care about other data, maybe even want to keep private logins
            neverClearData: Services.prefs.getBoolPref(
                "privateTabs.neverClearData",
                false
            ),
            restoreTabsOnRestart: Services.prefs.getBoolPref(
                "privateTabs.restoreTabsOnRestart",
                true
            ),
            doNotClearDataUntilFxIsClosed: Services.prefs.getBoolPref(
                "privateTabs.doNotClearDataUntilFxIsClosed",
                true
            ),
            deleteContainerOnDisable: Services.prefs.getBoolPref(
                "privateTabs.deleteContainerOnDisable",
                false
            ),
            clearDataOnDisable: Services.prefs.getBoolPref(
                "privateTabs.clearDataOnDisable",
                false
            ),
            profileName: "无痕",

            // key for toggling private mode for the active tab. ctrl + alt + T by default.
            toggleHotkey: Services.prefs.getCharPref("privateTabs.toggleHotkey", "T"),

            // key for opening a new private tab. ctrl + alt + P by default.
            newTabHotkey: Services.prefs.getCharPref("privateTabs.newTabHotkey", "P"),

            // modifiers for toggle hotkey. this means alt+ctrl on windows or alt+cmd on mac
            toggleModifiers: Services.prefs.getCharPref(
                "privateTabs.toggleModifiers",
                "alt accel"
            ),

            // modifiers for new tab hotkey.
            newTabModifiers: Services.prefs.getCharPref(
                "privateTabs.newTabModifiers",
                "alt accel"
            ),
        };
        openTabs = new Set();
        BTN_ID = "privateTab-button";
        BTN2_ID = "newPrivateTab-button";
        constructor() {
            // the internal duplicateTab method doesn't pass the skipAnimation parameter
            // to addTrustedTab. so we need to make our own function, which requires us
            // to access some private objects.
            // eslint-disable-next-line mozilla/use-chromeutils-import
            let { SessionStoreInternal, TAB_CUSTOM_VALUES } = Cu.import(
                "resource:///modules/sessionstore/SessionStore.jsm"
            );
            this.SSI = SessionStoreInternal;
            this.TAB_CUSTOM_VALUES = TAB_CUSTOM_VALUES;
            XPCOMUtils.defineLazyModuleGetters(this, {
                Management: "resource://gre/modules/Extension.jsm",
                TabState: "resource:///modules/sessionstore/TabState.jsm",
                TabStateFlusher: "resource:///modules/sessionstore/TabStateFlusher.jsm",
                ContextualIdentityService:
                    "resource://gre/modules/ContextualIdentityService.jsm",
            });
            this.sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
                Ci.nsIStyleSheetService
            );
            this.menuClass =
                typeof window.gProton != "undefined"
                    ? ``
                    : `menuitem-iconic privatetab-icon`;
            this.orig_getAttribute = MozElements.MozTab.prototype.getAttribute;
            this.init();
            if (location.href != "chrome://browser/content/browser.xhtml") {
                return this.exec();
            }
            if (gBrowserInit.delayedStartupFinished) {
                this.exec();
            } else {
                let delayedListener = (subject, topic) => {
                    if (topic == "browser-delayed-startup-finished" && subject == window) {
                        Services.obs.removeObserver(delayedListener, topic);
                        this.exec();
                    }
                };
                Services.obs.addObserver(
                    delayedListener,
                    "browser-delayed-startup-finished"
                );
            }
        }

        exec() {
            if (PrivateBrowsingUtils.isWindowPrivate(window)) return;
            let openAll = document.getElementById(
                "placesContext_openBookmarkContainer:tabs"
            );
            let openAllPrivate = ptUtils.createElement(document, "menuitem", {
                id: "openAllPrivate",
                label: strtr("在%s标签中全部打开", this.config.profileName),
                accesskey: "v",
                class: this.menuClass,
                oncommand: `event.userContextId = ${this.container.userContextId
                    }; ${openAll.getAttribute("oncommand")}`,
                onclick: `event.userContextId = ${this.container.userContextId
                    }; ${openAll.getAttribute("onclick")}`,
            });
            openAll.after(openAllPrivate);

            let openAllLinks = document.getElementById("placesContext_openLinks:tabs");
            let openAllLinksPrivate = ptUtils.createElement(document, "menuitem", {
                id: "openAllLinksPrivate",
                label: strtr("在%s标签中全部打开", this.config.profileName),
                accesskey: "v",
                class: this.menuClass,
                oncommand: `event.userContextId = ${this.container.userContextId
                    }; ${openAllLinks.getAttribute("oncommand")}`,
                onclick: `event.userContextId = ${this.container.userContextId
                    }; ${openAllLinks.getAttribute("onclick")}`,
            });
            openAllLinks.after(openAllLinksPrivate);

            let openTab = document.getElementById("placesContext_open:newtab");
            let openPrivate = ptUtils.createElement(document, "menuitem", {
                id: "openPrivate",
                label: strtr("在%s标签中打开", this.config.profileName),
                accesskey: "v",
                class: this.menuClass,
                oncommand: `let view = event.target.parentElement._view; let url = view.selectedNode.uri; openLinkIn(url, "tab", { userContextId: privateTab.container.userContextId, triggeringPrincipal: /^(f|ht)tps?:/.test(url) ?
                Services.scriptSecurityManager.createNullPrincipal({}) :
                Services.scriptSecurityManager.getSystemPrincipal()});`,
            });
            openTab.after(openPrivate);

            document
                .getElementById("placesContext")
                .addEventListener("popupshowing", this);

            if (location.href != "chrome://browser/content/browser.xhtml") return;

            let keyset = ptUtils.createElement(document, "keyset", {
                id: "privateTab-keyset",
            });
            document.getElementById("mainKeyset").after(keyset);

            let toggleKey = ptUtils.createElement(document, "key", {
                id: "togglePrivateTab-key",
                modifiers: this.config.toggleModifiers,
                key: this.config.toggleHotkey,
                oncommand: "privateTab.togglePrivate()",
            });
            keyset.appendChild(toggleKey);

            let newPrivateTabKey = ptUtils.createElement(document, "key", {
                id: "newPrivateTab-key",
                modifiers: this.config.newTabModifiers,
                key: this.config.newTabHotkey,
                oncommand: "privateTab.BrowserOpenTabPrivate()",
            });
            keyset.appendChild(newPrivateTabKey);

            let menuOpenLink = ptUtils.createElement(document, "menuitem", {
                id: "menu_newPrivateTab",
                label: strtr("新建%s标签", this.config.profileName),
                accesskey: "v",
                acceltext: ShortcutUtils.prettifyShortcut(newPrivateTabKey),
                class: this.menuClass,
                oncommand: "privateTab.BrowserOpenTabPrivate()",
            });
            document.getElementById("menu_newNavigatorTab").after(menuOpenLink);

            let openLink = ptUtils.createElement(document, "menuitem", {
                id: "openLinkInPrivateTab",
                label: strtr("在%s标签中打开链接", this.config.profileName),
                accesskey: "v",
                class: this.menuClass,
                hidden: true,
                oncommand: `openLinkIn(gContextMenu.linkURL, "tab", gContextMenu._openLinkInParameters({ userContextId: privateTab.container.userContextId, triggeringPrincipal: document.nodePrincipal, }));`,
            });

            document
                .getElementById("contentAreaContextMenu")
                .addEventListener("popupshowing", this);
            document
                .getElementById("contentAreaContextMenu")
                .addEventListener("popuphidden", this);
            document.getElementById("context-openlinkintab").after(openLink);

            let toggleTab = ptUtils.createElement(document, "menuitem", {
                id: "toggleTabPrivateState",
                label: strtr("%s标签", this.config.profileName),
                type: "checkbox",
                accesskey: "v",
                acceltext: ShortcutUtils.prettifyShortcut(toggleKey),
                oncommand: "privateTab.togglePrivate(TabContextMenu.contextTab)",
            });
            document.getElementById("context_pinTab").after(toggleTab);
            document
                .getElementById("tabContextMenu")
                .addEventListener("popupshowing", this);

            let privateMask = document.getElementsByClassName(
                "private-browsing-indicator"
            )[0];
            privateMask.id = "private-mask";

            let btn2 = ptUtils.createElement(document, "toolbarbutton", {
                id: this.BTN2_ID,
                label: strtr("新建%s标签", this.config.profileName),
                tooltiptext: strtr(`新建一个%s标签 (${ShortcutUtils.prettifyShortcut(
                    newPrivateTabKey
                )})`, this.config.profileName),
                class: "toolbarbutton-1 chromeclass-toolbar-additional",
            });

            btn2.addEventListener("click", this);

            document.getElementById("tabs-newtab-button").after(btn2);

            gBrowser.tabContainer.addEventListener("TabSelect", this);

            addEventListener("XULFrameLoaderCreated", this);

            if (this.observePrivateTabs) {
                gBrowser.tabContainer.addEventListener("TabClose", this);
            }

            MozElements.MozTab.prototype.getAttribute = function (att) {
                if (att == "usercontextid" && this.isToggling) {
                    delete this.isToggling;
                    return window.privateTab.orig_getAttribute.call(this, att) ==
                        window.privateTab.container.userContextId
                        ? 0
                        : window.privateTab.container.userContextId;
                }
                return window.privateTab.orig_getAttribute.call(this, att);
            };

            customElements.get(
                "tabbrowser-tabs"
            ).prototype._updateNewTabVisibility = function () {
                let wrap = n =>
                    n.parentNode.localName == "toolbarpaletteitem" ? n.parentNode : n;
                let unwrap = n =>
                    n && n.localName == "toolbarpaletteitem" ? n.firstElementChild : n;

                let newTabFirst = false;
                let sibling = (id, otherId) => {
                    let sib = this;
                    do {
                        if (sib.id == "new-tab-button") newTabFirst = true;
                        sib = unwrap(wrap(sib).nextElementSibling);
                    } while (
                        sib &&
                        (sib.hidden || sib.id == "alltabs-button" || sib.id == otherId)
                    );
                    return sib?.id == id && sib;
                };

                const kAttr = "hasadjacentnewtabbutton";
                let adjacentNewTab = sibling("new-tab-button", window.privateTab.BTN_ID);
                if (adjacentNewTab) {
                    this.setAttribute(kAttr, "true");
                } else {
                    this.removeAttribute(kAttr);
                }

                const kAttr2 = "hasadjacentnewprivatetabbutton";
                let adjacentPrivateTab = sibling(
                    window.privateTab.BTN_ID,
                    "new-tab-button"
                );
                if (adjacentPrivateTab) {
                    this.setAttribute(kAttr2, "true");
                } else {
                    this.removeAttribute(kAttr2);
                }

                if (adjacentNewTab && adjacentPrivateTab) {
                    let doc = adjacentPrivateTab.ownerDocument;
                    if (newTabFirst) {
                        doc
                            .getElementById("tabs-newtab-button")
                            .after(doc.getElementById(window.privateTab.BTN2_ID));
                    } else {
                        doc
                            .getElementById(window.privateTab.BTN2_ID)
                            .after(doc.getElementById("tabs-newtab-button"));
                    }
                }
            };
            gBrowser.tabContainer._updateNewTabVisibility();
            if (!(CustomizableUI.getWidget(this.BTN_ID) && CustomizableUI.getWidget(this.BTN_ID).forWindow(window)?.node)) {
                CustomizableUI.createWidget({
                    id: this.BTN_ID,
                    type: "custom",
                    defaultArea: CustomizableUI.AREA_NAVBAR,
                    showInPrivateBrowsing: false,
                    onBuild: doc => {
                        let btn = ptUtils.createElement(doc, "toolbarbutton", {
                            id: this.BTN_ID,
                            label: strtr("新建%s标签", this.config.profileName),
                            tooltiptext: strtr(`新建一个%s标签 (${ShortcutUtils.prettifyShortcut(
                                newPrivateTabKey
                            )})`, this.config.profileName),
                            class: "toolbarbutton-1 chromeclass-toolbar-additional",
                            oncommand: "privateTab.BrowserOpenTabPrivate()",
                        });

                        return btn;
                    },
                });
            }
        }

        init() {
            const CustomizableUI = globalThis.CustomizableUI || Cu.import("resource:///modules/CustomizableUI.jsm").CustomizableUI;
            this.ContextualIdentityService.ensureDataReady();
            this.container = this.ContextualIdentityService._identities.find(
                container => container.name == this.config.profileName
            );
            if (!this.container) {
                this.ContextualIdentityService.create(this.config.profileName, "fingerprint", "purple");
                this.container = this.ContextualIdentityService._identities.find(
                    container => container.name == this.config.profileName
                );
            } else if (!this.config.neverClearData) {
                this.clearData();
            }

            this.setStyle();
            this.sss.loadAndRegisterSheet(this.STYLE.url, this.STYLE.type);

            CustomizableUI.addListener(this);

            const { WebExtensionPolicy } = Cu.getGlobalForObject(Services);
            let TST_ID = "treestyletab@piro.sakura.ne.jp";
            this.setTstStyle(WebExtensionPolicy.getByID(TST_ID)?.getURL());
            if (location.href === "chrome://browser/content/browser.xhtml") {
                this.Management.on("ready", (_ev, extension) => {
                    if (extension.id === TST_ID) this.setTstStyle(extension.getURL());
                });
                this.Management.on("uninstall", (_ev, extension) => {
                    if (extension.id === TST_ID && this.TST_STYLE) {
                        this.sss.unregisterSheet(this.TST_STYLE.uri, this.TST_STYLE.type);
                    }
                });
            }

            if (!this.config.neverClearData) {
                Services.obs.addObserver(this, "quit-application-granted");
            }
        }

        observe(sub, top, data) {
            this.clearData();
            if (!this.config.restoreTabsOnRestart) this.closeTabs();
        }

        clearData() {
            Services.clearData.deleteDataFromOriginAttributesPattern({
                userContextId: this.container.userContextId,
            });
        }

        closeTabs() {
            this.ContextualIdentityService._forEachContainerTab((tab, tabbrowser) => {
                if (tab.userContextId == this.container.userContextId) {
                    tabbrowser.removeTab(tab);
                }
            });
        }

        duplicateTab(tab, { index, inBackground }) {
            // Create a new tab.
            let userContextId = tab.getAttribute("usercontextid");

            let tabOptions = {
                userContextId,
                index,
                skipAnimation: true,
                ...(tab == gBrowser.selectedTab
                    ? { relatedToCurrent: true, ownerTab: tab }
                    : {}),
                skipLoad: true,
                preferredRemoteType: tab.linkedBrowser.remoteType,
            };
            let newTab = gBrowser.addTrustedTab(null, tabOptions);

            // Start the throbber to pretend we're doing something while actually
            // waiting for data from the frame script. This throbber is disabled
            // if the URI is a local about: URI.
            let uriObj = tab.linkedBrowser.currentURI;
            if (!uriObj || (uriObj && !uriObj.schemeIs("about"))) {
                newTab.setAttribute("busy", "true");
            }

            // Hack to ensure that the about:home, about:newtab, and about:welcome
            // favicon is loaded instantaneously, to avoid flickering and improve
            // perceived performance.
            gBrowser.setDefaultIcon(newTab, uriObj);

            // Collect state before flushing.
            let tabState = this.TabState.collect(tab, this.TAB_CUSTOM_VALUES.get(tab));

            // Flush to get the latest tab state to duplicate.
            let browser = tab.linkedBrowser;
            this.TabStateFlusher.flush(browser).then(() => {
                // The new tab might have been closed in the meantime.
                if (newTab.closing || !newTab.linkedBrowser) return;

                let window = newTab.ownerGlobal;

                // The tab or its window might be gone.
                if (!window || !window.__SSi) return;

                // Update state with flushed data. We can't use TabState.clone() here as
                // the tab to duplicate may have already been closed. In that case we only
                // have access to the <xul:browser>.
                let options = { includePrivateData: true };
                this.TabState.copyFromCache(browser.permanentKey, tabState, options);

                tabState.index += 0;
                tabState.index = Math.max(
                    1,
                    Math.min(tabState.index, tabState.entries.length)
                );
                tabState.pinned = false;

                if (!inBackground) gBrowser.selectedTab = newTab;

                // Restore the state into the new tab.
                this.SSI.restoreTab(newTab, tabState, {
                    restoreImmediately: true,
                });
            });

            return newTab;
        }

        togglePrivate(tab = gBrowser.selectedTab) {
            tab.isToggling = true;
            let shouldSelect = tab == gBrowser.selectedTab;
            this.duplicateTab(tab, {
                index: shouldSelect ? tab._tPos + 1 : tab._tPos,
                inBackground: !shouldSelect,
            });
            if (shouldSelect && gURLBar.focused) gURLBar.focus();
            gBrowser.removeTab(tab, { animate: false, closeWindowWithLastTab: false });
        }

        toggleMask() {
            let privateMask = document.getElementById("private-mask");
            if (gBrowser.selectedTab.isToggling) {
                privateMask.setAttribute(
                    "enabled",
                    gBrowser.selectedTab.userContextId == this.container.userContextId
                        ? "false"
                        : "true"
                );
            } else {
                privateMask.setAttribute(
                    "enabled",
                    gBrowser.selectedTab.userContextId == this.container.userContextId
                        ? "true"
                        : "false"
                );
            }
        }

        BrowserOpenTabPrivate() {
            openTrustedLinkIn(BROWSER_NEW_TAB_URL, "tab", {
                userContextId: this.container.userContextId,
            });
        }

        isPrivate(tab) {
            return tab.getAttribute("usercontextid") == this.container.userContextId;
        }

        contentContext(_e) {
            let tab = gBrowser.getTabForBrowser(gContextMenu.browser) || gBrowser.selectedTab;
            gContextMenu.showItem(
                "openLinkInPrivateTab",
                gContextMenu.onSaveableLink || gContextMenu.onPlainTextLink
            );
            if (this.isPrivate(tab)) {
                gContextMenu.showItem("context-openlinkincontainertab", false);
            }
        }

        hideContext(_e) {
            document.getElementById("openLinkInPrivateTab").hidden = true;
        }

        tabContext(_e) {
            document
                .getElementById("toggleTabPrivateState")
                .setAttribute(
                    "checked",
                    TabContextMenu.contextTab.userContextId == this.container.userContextId
                );
        }

        placesContext(_e) {
            document.getElementById("openPrivate").disabled = document.getElementById(
                "placesContext_open:newtab"
            ).disabled;
            document.getElementById("openPrivate").hidden = document.getElementById(
                "placesContext_open:newtab"
            ).hidden;
            document.getElementById(
                "openAllPrivate"
            ).disabled = document.getElementById(
                "placesContext_openBookmarkContainer:tabs"
            ).disabled;
            document.getElementById("openAllPrivate").hidden = document.getElementById(
                "placesContext_openBookmarkContainer:tabs"
            ).hidden;
            document.getElementById(
                "openAllLinksPrivate"
            ).disabled = document.getElementById(
                "placesContext_openLinks:tabs"
            ).disabled;
            document.getElementById(
                "openAllLinksPrivate"
            ).hidden = document.getElementById("placesContext_openLinks:tabs").hidden;
        }

        handleEvent(e) {
            switch (e.type) {
                case "TabSelect":
                    this.onTabSelect(e);
                    break;
                case "TabClose":
                    this.onTabClose(e);
                    break;
                case "XULFrameLoaderCreated":
                    this.privateListener(e);
                    break;
                case "popupshowing":
                    if (e.target === document.getElementById("placesContext")) {
                        this.placesContext(e);
                    }
                    if (e.target === document.getElementById("contentAreaContextMenu")) {
                        this.contentContext(e);
                    }
                    if (e.target === document.getElementById("tabContextMenu")) {
                        this.tabContext(e);
                    }
                    break;
                case "popuphidden":
                    if (e.target === document.getElementById("contentAreaContextMenu")) {
                        this.hideContext(e);
                    }
                    break;
                case "click":
                    if (e.button == 0) {
                        this.BrowserOpenTabPrivate();
                    } else if (e.button == 2) {
                        document.popupNode = document.getElementById(this.BTN_ID);
                        document
                            .getElementById("toolbar-context-menu")
                            .openPopup(this, "after_start", 14, -10, false, false);
                        document.getElementsByClassName(
                            "customize-context-removeFromToolbar"
                        )[0].disabled = false;
                        document.getElementsByClassName(
                            "customize-context-moveToPanel"
                        )[0].disabled = false;
                        e.preventDefault();
                    }
                    break;
            }
        }

        privateListener(e) {
            let browser = e.target;
            let tab = gBrowser.getTabForBrowser(browser);
            if (!tab) return;
            let isPrivate = this.isPrivate(tab);

            if (!isPrivate) {
                if (this.observePrivateTabs) {
                    this.openTabs.delete(tab);
                    if (!this.openTabs.size) this.clearData();
                }
                return;
            }

            if (this.observePrivateTabs) this.openTabs.add(tab);

            browser.browsingContext.useGlobalHistory = false;
        }

        onTabSelect(e) {
            if (e.target.userContextId != e.detail.previousTab.userContextId) {
                this.toggleMask();
            }
        }

        onTabClose(e) {
            if (this.isPrivate(e.target)) {
                this.openTabs.delete(e.target);
                if (!this.openTabs.size) this.clearData();
            }
        }

        onWidgetAfterCreation(id) {
            if (id == this.BTN_ID) {
                let newTabPlacement = CustomizableUI.getPlacementOfWidget(
                    "new-tab-button"
                )?.position;
                if (newTabPlacement) {
                    CustomizableUI.addWidgetToArea(
                        this.BTN_ID,
                        CustomizableUI.AREA_TABSTRIP,
                        newTabPlacement + 1
                    );
                }
                gBrowser.tabContainer._updateNewTabVisibility();
                CustomizableUI.removeListener(this);
            }
        }

        get observePrivateTabs() {
            return (
                this._observePrivateTabs ||
                (this._observePrivateTabs =
                    !this.config.neverClearData &&
                    !this.config.doNotClearDataUntilFxIsClosed)
            );
        }

        setStyle() {
            this.STYLE = {
                url: Services.io.newURI(
                    `data:text/css;charset=UTF-8,${encodeURIComponent(
                        `.privatetab-icon, #${this.BTN_ID}, #${this.BTN2_ID} { list-style-image: url(chrome://browser/skin/privateBrowsing.svg) !important; fill: currentColor; -moz-context-properties: fill; } @-moz-document url('chrome://browser/content/browser.xhtml') { #private-mask[enabled="true"] { display: block !important; } #tabbrowser-tabs[hasadjacentnewprivatetabbutton]:not([overflow="true"]) ~ #${this.BTN_ID}, #tabbrowser-tabs[overflow="true"] > #tabbrowser-arrowscrollbox > #tabbrowser-arrowscrollbox-periphery > #${this.BTN2_ID}, #tabbrowser-tabs:not([hasadjacentnewprivatetabbutton]) > #tabbrowser-arrowscrollbox > #tabbrowser-arrowscrollbox-periphery > #${this.BTN2_ID}, #TabsToolbar[customizing="true"] #${this.BTN2_ID} { display: none; } .tabbrowser-tab[usercontextid="${this.container.userContextId}"] .tab-label { text-decoration: underline !important; text-decoration-color: -moz-nativehyperlinktext !important; text-decoration-style: dashed !important; } .tabbrowser-tab[usercontextid="${this.container.userContextId}"][pinned] .tab-icon-image, .tabbrowser-tab[usercontextid="${this.container.userContextId}"][pinned] .tab-throbber { border-bottom: 1px dashed -moz-nativehyperlinktext !important; }}`
                    )}`
                ),
                type: this.sss.USER_SHEET,
            };
        }

        setTstStyle(baseURL) {
            if (!baseURL) return;
            this.TST_STYLE = {
                uri: Services.io.newURI(
                    `data:text/css;charset=UTF-8,${encodeURIComponent(
                        `@-moz-document url-prefix(${baseURL}sidebar/sidebar.html) { .tab.contextual-identity-firefox-container-${this.container.userContextId} .label-content { text-decoration: underline !important; text-decoration-color: -moz-nativehyperlinktext !important; text-decoration-style: dashed !important; } .tab.contextual-identity-firefox-container-${this.container.userContextId} tab-favicon { border-bottom: 1px dashed -moz-nativehyperlinktext !important;}}`
                    )}`
                ),
                type: this.sss.USER_SHEET,
            };
            if (!this.sss.sheetRegistered(this.TST_STYLE.uri, this.TST_STYLE.type)) {
                this.sss.loadAndRegisterSheet(this.TST_STYLE.uri, this.TST_STYLE.type);
            }
        }
    }

    function strtr() {
        let str = arguments[0];
        if (str) {
            for (let i = 1; i < arguments.length; i++) {
                str = str.replace("%s", arguments[i]);
            }
            return str;
        } else return "";
    }

    window.privateTab = new PrivateTabManager();
})()
