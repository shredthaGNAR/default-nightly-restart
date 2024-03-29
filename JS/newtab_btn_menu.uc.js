/* Firefox userChrome script
 * Open URL in clipboard by right-clicking new-tab-button then use context menu
 * Tested on Firefox 115
 * Author: garywill (https://garywill.github.io)
 */

// ==UserScript==
// @include         main
// ==/UserScript==

console.log("newtab_btn_menu.js");

const new_tab_url_label = 'New tab open: ';
var btn_newtab_w_url_clipboard_str = "";

// https://searchfox.org/mozilla-central/source/browser/base/content/browser.js#3076
// https://udn.realityripple.com/docs/Mozilla/Tech/XPCOM/Using_the_clipboard
// https://udn.realityripple.com/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsITransferable
function _readFromClipboard() {
    var url = "";
    
    try {
        var trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(
            Ci.nsITransferable
        );
        trans.init(getLoadContext());

        trans.addDataFlavor("text/plain");

        // If available, use selection clipboard, otherwise global one
        // if (Services.clipboard.supportsSelectionClipboard()) {
        if (false) {
            Services.clipboard.getData(trans, Services.clipboard.kSelectionClipboard);
        } else {
            Services.clipboard.getData(trans, Services.clipboard.kGlobalClipboard);
        }

        var data = {};
        trans.getTransferData("text/plain", data);

        if (data) {
            data = data.value.QueryInterface(Ci.nsISupportsString);
            url = data.data;
        }
    }catch(err) { console.error("Error when trying to get clipboard content from system"); }
    
    return url;
}
function btn_newtab_w_url_click()
{
    gBrowser.loadTabs([btn_newtab_w_url_clipboard_str] , {
        inBackground: false,
        relatedToCurrent: false,
        triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({}) //FF63
    });
}
function newtabbtnContextMenu_onpopupshowing(event)
{
    btn_newtab_w_url_clipboard_str = _readFromClipboard();
    if (document.getElementById("btn_newtab_w_url"))
    {
        document.getElementById("btn_newtab_w_url").setAttribute("label", new_tab_url_label + btn_newtab_w_url_clipboard_str);
        document.getElementById("btn_newtab_w_url").setAttribute("tooltiptext", new_tab_url_label + btn_newtab_w_url_clipboard_str);
    }
    if (document.getElementById("btn_newtab_w_url_2"))
    {
        document.getElementById("btn_newtab_w_url_2").setAttribute("label", new_tab_url_label + btn_newtab_w_url_clipboard_str);
        document.getElementById("btn_newtab_w_url_2").setAttribute("tooltiptext", new_tab_url_label + btn_newtab_w_url_clipboard_str);
    }

}

(() => {
    
    var newtabbtnContextMenu = document.createXULElement("menupopup");
    newtabbtnContextMenu.id = "newtabbtnContextMenu";
    newtabbtnContextMenu.setAttribute("onpopupshowing","newtabbtnContextMenu_onpopupshowing(event)");


    var btn_newtab = document.createXULElement("menuitem");
    btn_newtab.setAttribute("label", 'New tab');
    btn_newtab.setAttribute("oncommand", "BrowserOpenTab()");

    newtabbtnContextMenu.appendChild(btn_newtab);


    var btn_newtab_w_url = document.createXULElement("menuitem");
    btn_newtab_w_url.id = "btn_newtab_w_url";
    btn_newtab_w_url.setAttribute("label", new_tab_url_label);
    btn_newtab_w_url.setAttribute("oncommand", "btn_newtab_w_url_click()");

    newtabbtnContextMenu.appendChild(btn_newtab_w_url);


    document.getElementById("mainPopupSet").appendChild(newtabbtnContextMenu);

    
    const tabs_newtab_button = document.getElementById("tabs-newtab-button");
    var observer1 = new MutationObserver(function(){
        observer1.disconnect();
        tabs_newtab_button.setAttribute("context","newtabbtnContextMenu");
    });
    observer1.observe(tabs_newtab_button,{attributes:true});
    
    
    const new_tab_button = document.getElementById("new-tab-button");
    var observer2 = new MutationObserver(function(){
        observer2.disconnect();
        new_tab_button.setAttribute("context","newtabbtnContextMenu");
    });
    observer2.observe(new_tab_button,{attributes:true});
    

    const default_new_tab_button_popup = document.getElementById("new-tab-button-popup");
    
    function shift_default_menu(){
        if (default_new_tab_button_popup.getAttribute("onpopupshowing") == "return CreateContainerTabMenu(event);" )
        {
            default_new_tab_button_popup.setAttribute("onpopupshowing", "CreateContainerTabMenu_mod(event);" )
        }   
    }
    shift_default_menu();
    
    
    var observer_dealwith_default = new MutationObserver(function(){
        observer_dealwith_default.disconnect();

        shift_default_menu();
        
        observer_dealwith_default.observe(default_new_tab_button_popup, {attributes:true} );
    });
    observer_dealwith_default.observe(default_new_tab_button_popup, {attributes:true} );
    
    
})();




function CreateContainerTabMenu_mod(event) {
    CreateContainerTabMenu(event);
    
    event.target.appendChild(document.createXULElement("menuseparator"));
    
    var btn_newtab = document.createXULElement("menuitem");
    btn_newtab.setAttribute("label", 'New tab');
    btn_newtab.setAttribute("oncommand", "BrowserOpenTab()");

    event.target.appendChild(btn_newtab);
    
    var btn_newtab_w_url_2 = document.createXULElement("menuitem");
    btn_newtab_w_url_2.id = "btn_newtab_w_url_2";
    btn_newtab_w_url_2.setAttribute("label", new_tab_url_label);
    btn_newtab_w_url_2.setAttribute("oncommand", "btn_newtab_w_url_click()");
    
    
    event.target.appendChild(btn_newtab_w_url_2);
    
    newtabbtnContextMenu_onpopupshowing();
    
}
